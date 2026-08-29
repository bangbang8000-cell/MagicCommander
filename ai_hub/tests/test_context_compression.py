"""M-F4 MC 上下文压缩（裁剪版）后端测试：/summarize、/truncate 与 /send 控制消息转发

覆盖（PRD v3.6 F4-1 / F4-2）：
- /summarize：缺省 session_id 兼容、message 缺省用会话 history、apply 替换/保留开关、
  无历史 400、provider 不可用 400、模型返回错误 502
- /truncate：按 session_id 截断保留最近 N 条、keep 超长 no-op
- /send 控制消息（@@MC_SUMMARIZE@@ / @@MC_TRUNCATE@@:N）：复用既有 chat 通道，
  供前端在 electron IPC 不可扩展的情况下调用后端压缩能力（不污染会话 history）
"""
import json
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))))

from fastapi import FastAPI
from fastapi.testclient import TestClient

from ai_hub.agent.agent import get_or_create_session, _sessions
from ai_hub.api.chat import router as chat_router
from ai_hub.llm.provider import registry

MOCK_PROVIDER = "mock_compress_test"
MOCK_SUMMARY = "对话摘要：已完成 X"


class MockCompressProvider:
    """mock provider：chat 返回固定摘要；chat_stream 用于普通 send 场景"""

    def __init__(self, summary=MOCK_SUMMARY):
        self._summary = summary
        self.last_reasoning_content = ""

    async def chat(self, messages, system_prompt="", temperature=0.7, max_tokens=4096):
        return self._summary

    async def chat_stream(self, messages, system_prompt="", temperature=0.7, max_tokens=4096):
        for c in ["ok"]:
            yield c


class RaisingProvider(MockCompressProvider):
    async def chat(self, *args, **kwargs):
        raise RuntimeError("模型调用崩溃")


def _build_app():
    app = FastAPI(title="Test AI Hub")
    app.include_router(chat_router)
    return app


def _register(provider=None):
    p = provider or MockCompressProvider()
    registry.register(MOCK_PROVIDER, p)
    return p


def _unregister():
    registry._providers.pop(MOCK_PROVIDER, None)
    _sessions.clear()


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


# ===== /summarize =====

def test_summarize_default_session_replaces_history():
    _register()
    try:
        session = get_or_create_session("default")
        session.add_user_message("先对话一")
        session.add_message("assistant", "回复一")
        with TestClient(_build_app()) as client:
            resp = client.post("/api/chat/summarize", json={"provider": MOCK_PROVIDER})
        assert resp.status_code == 200
        body = resp.json()
        assert body["status"] == "ok"
        assert body["summary"] == MOCK_SUMMARY
        assert body["applied"] is True
        # 缺省 session_id 回落 default 会话，history 已被摘要替换（新对话语义）
        assert len(session.messages) == 1
        assert MOCK_SUMMARY in session.messages[0]["content"]
    finally:
        _unregister()


def test_summarize_apply_false_keeps_history():
    _register()
    try:
        session = get_or_create_session("apply-false")
        session.add_user_message("问题一")
        with TestClient(_build_app()) as client:
            resp = client.post(
                "/api/chat/summarize",
                json={"session_id": "apply-false", "provider": MOCK_PROVIDER, "apply": False},
            )
        assert resp.status_code == 200
        assert resp.json()["applied"] is False
        # 保留开关：后端 history 不被替换
        assert len(session.messages) == 1
        assert session.messages[0]["content"] == "问题一"
    finally:
        _unregister()


def test_summarize_uses_provided_message():
    _register()
    try:
        with TestClient(_build_app()) as client:
            resp = client.post(
                "/api/chat/summarize",
                json={
                    "session_id": "msg-provided",
                    "provider": MOCK_PROVIDER,
                    "message": "用户：你好\nAI：在的",
                },
            )
        assert resp.status_code == 200
        assert resp.json()["summary"] == MOCK_SUMMARY
    finally:
        _unregister()


def test_summarize_400_when_no_history():
    _register()
    try:
        with TestClient(_build_app()) as client:
            resp = client.post(
                "/api/chat/summarize",
                json={"session_id": "empty-sess", "provider": MOCK_PROVIDER},
            )
        assert resp.status_code == 400
        assert "没有可摘要" in resp.json()["detail"]
    finally:
        _unregister()


def test_summarize_400_when_provider_unavailable():
    _register()
    try:
        with TestClient(_build_app()) as client:
            resp = client.post(
                "/api/chat/summarize",
                json={"session_id": "x", "provider": "no_such_provider", "message": "用户：hi"},
            )
        assert resp.status_code == 400
        assert "不可用" in resp.json()["detail"]
    finally:
        _unregister()


def test_summarize_502_when_provider_returns_error_text():
    _register(MockCompressProvider(summary="错误: API key invalid"))
    try:
        with TestClient(_build_app()) as client:
            resp = client.post(
                "/api/chat/summarize",
                json={"session_id": "err", "provider": MOCK_PROVIDER, "message": "用户：hi"},
            )
        assert resp.status_code == 502
        assert "摘要生成失败" in resp.json()["detail"]
    finally:
        _unregister()


def test_summarize_502_when_provider_raises():
    _register(RaisingProvider())
    try:
        with TestClient(_build_app()) as client:
            resp = client.post(
                "/api/chat/summarize",
                json={"session_id": "raise", "provider": MOCK_PROVIDER, "message": "用户：hi"},
            )
        assert resp.status_code == 502
        assert "摘要生成失败" in resp.json()["detail"]
    finally:
        _unregister()


# ===== /truncate =====

def test_truncate_keeps_recent_n():
    _register()
    try:
        session = get_or_create_session("trunc-1")
        for i in range(10):
            session.add_user_message(f"问题{i}")
        with TestClient(_build_app()) as client:
            resp = client.post("/api/chat/truncate", json={"session_id": "trunc-1", "keep": 3})
        assert resp.status_code == 200
        body = resp.json()
        assert body["kept"] == 3
        assert body["truncated"] == 7
        assert len(session.messages) == 3
        assert session.messages[0]["content"] == "问题7"
    finally:
        _unregister()


def test_truncate_keep_exceeding_length_noop():
    _register()
    try:
        session = get_or_create_session("trunc-2")
        session.add_user_message("只有一条")
        with TestClient(_build_app()) as client:
            resp = client.post("/api/chat/truncate", json={"session_id": "trunc-2"})
        assert resp.status_code == 200
        assert resp.json()["kept"] == 1
        assert resp.json()["truncated"] == 0
        assert len(session.messages) == 1
    finally:
        _unregister()


def test_truncate_default_session_compat():
    _register()
    try:
        session = get_or_create_session("default")
        for i in range(5):
            session.add_user_message(f"问题{i}")
        with TestClient(_build_app()) as client:
            resp = client.post("/api/chat/truncate", json={"keep": 2})
        assert resp.status_code == 200
        assert resp.json()["kept"] == 2
        assert len(session.messages) == 2
    finally:
        _unregister()


# ===== /send 控制消息转发（复用既有 chat 通道）=====

def test_send_control_summarize_streams_summary_and_replaces_history():
    _register()
    try:
        session = get_or_create_session("ctrl-sum")
        session.add_user_message("原始问题")
        session.add_message("assistant", "原始回复")
        with TestClient(_build_app()) as client:
            resp = client.post(
                "/api/chat/send",
                json={
                    "session_id": "ctrl-sum",
                    "message": "@@MC_SUMMARIZE@@用户：原始问题\nAI：原始回复",
                    "mode": "general",
                    "provider": MOCK_PROVIDER,
                },
            )
        assert resp.status_code == 200
        frames = _parse_sse(resp.text)
        content = "".join(json.loads(f["data"])["content"] for f in frames if f["event"] == "message")
        assert content == MOCK_SUMMARY
        assert [f["event"] for f in frames][-1] == "done"
        # 控制消息本身不写入 history，history 被摘要替换
        assert len(session.messages) == 1
        assert MOCK_SUMMARY in session.messages[0]["content"]
    finally:
        _unregister()


def test_send_control_truncate_without_provider():
    _register()
    try:
        session = get_or_create_session("ctrl-trunc")
        for i in range(8):
            session.add_user_message(f"问题{i}")
        with TestClient(_build_app()) as client:
            # 不传 provider：truncate 无需模型
            resp = client.post(
                "/api/chat/send",
                json={"session_id": "ctrl-trunc", "message": "@@MC_TRUNCATE@@:3", "mode": "general"},
            )
        assert resp.status_code == 200
        assert [f["event"] for f in _parse_sse(resp.text)][-1] == "done"
        assert len(session.messages) == 3
        assert session.messages[0]["content"] == "问题5"
    finally:
        _unregister()


def test_send_control_summarize_without_provider_returns_error_event():
    _register()
    try:
        with TestClient(_build_app()) as client:
            resp = client.post(
                "/api/chat/send",
                json={
                    "session_id": "ctrl-no-provider",
                    "message": "@@MC_SUMMARIZE@@用户：hi",
                    "mode": "general",
                    "provider": "no_such_provider",
                },
            )
        assert resp.status_code == 200
        frames = _parse_sse(resp.text)
        err = [f for f in frames if f["event"] == "error"]
        assert len(err) == 1
        assert "不可用" in json.loads(err[0]["data"])["error"]
    finally:
        _unregister()


def test_send_normal_message_not_affected_by_control_parser():
    _register()
    try:
        with TestClient(_build_app()) as client:
            resp = client.post(
                "/api/chat/send",
                json={
                    "session_id": "normal-msg",
                    "message": "普通消息不触发控制",
                    "mode": "general",
                    "provider": MOCK_PROVIDER,
                },
            )
        assert resp.status_code == 200
        assert [f["event"] for f in _parse_sse(resp.text)][-1] == "done"
    finally:
        _unregister()
