"""
Chat API
提供 SSE 流式对话接口
"""
import json
import logging
from typing import Optional

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from sse_starlette.sse import EventSourceResponse

from ai_hub.agent.agent import get_or_create_session, clear_session
from ai_hub.llm.provider import registry
from ai_hub.config import settings

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/chat", tags=["chat"])


class ChatRequest(BaseModel):
    # PRD v3.5 MC-SESS2：conversationId（session_id）缺省时回落 "default" 会话，
    # 兼容既有单会话调用（不传 conversationId 时所有消息进入默认会话，行为不变）
    session_id: Optional[str] = "default"
    message: str
    mode: str = "general"  # template | config | general
    provider: Optional[str] = None
    attachments: Optional[list[dict]] = None
    autonomy_mode: str = "semi_auto"
    project_name: Optional[str] = None


class ProviderInfo(BaseModel):
    name: str
    model: str
    enabled: bool
    is_default: bool


class ProviderListResponse(BaseModel):
    providers: list[ProviderInfo]
    default: str


class HealthResponse(BaseModel):
    status: str
    version: str
    providers: list[ProviderInfo]


@router.get("/health", response_model=HealthResponse)
async def health_check():
    """健康检查接口"""
    return HealthResponse(
        status="ok",
        version="1.0.0",
        providers=[
            ProviderInfo(**p) for p in registry.list_providers()
        ],
    )


@router.get("/providers", response_model=ProviderListResponse)
async def list_providers():
    """获取可用 Provider 列表"""
    return ProviderListResponse(
        providers=[
            ProviderInfo(**p) for p in registry.list_providers()
        ],
        default=settings.default_provider,
    )


@router.post("/send")
async def send_message(req: ChatRequest):
    """发送消息，SSE 流式响应"""

    # M-F4（PRD v3.6 F4-1/F4-2）：控制消息优先——前端受限于 electron IPC 通道不可扩展，
    # 经既有 /send 通道转发「摘要上下文 / 截断」请求（truncate 无需 provider，故在 provider 校验前处理）
    ctrl = _parse_control_message(req.message)
    if ctrl:
        return await _run_control_message(req, ctrl)

    provider = registry.get(req.provider)
    if not provider:
        raise HTTPException(
            status_code=400,
            detail=f"Provider '{req.provider or settings.default_provider}' 不可用，请先配置 API Key",
        )

    # conversationId（session_id）缺省时回落默认会话（兼容既有单会话）
    session = get_or_create_session(req.session_id or "default")
    session.set_provider(req.provider)
    # 带入客户端当前选中的项目名，让 AI 感知项目上下文（记忆/校验/系统提示词）
    session.set_mode(req.mode, req.project_name or "")
    session.autonomy_mode = req.autonomy_mode

    session.add_user_message(req.message, req.attachments)

    async def event_generator():
        try:
            async for chunk in session.run_stream():
                yield {
                    "event": "message",
                    "data": json.dumps({"content": chunk}, ensure_ascii=False),
                }
        except Exception as e:
            logger.error(f"SSE error: {e}")
            yield {
                "event": "error",
                "data": json.dumps({"error": str(e)}, ensure_ascii=False),
            }
        finally:
            yield {
                "event": "done",
                "data": json.dumps({"status": "completed"}, ensure_ascii=False),
            }

    return EventSourceResponse(event_generator())


class SaveSkillRequest(BaseModel):
    name: str
    content: str


@router.post("/skill/save")
async def save_skill(req: SaveSkillRequest):
    """保存 Skill"""
    from ai_hub.skills.engine import get_skills_engine
    engine = get_skills_engine()
    skill = engine.save_skill(req.name, req.content)
    return {"status": "ok", "name": skill.name}


class DeleteSkillRequest(BaseModel):
    name: str


@router.post("/skill/delete")
async def delete_skill(req: DeleteSkillRequest):
    """删除 Skill（与 save 对称）"""
    from ai_hub.skills.engine import get_skills_engine
    engine = get_skills_engine()
    deleted = engine.delete_skill(req.name)
    return {"status": "ok", "deleted": deleted}


@router.post("/clear")
async def clear_chat(session_id: str):
    """清除会话"""
    clear_session(session_id)
    return {"status": "ok"}


# ===== M-F4（PRD v3.6）：MC 上下文压缩——会话内手动摘要 / 长会话上限截断 =====

_SUMMARIZE_SYSTEM_PROMPT = (
    "你是对话摘要助手。请用简短、结构化的中文总结以下对话的核心内容、已完成事项、"
    "关键上下文与未完成事项，便于后续继续对话。控制在 300 字以内。"
)

# 前端经既有 /send 通道转发的控制消息前缀（electron IPC 不可扩展，复用 chat 通道）
_CTRL_SUMMARIZE = "@@MC_SUMMARIZE@@"
_CTRL_TRUNCATE_PREFIX = "@@MC_TRUNCATE@@:"


def _session_history_text(session) -> str:
    """将会话 history 消息列表转为纯文本（供摘要生成）"""
    lines = []
    for m in session.messages:
        role = m.get("role", "")
        content = m.get("content") or ""
        if isinstance(content, (list, dict)):
            content = json.dumps(content, ensure_ascii=False)
        label = {"user": "用户", "assistant": "AI", "system": "系统", "tool": "工具"}.get(role, role)
        lines.append(f"{label}: {content}")
    return "\n".join(lines)


async def _generate_summary(provider, history_text: str) -> str:
    """调用 provider 生成简短摘要（非流式）；模型失败/返回错误文本时抛异常"""
    summary = await provider.chat(
        messages=[{"role": "user", "content": f"请摘要以下对话：\n\n{history_text}"}],
        system_prompt=_SUMMARIZE_SYSTEM_PROMPT,
        temperature=0.3,
        max_tokens=600,
    )
    cleaned = (summary or "").strip()
    if not cleaned or cleaned.startswith("错误:"):
        raise RuntimeError(cleaned or "模型未返回有效摘要")
    return cleaned


def _parse_control_message(message: str) -> Optional[dict]:
    """解析 /send 中的控制消息（摘要/截断），非控制消息返回 None"""
    if message.startswith(_CTRL_SUMMARIZE):
        return {"kind": "summarize", "history_text": message[len(_CTRL_SUMMARIZE):].strip()}
    if message.startswith(_CTRL_TRUNCATE_PREFIX):
        raw = message[len(_CTRL_TRUNCATE_PREFIX):].strip()
        try:
            keep = int(raw)
        except ValueError:
            keep = 100
        return {"kind": "truncate", "keep": max(1, keep)}
    return None


def _sse_response(events: list[tuple[str, dict]]) -> EventSourceResponse:
    """构造一次性 SSE 响应（message/error → done）"""
    async def generator():
        for event, data in events:
            yield {"event": event, "data": json.dumps(data, ensure_ascii=False)}
    return EventSourceResponse(generator())


async def _run_control_message(req: ChatRequest, ctrl: dict):
    """处理 /send 控制消息：摘要/截断当前会话（控制消息本身不写入 history）"""
    session = get_or_create_session(req.session_id or "default")
    if ctrl["kind"] == "summarize":
        provider = registry.get(req.provider)
        if not provider:
            return _sse_response([
                ("error", {"error": f"Provider '{req.provider or settings.default_provider}' 不可用，请先配置 API Key"}),
                ("done", {"status": "completed"}),
            ])
        history_text = ctrl["history_text"] or _session_history_text(session)
        if not history_text.strip():
            return _sse_response([
                ("error", {"error": "没有可摘要的对话历史"}),
                ("done", {"status": "completed"}),
            ])
        try:
            summary = await _generate_summary(provider, history_text)
        except Exception as e:
            logger.error(f"summarize failed: {e}")
            return _sse_response([
                ("error", {"error": f"摘要生成失败: {e}"}),
                ("done", {"status": "completed"}),
            ])
        # 摘要替换会话 history（新对话语义）；控制消息本身不写入 history
        session.replace_history_with_summary(summary)
        return _sse_response([
            ("message", {"content": summary}),
            ("done", {"status": "completed"}),
        ])
    # truncate：无需 provider
    session.truncate_history(ctrl["keep"])
    return _sse_response([
        ("message", {"content": f"已截断会话，保留最近 {ctrl['keep']} 条消息"}),
        ("done", {"status": "completed"}),
    ])


class SummarizeRequest(BaseModel):
    session_id: Optional[str] = "default"
    message: Optional[str] = None
    provider: Optional[str] = None
    apply: bool = True


@router.post("/summarize")
async def summarize_chat(req: SummarizeRequest):
    """M-F4（F4-1）：生成会话历史摘要；apply=True（默认）时替换后端会话 history（新对话语义）

    - session_id 缺省回落 "default" 会话（兼容既有单会话）
    - message 缺省时使用会话内 history（否则以请求携带的历史文本为准）
    - 失败返回 4xx/5xx + 明确错误，不破坏会话
    """
    provider = registry.get(req.provider)
    if not provider:
        raise HTTPException(
            status_code=400,
            detail=f"Provider '{req.provider or settings.default_provider}' 不可用，请先配置 API Key",
        )
    session = get_or_create_session(req.session_id or "default")
    history_text = (req.message or "").strip() or _session_history_text(session)
    if not history_text.strip():
        raise HTTPException(status_code=400, detail="没有可摘要的对话历史")
    try:
        summary = await _generate_summary(provider, history_text)
    except Exception as e:
        logger.error(f"summarize failed: {e}")
        raise HTTPException(status_code=502, detail=f"摘要生成失败: {e}")
    if req.apply:
        session.replace_history_with_summary(summary)
    return {"status": "ok", "session_id": req.session_id or "default", "summary": summary, "applied": req.apply}


class TruncateRequest(BaseModel):
    session_id: Optional[str] = "default"
    keep: int = 100


@router.post("/truncate")
async def truncate_chat(req: TruncateRequest):
    """M-F4（F4-2）：按 session_id 截断会话 history，仅保留最近 keep 条（新对话语义）"""
    session = get_or_create_session(req.session_id or "default")
    before = len(session.messages)
    session.truncate_history(req.keep)
    return {
        "status": "ok",
        "session_id": req.session_id or "default",
        "kept": len(session.messages),
        "truncated": before - len(session.messages),
    }


class ConfigProvidersRequest(BaseModel):
    provider: str
    api_key: str
    model: Optional[str] = None
    base_url: Optional[str] = None
    # MC-401 修复：缺 models 声明导致 Pydantic v2 `req.models` 访问抛 AttributeError → /config 恒 500，
    # save_secrets/apply_secrets/init_providers 不执行 → 新 key 不落盘、registry 不刷新（对话仍用旧 key 401）
    models: Optional[list[str]] = None
    # MC-LOOP1：可选随 configure 链路一起持久化工具循环上限（provider 无关）
    max_tool_loop_rounds: Optional[int] = None


class GeneralConfigRequest(BaseModel):
    """MC-LOOP1：通用（provider 无关）AI 配置——目前含最大工具循环轮数"""

    max_tool_loop_rounds: int = 5


class SetDefaultRequest(BaseModel):
    provider: str


class TestConnectionRequest(BaseModel):
    provider: str
    api_key: str
    base_url: str
    model: str


class FetchModelsRequest(BaseModel):
    base_url: str
    api_key: str


@router.post("/test")
async def test_connection(req: TestConnectionRequest):
    """测试 Provider 连接"""
    import httpx

    try:
        headers = {
            "Authorization": f"Bearer {req.api_key}",
            "Content-Type": "application/json",
        }
        base_url = req.base_url.rstrip("/")

        async with httpx.AsyncClient(timeout=15.0) as client:
            resp = await client.post(
                f"{base_url}/chat/completions",
                headers=headers,
                json={
                    "model": req.model,
                    "messages": [{"role": "user", "content": "Hi"}],
                    "max_tokens": 5,
                },
            )
            if resp.status_code == 200:
                return {"status": "ok", "message": f"连接成功！模型 {req.model} 响应正常"}
            else:
                detail = ""
                try:
                    detail = resp.json().get("error", {}).get("message", resp.text[:200])
                except Exception:
                    detail = resp.text[:200]
                return {"status": "error", "message": f"HTTP {resp.status_code}: {detail}"}
    except httpx.ConnectError:
        return {"status": "error", "message": f"无法连接到 {req.base_url}，请检查 Base URL 是否正确"}
    except httpx.TimeoutException:
        return {"status": "error", "message": "连接超时，请检查网络或 Base URL"}
    except Exception as e:
        return {"status": "error", "message": str(e)}


@router.post("/models")
async def fetch_models(req: FetchModelsRequest):
    """获取可用模型列表"""
    import httpx

    try:
        headers = {
            "Authorization": f"Bearer {req.api_key}",
        }
        base_url = req.base_url.rstrip("/")

        async with httpx.AsyncClient(timeout=10.0) as client:
            resp = await client.get(
                f"{base_url}/models",
                headers=headers,
            )
            if resp.status_code == 200:
                data = resp.json()
                models = [m["id"] for m in data.get("data", [])]
                models.sort()
                return {"status": "ok", "models": models}
            else:
                return {"status": "error", "models": [], "message": f"HTTP {resp.status_code}"}
    except Exception as e:
        return {"status": "error", "models": [], "message": str(e)}


@router.post("/config")
async def configure_provider(req: ConfigProvidersRequest):
    """配置 Provider 的 API Key"""
    from ai_hub.config import save_secrets, load_secrets

    secrets = load_secrets()
    entry = {
        "api_key": req.api_key,
        "model": req.model or "",
        "base_url": req.base_url or "",
    }
    # M2: 模型列表持久化回写（保留已拉取的最新模型）
    if req.models:
        entry["models"] = req.models
    secrets[req.provider] = entry
    # MC-LOOP1：随 configure 链路可选持久化工具循环上限（provider 无关）
    if req.max_tool_loop_rounds is not None:
        from ai_hub.config import set_max_tool_loop_rounds
        set_max_tool_loop_rounds(req.max_tool_loop_rounds)
    save_secrets(secrets)

    from ai_hub.config import apply_secrets
    apply_secrets()

    from ai_hub.llm.provider import init_providers
    init_providers()

    return {"status": "ok", "provider": req.provider}


@router.post("/config/general")
async def configure_general(req: GeneralConfigRequest):
    """MC-LOOP1：设置通用（provider 无关）AI 配置——最大工具循环轮数（clamp 1-10，默认 5）

    持久化到既有 secrets 结构并立即生效；后端 agent 每 send 实时读取该值。
    """
    from ai_hub.config import set_max_tool_loop_rounds

    rounds = set_max_tool_loop_rounds(req.max_tool_loop_rounds)
    return {"status": "ok", "max_tool_loop_rounds": rounds}


@router.post("/config/default")
async def set_default_provider(req: SetDefaultRequest):
    """设置默认 Provider"""
    from ai_hub.config import save_secrets, load_secrets

    secrets = load_secrets()
    secrets["default_provider"] = req.provider
    save_secrets(secrets)

    from ai_hub.config import apply_secrets
    apply_secrets()

    return {"status": "ok", "default_provider": req.provider}