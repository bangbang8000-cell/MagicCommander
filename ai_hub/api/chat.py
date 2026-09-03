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
from ai_hub.agent.provider import (
    AgentNotAvailableError,
    ENGINE_OWN,
    ENGINE_NA_MARKER,
    engine_status,
    get_engine,
    resolve_engine_mode,
)

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
    # 5.0.2-F502-2：AI 引擎（own/hermes/auto），缺省用配置 ai_engine
    engine: Optional[str] = None
    # 5.0.3-503-a：多步任务编排 workflow 模式（on/off，缺省 off；仅自有引擎生效）
    workflow: str = "off"


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


class SetEngineRequest(BaseModel):
    engine: str


@router.get("/engine")
async def get_engine_info():
    """5.0.2-F502-2：获取 AI 引擎配置与可用性（own/hermes/auto）

    返回当前配置 engine、实际解析 resolved（auto 的实际路由）与各引擎可用性 available。
    """
    return engine_status()


@router.post("/engine")
async def set_engine(req: SetEngineRequest):
    """5.0.2-F502-2：设置 AI 引擎模式（三选一，持久化到 secrets 文件并立即生效）"""
    from ai_hub.config import set_ai_engine
    set_ai_engine(req.engine)
    return {"status": "ok", **engine_status()}


@router.post("/send")
async def send_message(req: ChatRequest):
    """发送消息，SSE 流式响应

    5.0.2-F502-2：请求可带 engine 字段（own/hermes/auto），缺省用配置 ai_engine；
    Hermes 未安装时返回携带 ---ENGINE_NA:hermes--- 标记的友好 message 事件（前端渲染提示卡片）。
    """
    # 解析当前引擎模式（缺省用配置）
    engine_mode = resolve_engine_mode(req.engine)

    # M-F4（PRD v3.6 F4-1/F4-2）：控制消息优先——前端受限于 electron IPC 通道不可扩展，
    # 经既有 /send 通道转发「摘要上下文 / 截断」请求（truncate 无需 provider，故在 provider 校验前处理）
    ctrl = _parse_control_message(req.message)
    if ctrl:
        return await _run_control_message(req, ctrl, engine_mode)

    engine = get_engine(engine_mode)
    # F502-3：Hermes 未安装 → 友好提示（SSE message 事件携带 ENGINE_NA 标记，前端渲染提示卡片）
    if not engine.is_available():
        hint = engine.not_available_hint() or f"AI 引擎 {engine_mode} 不可用"
        return _sse_response([
            ("message", {"content": _engine_na_message(engine_mode, hint)}),
            ("done", {"status": "completed"}),
        ])

    session_id = req.session_id or "default"

    # 自有引擎沿用既有 provider 校验（未配置 API key 时 400）；Hermes 引擎由自身运行时驱动
    if engine.engine_name == ENGINE_OWN:
        provider = registry.get(req.provider)
        if not provider:
            raise HTTPException(
                status_code=400,
                detail=f"Provider '{req.provider or settings.default_provider}' 不可用，请先配置 API Key",
            )

    # 5.0.3-503-a：workflow 模式开启时在会话上标记（引擎维度命名空间，任务上下文随会话保留）。
    # 仅自有引擎生效（Hermes 路径零改动；多步编排只对自有引擎驱动）。
    if req.workflow == "on" and engine.engine_name == ENGINE_OWN:
        get_or_create_session(session_id, engine=engine.engine_name).workflow = "on"

    async def event_generator():
        try:
            async for chunk in engine.stream_chat(
                session_id=session_id,
                message=req.message,
                mode=req.mode,
                project_name=req.project_name or "",
                autonomy_mode=req.autonomy_mode,
                provider=req.provider,
                attachments=req.attachments,
            ):
                yield {
                    "event": "message",
                    "data": json.dumps({"content": chunk}, ensure_ascii=False),
                }
        except AgentNotAvailableError as e:
            logger.error(f"SSE engine unavailable: {e}")
            yield {
                "event": "message",
                "data": json.dumps({"content": _engine_na_message(engine_mode, str(e))}, ensure_ascii=False),
            }
        except Exception as e:
            logger.error(f"SSE error: {e}")
            yield {
                "event": "error",
                "data": json.dumps({"error": str(e)}, ensure_ascii=False),
            }
        finally:
            # 5.0.3-503-a：done 事件透传工作流任务状态快照（前端展示 plan→step→verify 徽标）
            done_payload = {"status": "completed"}
            try:
                if engine.engine_name == ENGINE_OWN:
                    sess = get_or_create_session(session_id, engine=engine.engine_name)
                    wf = getattr(sess, "workflow_state", None)
                    if wf is not None and hasattr(wf, "snapshot"):
                        done_payload["workflow"] = wf.snapshot()
            except Exception:
                pass
            yield {
                "event": "done",
                "data": json.dumps(done_payload, ensure_ascii=False),
            }

    return EventSourceResponse(event_generator())


def _engine_na_message(engine: str, hint: str) -> str:
    """组装「引擎未安装」友好提示文本：独立标记行 + 安装指引（前端渲染提示卡片）"""
    return f"{ENGINE_NA_MARKER.format(engine=engine)}\n\n{hint}"


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
async def clear_chat(session_id: str, engine: Optional[str] = None):
    """清除会话（5.0.2-F502-2：按引擎维度命名空间清除，缺省用配置 ai_engine）"""
    engine_mode = resolve_engine_mode(engine)
    clear_session(session_id, engine=engine_mode)
    return {"status": "ok"}


# ===== M-F4（PRD v3.6）：MC 上下文压缩——会话内手动摘要 / 长会话上限截断 =====

_SUMMARIZE_SYSTEM_PROMPT = (
    "你是对话摘要助手。请用简短、结构化的中文总结以下对话的核心内容、已完成事项、"
    "关键上下文与未完成事项，便于后续继续对话。控制在 300 字以内。"
)

# 前端经既有 /send 通道转发的控制消息前缀（electron IPC 不可扩展，复用 chat 通道）
_CTRL_SUMMARIZE = "@@MC_SUMMARIZE@@"
_CTRL_TRUNCATE_PREFIX = "@@MC_TRUNCATE@@:"
# 4.3 F3-2：确认卡片可编辑参数——确认时携带修改后的工具参数（b64）
_CTRL_CONFIRM_REPLY = "@@MC_CONFIRM_REPLY@@"


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
    """解析 /send 中的控制消息（摘要/截断/确认参数），非控制消息返回 None"""
    if message.startswith(_CTRL_SUMMARIZE):
        return {"kind": "summarize", "history_text": message[len(_CTRL_SUMMARIZE):].strip()}
    if message.startswith(_CTRL_TRUNCATE_PREFIX):
        raw = message[len(_CTRL_TRUNCATE_PREFIX):].strip()
        try:
            keep = int(raw)
        except ValueError:
            keep = 100
        return {"kind": "truncate", "keep": max(1, keep)}
    if message.startswith(_CTRL_CONFIRM_REPLY):
        encoded = message[len(_CTRL_CONFIRM_REPLY):].strip()
        return {"kind": "confirm_reply", "encoded": encoded}
    return None


def _decode_confirm_reply(encoded: str) -> Optional[dict]:
    """解码确认控制消息参数（标准/urlsafe base64 均兼容）；非法返回 None"""
    import base64
    try:
        normalized = encoded.replace("-", "+").replace("_", "/")
        padded = normalized + "=" * (-len(normalized) % 4)
        raw = base64.b64decode(padded.encode("utf-8"))
        data = json.loads(raw.decode("utf-8"))
        if isinstance(data, dict):
            return data
    except Exception:
        pass
    return None


def _sse_response(events: list[tuple[str, dict]]) -> EventSourceResponse:
    """构造一次性 SSE 响应（message/error → done）"""
    async def generator():
        for event, data in events:
            yield {"event": event, "data": json.dumps(data, ensure_ascii=False)}
    return EventSourceResponse(generator())


async def _run_control_message(req: ChatRequest, ctrl: dict, engine_mode: str = ENGINE_OWN):
    """处理 /send 控制消息：摘要/截断当前会话（控制消息本身不写入 history）"""
    # 会话隔离：控制消息同样落在当前引擎命名空间的会话上（切换引擎后各引擎会话独立保留）
    session = get_or_create_session(req.session_id or "default", engine=engine_mode)
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
    # confirm_reply：确认卡片可编辑参数——按新参数执行待确认工具
    if ctrl["kind"] == "confirm_reply":
        return await _run_confirm_reply(req.session_id or "default", ctrl["encoded"], engine_mode)
    # truncate：无需 provider
    session.truncate_history(ctrl["keep"])
    return _sse_response([
        ("message", {"content": f"已截断会话，保留最近 {ctrl['keep']} 条消息"}),
        ("done", {"status": "completed"}),
    ])


async def _run_confirm_reply(session_id: str, encoded: str, engine_mode: str = ENGINE_OWN) -> EventSourceResponse:
    """4.3 F3-2：确认卡片可编辑参数——按新参数执行待确认工具（控制消息不写入 history）"""
    from ai_hub.agent.tools import execute_tool

    session = get_or_create_session(session_id, engine=engine_mode)
    if not getattr(session, "pending_confirmation", None):
        return _sse_response([
            ("error", {"error": "没有待确认的操作，无法确认执行"}),
            ("done", {"status": "completed"}),
        ])
    payload = _decode_confirm_reply(encoded)
    if payload is None or not payload.get("tool"):
        return _sse_response([
            ("error", {"error": "确认参数解析失败，请重新操作"}),
            ("done", {"status": "completed"}),
        ])
    tool_name = payload["tool"]
    # 修改后的参数优先；未提供时回落到待确认参数的原始参数
    args = payload.get("args") or session.pending_confirmation.get("args") or {}
    session.pending_confirmation = None
    result = await execute_tool(tool_name, args)
    result_json = json.dumps(result, ensure_ascii=False)
    session.add_message("assistant", f"✅ 已确认并按新参数执行工具: `{tool_name}`")
    session.add_message("tool", result_json, {"tool_call_id": f"confirm_{session_id[:8]}"})
    return _sse_response([
        ("message", {"content": f"> ✅ 已确认执行 `{tool_name}`（使用新参数）:\n```json\n{result_json}\n```"}),
        ("done", {"status": "completed"}),
    ])


class SummarizeRequest(BaseModel):
    session_id: Optional[str] = "default"
    message: Optional[str] = None
    provider: Optional[str] = None
    apply: bool = True
    # 5.0.2-F502-2：AI 引擎（own/hermes/auto），缺省用配置 ai_engine（会话按引擎隔离）
    engine: Optional[str] = None


@router.post("/summarize")
async def summarize_chat(req: SummarizeRequest):
    """M-F4（F4-1）：生成会话历史摘要；apply=True（默认）时替换后端会话 history（新对话语义）

    - session_id 缺省回落 "default" 会话（兼容既有单会话）
    - message 缺省时使用会话内 history（否则以请求携带的历史文本为准）
    - 失败返回 4xx/5xx + 明确错误，不破坏会话
    """
    engine_mode = resolve_engine_mode(req.engine)
    provider = registry.get(req.provider)
    if not provider:
        raise HTTPException(
            status_code=400,
            detail=f"Provider '{req.provider or settings.default_provider}' 不可用，请先配置 API Key",
        )
    session = get_or_create_session(req.session_id or "default", engine=engine_mode)
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
    # 5.0.2-F502-2：AI 引擎（own/hermes/auto），缺省用配置 ai_engine（会话按引擎隔离）
    engine: Optional[str] = None


@router.post("/truncate")
async def truncate_chat(req: TruncateRequest):
    """M-F4（F4-2）：按 session_id 截断会话 history，仅保留最近 keep 条（新对话语义）"""
    engine_mode = resolve_engine_mode(req.engine)
    session = get_or_create_session(req.session_id or "default", engine=engine_mode)
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


# ===== 5.0.3-503-c：MCP server 管理端点 =====

class MCPAddServerRequest(BaseModel):
    name: str
    command: str
    args: Optional[list[str]] = None
    env: Optional[dict] = None


@router.get("/mcp/servers")
async def mcp_list_servers():
    """列出全部 MCP server（含运行状态与已发现工具数）"""
    from ai_hub.mcp.manager import get_mcp_manager
    return {"status": "ok", "servers": get_mcp_manager().list_servers()}


@router.post("/mcp/servers")
async def mcp_add_server(req: MCPAddServerRequest):
    """新增/更新 MCP server 配置（持久化 <workspace>/.mc_mcp_config.json）"""
    from ai_hub.mcp.manager import get_mcp_manager
    return get_mcp_manager().add_server(req.name, req.command, req.args, req.env)


@router.delete("/mcp/servers/{name}")
async def mcp_remove_server(name: str):
    """移除 MCP server 配置（在运行则先停止并注销工具）"""
    from ai_hub.mcp.manager import get_mcp_manager
    return get_mcp_manager().remove_server(name)


@router.get("/mcp/servers/{name}/tools")
async def mcp_server_tools(name: str):
    """获取指定 MCP server 已发现工具清单"""
    from ai_hub.mcp.manager import get_mcp_manager
    return {"status": "ok", "server": name, "tools": get_mcp_manager().get_tools(name)}


@router.post("/mcp/servers/{name}/start")
async def mcp_start_server(name: str):
    """启动 MCP server：拉起 stdio 子进程 → 发现工具 → 注册进 Agent 工具表（own/hermes 共享）"""
    from ai_hub.mcp.manager import get_mcp_manager
    return await get_mcp_manager().start_server(name)


@router.post("/mcp/servers/{name}/stop")
async def mcp_stop_server(name: str):
    """停止 MCP server：关闭子进程并注销其注册工具"""
    from ai_hub.mcp.manager import get_mcp_manager
    return await get_mcp_manager().stop_server(name)


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