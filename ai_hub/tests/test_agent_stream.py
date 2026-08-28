"""Agent run_stream 流式健壮性测试

覆盖维度：
- 空流兜底：chat_stream 无任何产出时，run_stream 仍 yield 友好提示（SSE 有 message 事件，前端不空白）
- 工具进度占位：execute_tool 前 yield 进度文本，前端在工具执行期有 chunk 重置活跃超时
- 工具进度文本位于工具执行结果之前
"""
import asyncio
import os
import re
import sys
from unittest import mock

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))))

from ai_hub.agent.agent import AgentSession


class MockStreamProvider:
    last_reasoning_content = ""

    def __init__(self, chunks):
        self._chunks = list(chunks)

    async def chat_stream(self, messages, system_prompt="", temperature=0.7, max_tokens=4096):
        for c in self._chunks:
            yield c


def _collect(session):
    async def run():
        out = []
        async for c in session.run_stream():
            out.append(c)
        return out

    return asyncio.run(run())


# --- 空流兜底 ---

def test_run_stream_empty_stream_yields_fallback_text():
    """chat_stream 无任何产出（空流）时，run_stream 必须 yield 友好提示，SSE 不会只有 done"""
    session = AgentSession()
    session.provider = MockStreamProvider([])
    chunks = _collect(session)
    assert len(chunks) >= 1
    assert any("AI 未返回内容" in c for c in chunks)


def test_run_stream_empty_stream_does_not_raise():
    """空流不抛异常，正常结束"""
    session = AgentSession()
    session.provider = MockStreamProvider([])
    _collect(session)
    # 不应抛异常


# --- 工具执行进度占位 ---

TOOL_CALL_TEXT = '```tool_call\n{"name": "list_projects", "arguments": {}}\n```'


def test_run_stream_yields_tool_progress_before_execute():
    """execute_tool 前必须 yield 进度文本，且位于工具执行结果之前"""
    session = AgentSession()
    session.provider = MockStreamProvider([TOOL_CALL_TEXT])

    async def fake_execute(name, args):
        return {"success": True, "result": {"projects": []}}

    with mock.patch("ai_hub.agent.agent.execute_tool", new=fake_execute):
        chunks = _collect(session)

    joined = "\n".join(chunks)
    progress_idx = joined.find("⏳ 正在执行工具")
    result_idx = joined.find("工具执行结果")
    assert progress_idx != -1, f"缺少工具进度占位，输出: {joined}"
    assert result_idx != -1, f"缺少工具执行结果，输出: {joined}"
    assert progress_idx < result_idx


def test_run_stream_tool_progress_contains_tool_name():
    """进度文本包含解析出的工具名（list_projects）"""
    session = AgentSession()
    session.provider = MockStreamProvider([TOOL_CALL_TEXT])

    async def fake_execute(name, args):
        return {"success": True, "result": {"projects": []}}

    with mock.patch("ai_hub.agent.agent.execute_tool", new=fake_execute):
        chunks = _collect(session)

    joined = "\n".join(chunks)
    assert "list_projects" in joined


# --- CONFIRM 结构化标记（PRD v3.3 AI-1 确认卡片）---

TOOL_CALL_CONFIRM = (
    "<tool_calls><invoke name=\"delete_project\">"
    "<parameter name=\"projectName\">projX</parameter>"
    "</invoke></tool_calls>"
)


def test_confirm_branch_yields_structured_marker():
    """CONFIRM 分支 yield 独立标记行 ---CONFIRM:<tool>--- 且保留原确认文本（向后兼容）"""
    session = AgentSession()
    session.provider = MockStreamProvider([TOOL_CALL_CONFIRM])
    session.autonomy_mode = "semi_auto"
    chunks = _collect(session)
    joined = "\n".join(chunks)
    assert "---CONFIRM:delete_project---" in joined
    assert "需要确认" in joined
    assert session.pending_confirmation is not None
    assert session.pending_confirmation["name"] == "delete_project"
    assert session.pending_confirmation["args"] == {"projectName": "projX"}


def test_confirm_marker_on_own_line():
    """标记必须位于独立行（前端按行剥离，不进显示区）"""
    session = AgentSession()
    session.provider = MockStreamProvider([TOOL_CALL_CONFIRM])
    session.autonomy_mode = "semi_auto"
    chunks = _collect(session)
    joined = "\n".join(chunks)
    assert re.search(r"(^|\n)---CONFIRM:delete_project---(\n|$)", joined)


def test_full_auto_no_confirm_marker():
    """full_auto 直接执行，不产出确认标记"""
    session = AgentSession()
    session.provider = MockStreamProvider([TOOL_CALL_CONFIRM])
    session.autonomy_mode = "full_auto"

    async def fake_execute(name, args):
        return {"success": True, "result": "deleted"}

    with mock.patch("ai_hub.agent.agent.execute_tool", new=fake_execute):
        chunks = _collect(session)

    joined = "\n".join(chunks)
    assert "---CONFIRM:" not in joined
    assert "正在调用工具" in joined
