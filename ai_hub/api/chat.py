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
    session_id: str
    message: str
    mode: str = "general"  # template | config | general
    provider: Optional[str] = None
    attachments: Optional[list[dict]] = None


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

    provider = registry.get(req.provider)
    if not provider:
        raise HTTPException(
            status_code=400,
            detail=f"Provider '{req.provider or settings.default_provider}' 不可用，请先配置 API Key",
        )

    session = get_or_create_session(req.session_id)
    session.set_provider(req.provider)
    session.set_mode(req.mode)

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


@router.post("/clear")
async def clear_chat(session_id: str):
    """清除会话"""
    clear_session(session_id)
    return {"status": "ok"}


class ConfigProvidersRequest(BaseModel):
    provider: str
    api_key: str
    model: Optional[str] = None
    base_url: Optional[str] = None


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
    secrets[req.provider] = {
        "api_key": req.api_key,
        "model": req.model or "",
        "base_url": req.base_url or "",
    }
    save_secrets(secrets)

    from ai_hub.config import apply_secrets
    apply_secrets()

    from ai_hub.llm.provider import init_providers
    init_providers()

    return {"status": "ok", "provider": req.provider}


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