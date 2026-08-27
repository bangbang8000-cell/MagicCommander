"""AI Hub 自主模式（autonomy）测试：AgentSession 在 autonomy_mode 下的工具确认/自动执行行为

覆盖维度（PRD v3.0 AI-6 / 自主模式）：
- semi_auto / auto：CONFIRM 权限工具需要用户确认，进入 pending_confirmation 分支，不执行
- full_auto：CONFIRM 权限工具直接执行，跳过确认
- AUTO 权限工具在任何模式下直接执行
- 确认闭环：用户回复"确认"后执行 pending 工具；回复"取消"后中止
"""
import asyncio
import os
import sys
from unittest import mock
from unittest.mock import AsyncMock

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))))

from ai_hub.agent.agent import AgentSession

TOOL_CALL_DELETE_PROJECT = (
    "<tool_calls><invoke name=\"delete_project\">"
    "<parameter name=\"projectName\">projX</parameter>"
    "</invoke></tool_calls>"
)

TOOL_CALL_LIST_PROJECTS = "<tool_calls><invoke name=\"list_projects\"></invoke></tool_calls>"


class MockStreamProvider:
    """两阶段流式 Provider：第一轮输出 tool_call，第二轮输出普通文本（模拟工具结果后的 LLM 总结）"""

    last_reasoning_content = ""

    def __init__(self, first: str, second: str = "已完成任务。"):
        self._responses = iter([first, second])

    async def chat_stream(self, messages, system_prompt="", temperature=0.7, max_tokens=4096):
        try:
            yield next(self._responses)
        except StopIteration:
            return


async def _collect(agen):
    parts = []
    async for chunk in agen:
        parts.append(chunk)
    return "".join(parts)


def _run(session: AgentSession, max_rounds: int = 5) -> str:
    return asyncio.run(_collect(session.run_stream(max_tool_rounds=max_rounds)))


def _make_session(autonomy_mode: str = "semi_auto", first: str = TOOL_CALL_DELETE_PROJECT) -> AgentSession:
    session = AgentSession()
    session.provider = MockStreamProvider(first)
    session.autonomy_mode = autonomy_mode
    return session


# --- semi_auto / auto：CONFIRM 工具需确认，不执行 ---

def test_semi_auto_confirm_tool_requires_confirmation():
    session = _make_session("semi_auto")
    with mock.patch("ai_hub.agent.agent.execute_tool", new=AsyncMock(return_value={"success": True})) as exec_mock:
        out = _run(session)
    # 进入确认分支：提示需要确认，工具未执行
    assert "需要确认" in out
    assert "delete_project" in out
    assert session.pending_confirmation is not None
    assert session.pending_confirmation["name"] == "delete_project"
    assert session.pending_confirmation["args"] == {"projectName": "projX"}
    exec_mock.assert_not_called()


def test_auto_mode_confirm_tool_still_requires_confirmation():
    # 源码语义：仅 full_auto 才跳过确认；auto/semi_auto 均需确认
    session = _make_session("auto")
    with mock.patch("ai_hub.agent.agent.execute_tool", new=AsyncMock(return_value={"success": True})) as exec_mock:
        out = _run(session)
    assert "需要确认" in out
    assert session.pending_confirmation is not None
    assert session.pending_confirmation["name"] == "delete_project"
    exec_mock.assert_not_called()


# --- full_auto：CONFIRM 工具直接执行 ---

def test_full_auto_executes_confirm_tool_directly():
    session = _make_session("full_auto")
    with mock.patch(
        "ai_hub.agent.agent.execute_tool",
        new=AsyncMock(return_value={"success": True, "result": "deleted"}),
    ) as exec_mock:
        out = _run(session)
    assert "正在调用工具" in out
    assert "delete_project" in out
    exec_mock.assert_called_once_with("delete_project", {"projectName": "projX"})
    assert session.pending_confirmation is None


# --- AUTO 权限工具：任何模式下直接执行 ---

def test_semi_auto_auto_tool_executes_directly():
    session = _make_session("semi_auto", first=TOOL_CALL_LIST_PROJECTS)
    with mock.patch(
        "ai_hub.agent.agent.execute_tool",
        new=AsyncMock(return_value={"success": True, "result": []}),
    ) as exec_mock:
        out = _run(session)
    assert "正在调用工具" in out
    exec_mock.assert_called_once_with("list_projects", {})
    assert session.pending_confirmation is None


# --- 确认闭环：确认/取消 ---

def test_confirmation_reply_executes_pending_tool():
    # first 用普通文本：确认执行工具后，for 循环首轮 provider 不触发新的 tool_call
    session = _make_session("semi_auto", first="已完成任务。")
    session.pending_confirmation = {"name": "delete_project", "args": {"projectName": "projX"}}
    session.add_user_message("确认")
    with mock.patch(
        "ai_hub.agent.agent.execute_tool",
        new=AsyncMock(return_value={"success": True, "result": "deleted"}),
    ) as exec_mock:
        out = _run(session)
    assert "已确认，正在执行工具" in out
    exec_mock.assert_called_once_with("delete_project", {"projectName": "projX"})
    assert session.pending_confirmation is None


def test_cancel_reply_aborts_pending_tool():
    session = _make_session("semi_auto")
    session.pending_confirmation = {"name": "delete_project", "args": {"projectName": "projX"}}
    session.add_user_message("取消")
    with mock.patch("ai_hub.agent.agent.execute_tool", new=AsyncMock(return_value={"success": True})) as exec_mock:
        out = _run(session)
    assert "已取消" in out
    exec_mock.assert_not_called()
    assert session.pending_confirmation is None


# --- 边界：无 provider 时给出友好错误 ---

def test_no_provider_returns_friendly_error():
    session = AgentSession()  # provider 为 None
    out = _run(session)
    assert "没有可用的 AI Provider" in out
