"""AI Hub SSE 流式接口测试：/api/chat/send 事件契约（message→done / error→done）与本地鉴权

覆盖维度（PRD v3.0 AI-6 / 流式对话 / 权限）：
- SSE 事件契约：正常流 message 事件逐 chunk 推送，最终 done 事件
- 错误流：run_stream 抛出未捕获异常时走 error 事件，随后 done 事件
- 鉴权：配置 auth_token 后无/错误 X-MC-Auth-Token 返回 401；正确 token 通过
- provider 不可用时返回 400
"""
import json
import os
import sys
from unittest import mock

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))))

from fastapi import FastAPI
from fastapi.responses import JSONResponse
from fastapi.testclient import TestClient

from ai_hub.agent.agent import AgentSession
from ai_hub.api.chat import router as chat_router
from ai_hub.config import settings
from ai_hub.llm.provider import registry

MOCK_PROVIDER_NAME = "mock_sse_test"


class MockStreamProvider:
    last_reasoning_content = ""

    def __init__(self, chunks):
        self._chunks = list(chunks)

    async def chat_stream(self, messages, system_prompt="", temperature=0.7, max_tokens=4096):
        for c in self._chunks:
            yield c


def _register_mock_provider(chunks):
    provider = MockStreamProvider(chunks)
    registry.register(MOCK_PROVIDER_NAME, provider)
    return provider


def _unregister_mock_provider():
    registry._providers.pop(MOCK_PROVIDER_NAME, None)


def _build_app(with_auth=False):
    app = FastAPI(title="Test AI Hub")
    if with_auth:
        @app.middleware("http")
        async def require_auth_token(request, call_next):
            token = request.headers.get("X-MC-Auth-Token", "")
            if token != settings.auth_token:
                return JSONResponse({"detail": "Unauthorized"}, status_code=401)
            return await call_next(request)
    app.include_router(chat_router)
    return app


def _parse_sse(text):
    """解析 SSE 文本（event/data 帧，兼容 CRLF），返回 [{event, data}]"""
    frames = []
    for block in text.replace("\r\n", "\n").split("\n\n"):
        block = block.strip()
        if not block:
            continue
        event = "message"
        data = []
        for line in block.split("\n"):
            if line.startswith("event:"):
                event = line.split(":", 1)[1].strip()
            elif line.startswith("data:"):
                data.append(line.split(":", 1)[1].strip())
        frames.append({"event": event, "data": "\n".join(data)})
    return frames


def _send_payload(session_id="sse-default", provider=MOCK_PROVIDER_NAME, **extra):
    payload = {
        "session_id": session_id,
        "message": "你好",
        "mode": "general",
        "provider": provider,
    }
    payload.update(extra)
    return payload


# --- 正常流：message → done ---

def test_sse_message_then_done_events():
    _register_mock_provider(["你好", "，世界"])
    try:
        app = _build_app()
        with TestClient(app) as client:
            resp = client.post("/api/chat/send", json=_send_payload(session_id="sse-ok"))
        assert resp.status_code == 200
        frames = _parse_sse(resp.text)
        events = [f["event"] for f in frames]
        assert "message" in events
        assert events[-1] == "done"
        content = "".join(
            json.loads(f["data"])["content"] for f in frames if f["event"] == "message"
        )
        assert content == "你好，世界"
    finally:
        _unregister_mock_provider()


# --- 错误流：run_stream 抛出未捕获异常 → error 事件 + done ---

def test_sse_error_event_when_run_stream_raises():
    _register_mock_provider(["不管"])
    try:
        async def _boom(self, *args, **kwargs):
            raise RuntimeError("模拟流式中断")
            yield  # noqa: B018 使其成为 async generator，迭代时抛异常

        app = _build_app()
        with mock.patch.object(AgentSession, "run_stream", _boom):
            with TestClient(app) as client:
                resp = client.post("/api/chat/send", json=_send_payload(session_id="sse-err"))
        assert resp.status_code == 200
        frames = _parse_sse(resp.text)
        events = [f["event"] for f in frames]
        assert events[-1] == "done"
        error_frames = [f for f in frames if f["event"] == "error"]
        assert len(error_frames) == 1
        assert json.loads(error_frames[0]["data"])["error"] == "模拟流式中断"
    finally:
        _unregister_mock_provider()


# --- 鉴权：401 / 通过 ---

def test_send_returns_401_without_token(monkeypatch):
    monkeypatch.setattr(settings, "auth_token", "secret-token")
    _register_mock_provider(["hi"])
    try:
        app = _build_app(with_auth=True)
        with TestClient(app) as client:
            resp = client.post("/api/chat/send", json=_send_payload(session_id="sse-auth-none"))
        assert resp.status_code == 401
        assert resp.json()["detail"] == "Unauthorized"
    finally:
        _unregister_mock_provider()


def test_send_returns_401_with_wrong_token(monkeypatch):
    monkeypatch.setattr(settings, "auth_token", "secret-token")
    _register_mock_provider(["hi"])
    try:
        app = _build_app(with_auth=True)
        with TestClient(app) as client:
            resp = client.post(
                "/api/chat/send",
                json=_send_payload(session_id="sse-auth-wrong"),
                headers={"X-MC-Auth-Token": "wrong"},
            )
        assert resp.status_code == 401
    finally:
        _unregister_mock_provider()


def test_send_returns_200_with_valid_token(monkeypatch):
    monkeypatch.setattr(settings, "auth_token", "secret-token")
    _register_mock_provider(["你好"])
    try:
        app = _build_app(with_auth=True)
        with TestClient(app) as client:
            resp = client.post(
                "/api/chat/send",
                json=_send_payload(session_id="sse-auth-ok"),
                headers={"X-MC-Auth-Token": "secret-token"},
            )
        assert resp.status_code == 200
        frames = _parse_sse(resp.text)
        assert [f["event"] for f in frames][-1] == "done"
    finally:
        _unregister_mock_provider()


# --- provider 不可用：400 ---

def test_send_returns_400_when_provider_unavailable():
    app = _build_app()
    with TestClient(app) as client:
        resp = client.post(
            "/api/chat/send",
            json=_send_payload(session_id="sse-no-provider", provider="no_such_provider"),
        )
    assert resp.status_code == 400
    assert "不可用" in resp.json()["detail"]
