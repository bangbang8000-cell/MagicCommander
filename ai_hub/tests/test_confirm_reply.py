"""4.3 F3-2（测试计划 A-3）：确认流完善后端——确认卡片可编辑参数（@@MC_CONFIRM_REPLY@@）

覆盖：
- _parse_control_message 识别确认控制消息
- _decode_confirm_reply 解码（标准/urlsafe base64，与前端 btoa 兼容）
- _run_confirm_reply：无待确认操作时返回可读错误；有待确认时按新参数执行
"""
import asyncio
import base64
import json
import os
import sys
from unittest.mock import AsyncMock, patch

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))))

from ai_hub.api.chat import (
    _parse_control_message,
    _decode_confirm_reply,
    _run_confirm_reply,
    _CTRL_CONFIRM_REPLY,
)
from ai_hub.agent.agent import get_or_create_session, clear_session


def _run(coro):
    return asyncio.run(coro)


def _encode(payload: dict) -> str:
    return base64.b64encode(json.dumps(payload, ensure_ascii=False).encode("utf-8")).decode("utf-8")


async def _collect_sse(resp):
    """收集 SSE 事件（body_iterator 产出事件字典），返回 event 名与 data 拼接文本"""
    parts = []
    async for chunk in resp.body_iterator:
        event = chunk.get("event", "")
        data = chunk.get("data", "")
        parts.append(f"event={event}; data={data}")
    return "\n".join(parts)


# ---- _parse_control_message ----

def test_parse_confirm_reply_control():
    encoded = _encode({"tool": "delete_files", "args": {"projectName": "p"}})
    ctrl = _parse_control_message(f"{_CTRL_CONFIRM_REPLY}{encoded}")
    assert ctrl is not None
    assert ctrl["kind"] == "confirm_reply"
    assert ctrl["encoded"] == encoded


def test_parse_plain_message_not_control():
    assert _parse_control_message("确认") is None
    assert _parse_control_message("普通消息") is None


# ---- _decode_confirm_reply ----

def test_decode_confirm_reply_roundtrip():
    payload = {"tool": "delete_files", "args": {"projectName": "projA", "fileType": "output"}}
    encoded = _encode(payload)
    assert _decode_confirm_reply(encoded) == payload


def test_decode_confirm_reply_utf8():
    payload = {"tool": "update_project", "args": {"projectName": "测试项目", "description": "中文描述"}}
    encoded = _encode(payload)
    assert _decode_confirm_reply(encoded) == payload


def test_decode_confirm_reply_invalid():
    assert _decode_confirm_reply("not-a-valid-b64@@@") is None
    assert _decode_confirm_reply("") is None


# ---- _run_confirm_reply ----

def test_confirm_reply_no_pending_readable_error():
    clear_session("confirm-no-pending")
    body = _run(_collect_sse(_run(_run_confirm_reply("confirm-no-pending", _encode({"tool": "x"})))))
    assert "没有待确认的操作" in body


def test_confirm_reply_executes_with_edited_args():
    clear_session("confirm-edit")
    session = get_or_create_session("confirm-edit")
    # 原始待确认参数
    session.pending_confirmation = {
        "name": "delete_files",
        "args": {"projectName": "projA", "fileType": "output"},
    }
    # 用户编辑后的新参数
    payload = {"tool": "delete_files", "args": {"projectName": "projB", "fileType": "yaml"}}
    fake_execute = AsyncMock(return_value={"success": True, "result": json.dumps({"status": "ok"})})
    with patch("ai_hub.agent.tools.execute_tool", new=fake_execute):
        body = _run(_collect_sse(_run(_run_confirm_reply("confirm-edit", _encode(payload)))))
    fake_execute.assert_awaited_once_with("delete_files", {"projectName": "projB", "fileType": "yaml"})
    assert "delete_files" in body
    assert session.pending_confirmation is None
    clear_session("confirm-edit")


def test_confirm_reply_falls_back_to_original_args():
    clear_session("confirm-fallback")
    session = get_or_create_session("confirm-fallback")
    session.pending_confirmation = {
        "name": "delete_files",
        "args": {"projectName": "origProj", "fileType": "output"},
    }
    # 编辑消息只带 tool、不带 args → 回落到原始参数
    payload = {"tool": "delete_files"}
    fake_execute = AsyncMock(return_value={"success": True, "result": json.dumps({"status": "ok"})})
    with patch("ai_hub.agent.tools.execute_tool", new=fake_execute):
        _run(_collect_sse(_run(_run_confirm_reply("confirm-fallback", _encode(payload)))))
    fake_execute.assert_awaited_once_with("delete_files", {"projectName": "origProj", "fileType": "output"})
    clear_session("confirm-fallback")
