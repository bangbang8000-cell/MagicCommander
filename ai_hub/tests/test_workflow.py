"""5.0.3-503-a：多步自主任务编排测试（TaskWorkflow 状态机 / 审批 / workflow_stream 驱动 / verify 接线）

覆盖：
- TaskWorkflow 状态机：set_plan / next_step / approve / reject / snapshot / 阶段流转
- 审批判定：advisor=计划级+每步；semi_auto=计划级+关键步骤；full_auto=全自动
- workflow_stream 驱动：
  - full_auto：Plan→Execute(全部步骤)→Verify→Done，无审批
  - semi_auto：计划级审批 + CONFIRM 工具步骤级审批（确认/取消闭环）
  - advisor：每步骤审批
  - 无法解析计划 → 友好提示 + DONE
- Verify 接线：verify_tool_result 对可校验工具（create_project_intelligent）做磁盘一致性
- 会话任务上下文保留：切换/复用会话后 workflow_state 仍可快照
"""
import asyncio
import json
import os
import sys
from unittest import mock

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))))

import pytest

from ai_hub.agent.agent import AgentSession
from ai_hub.agent.workflow import (
    TaskWorkflow,
    WorkflowPhase,
    StepStatus,
    workflow_stream,
    needs_plan_approval,
    needs_step_approval,
    WORKFLOW_MARKER_PLAN,
    WORKFLOW_MARKER_STEP,
    WORKFLOW_MARKER_APPROVE_PLAN,
    WORKFLOW_MARKER_APPROVE_STEP,
    WORKFLOW_MARKER_VERIFY,
    WORKFLOW_MARKER_DONE,
)

PLAN_2_STEPS = (
    "1. 创建项目 demo — 使用工具: create_project_intelligent(projectName=demo, deviceType=switch)\n"
    "2. 列出项目 — 使用工具: list_projects"
)
TOOL_CREATE = (
    '<tool_calls><invoke name="create_project_intelligent">'
    '<parameter name="projectName">demo</parameter><parameter name="deviceType">switch</parameter>'
    "</invoke></tool_calls>"
)
TOOL_LIST = "<tool_calls><invoke name=\"list_projects\"></invoke></tool_calls>"
TOOL_DELETE = (
    '<tool_calls><invoke name="delete_project">'
    '<parameter name="projectName">demo</parameter>'
    "</invoke></tool_calls>"
)


class MockStreamProvider:
    """按调用顺序消费响应的流式 Provider（首响应=计划，后续=各步骤工具调用）"""

    last_reasoning_content = ""

    def __init__(self, responses):
        self._responses = list(responses)
        self._i = 0

    async def chat_stream(self, messages, system_prompt="", temperature=0.7, max_tokens=4096):
        if self._i < len(self._responses):
            resp = self._responses[self._i]
            self._i += 1
            yield resp
        else:
            yield "步骤已完成。"


def _run_workflow(session, message: str) -> list:
    async def run():
        out = []
        async for c in workflow_stream(session, message):
            out.append(c)
        return out
    return asyncio.run(run())


def _make_session(autonomy_mode="full_auto", responses=None) -> AgentSession:
    session = AgentSession()
    session.provider = MockStreamProvider(responses or [PLAN_2_STEPS, TOOL_CREATE, TOOL_LIST])
    session.autonomy_mode = autonomy_mode
    return session


# ============================================================
# TaskWorkflow 状态机
# ============================================================

class TestTaskWorkflowStateMachine:
    def test_initial_phase_is_plan(self):
        wf = TaskWorkflow()
        assert wf.phase == WorkflowPhase.PLAN
        assert wf.steps == []
        assert wf.current_index == -1
        assert wf.task_id

    def test_set_plan_enters_execute_and_indexes(self):
        wf = TaskWorkflow()
        wf.set_plan([{"index": 1, "description": "a", "tool": "list_projects"},
                     {"index": 2, "description": "b", "tool": "read_file"}])
        assert wf.phase == WorkflowPhase.EXECUTE
        assert len(wf.steps) == 2
        assert all(s["status"] == StepStatus.PENDING for s in wf.steps)
        step = wf.next_step()
        assert step["index"] == 1
        assert wf.current_index == 0

    def test_approve_reject_pending(self):
        wf = TaskWorkflow()
        wf.set_plan([{"index": 1, "description": "a", "tool": "list_projects"}])
        wf.request_plan_approval()
        assert wf.pending_approval == "plan"
        assert wf.approve_pending() == "plan"
        assert wf.pending_approval is None
        assert wf.phase == WorkflowPhase.EXECUTE
        wf.request_plan_approval()
        wf.reject_pending()
        assert wf.phase == WorkflowPhase.DONE
        assert "取消" in wf.summary

    def test_step_approval_marks_approved(self):
        wf = TaskWorkflow()
        wf.set_plan([{"index": 1, "description": "a", "tool": "delete_project"},
                     {"index": 2, "description": "b", "tool": "list_projects"}])
        wf.next_step()
        wf.pending_approval = "step:1"
        assert wf.approve_pending() == "step"
        assert wf.steps[0]["status"] == StepStatus.APPROVED

    def test_mark_step_and_verify_summary(self):
        wf = TaskWorkflow()
        wf.set_plan([{"index": 1, "description": "a", "tool": "create_project"}])
        wf.next_step()
        wf.mark_step(StepStatus.SUCCEEDED, tool="create_project",
                     verify=[{"severity": "error", "message": "x"}])
        assert wf.steps[0]["status"] == StepStatus.SUCCEEDED
        assert wf.steps[0]["verify_summary"]["errors"] == 1

    def test_snapshot_serializable(self):
        wf = TaskWorkflow()
        wf.set_plan([{"index": 1, "description": "a", "tool": "list_projects"}])
        snap = wf.snapshot()
        assert snap["phase"] == "execute"
        assert snap["task_id"] == wf.task_id
        assert snap["steps"][0]["description"] == "a"
        assert json.dumps(snap)  # 可 JSON 序列化（HTTP/IPC 透传）


# ============================================================
# 审批判定
# ============================================================

class TestApprovalPolicy:
    def test_plan_approval_by_mode(self):
        assert needs_plan_approval("advisor") is True
        assert needs_plan_approval("semi_auto") is True
        assert needs_plan_approval("full_auto") is False

    def test_step_approval_by_mode(self):
        # advisor=每步确认
        assert needs_step_approval("advisor", {"tool": "list_projects"}) is True
        # semi_auto=关键步骤（CONFIRM 权限工具）
        assert needs_step_approval("semi_auto", {"tool": "delete_project"}) is True
        assert needs_step_approval("semi_auto", {"tool": "list_projects"}) is False
        # full_auto 全自动
        assert needs_step_approval("full_auto", {"tool": "delete_project"}) is False
        # 未知工具按 CONFIRM 保守处理
        assert needs_step_approval("semi_auto", {"tool": "no_such_tool"}) is True


# ============================================================
# workflow_stream 驱动
# ============================================================

class TestWorkflowDriver:
    def test_full_auto_runs_all_steps_plan_verify_done(self, tmp_path, monkeypatch):
        from ai_hub.agent import tools as tools_mod
        old_ws = tools_mod._workspace_dir
        tools_mod._workspace_dir = str(tmp_path)
        try:
            # 构造 demo 项目使 verify 通过（create_project_intelligent 声称 created ↔ 磁盘一致）
            (tmp_path / "demo" / "templates").mkdir(parents=True, exist_ok=True)
            (tmp_path / "demo" / "templates" / "ASW.j2").write_text("x", encoding="utf-8")
            session = _make_session("full_auto")
            calls = []

            async def fake_execute(name, args):
                calls.append((name, args))
                if name == "create_project_intelligent":
                    return {"success": True, "result": json.dumps(
                        {"status": "created", "projectName": "demo",
                         "structure": {"directories": ["templates", "excel"]}}, ensure_ascii=False)}
                return {"success": True, "result": json.dumps({"status": "ok", "data": []}, ensure_ascii=False)}

            with mock.patch("ai_hub.agent.agent.execute_tool", new=fake_execute):
                out = _run_workflow(session, "请创建项目 demo 并列出项目")

            joined = "\n".join(out)
            assert WORKFLOW_MARKER_PLAN in joined
            assert "创建项目 demo" in joined
            assert WORKFLOW_MARKER_STEP.format(n=1) in joined
            assert WORKFLOW_MARKER_STEP.format(n=2) in joined
            assert WORKFLOW_MARKER_VERIFY in joined
            assert WORKFLOW_MARKER_DONE in joined
            assert [c[0] for c in calls] == ["create_project_intelligent", "list_projects"]
            wf = session.workflow_state
            assert wf.phase == WorkflowPhase.DONE
            assert wf.verify_result is not None
            assert wf.verify_result["ok"] is True
        finally:
            tools_mod._workspace_dir = old_ws

    def test_semi_auto_plan_approval_then_key_step_approval(self):
        session = _make_session("semi_auto", responses=[
            "1. 创建项目 demo — 使用工具: create_project_intelligent(projectName=demo, deviceType=switch)\n"
            "2. 删除项目 demo — 使用工具: delete_project(projectName=demo)",
            TOOL_CREATE,
            TOOL_DELETE,
        ])
        calls = []

        async def fake_execute(name, args):
            calls.append((name, args))
            return {"success": True, "result": "ok"}

        with mock.patch("ai_hub.agent.agent.execute_tool", new=fake_execute):
            # ① 计划生成 + 计划级审批暂停
            out1 = _run_workflow(session, "请创建后删除项目 demo")
            joined1 = "\n".join(out1)
            assert WORKFLOW_MARKER_PLAN in joined1
            assert WORKFLOW_MARKER_APPROVE_PLAN in joined1
            assert session.workflow_state.pending_approval == "plan"
            assert calls == []
            # ② 确认计划 → 执行步骤1（notify 直接执行），步骤2（CONFIRM）暂停审批
            out2 = _run_workflow(session, "确认")
            joined2 = "\n".join(out2)
            assert WORKFLOW_MARKER_STEP.format(n=1) in joined2
            assert WORKFLOW_MARKER_APPROVE_STEP.format(n=2) in joined2
            assert session.workflow_state.pending_approval == "step:2"
            assert [c[0] for c in calls] == ["create_project_intelligent"]
            # ③ 确认步骤2 → 执行 → verify → done
            out3 = _run_workflow(session, "确认")
            joined3 = "\n".join(out3)
            assert "delete_project" in " ".join(c[0] for c in calls) or "delete_project" in joined3
            assert WORKFLOW_MARKER_DONE in joined3
            assert session.workflow_state.phase == WorkflowPhase.DONE

    def test_semi_auto_cancel_plan_aborts(self):
        session = _make_session("semi_auto", responses=[PLAN_2_STEPS])
        calls = []

        async def fake_execute(name, args):
            calls.append((name, args))
            return {"success": True, "result": "ok"}

        with mock.patch("ai_hub.agent.agent.execute_tool", new=fake_execute):
            _run_workflow(session, "请创建项目")
            out2 = _run_workflow(session, "取消")
        joined = "\n".join(out2)
        assert WORKFLOW_MARKER_DONE in joined
        assert calls == []
        assert session.workflow_state.phase == WorkflowPhase.DONE
        assert "取消" in session.workflow_state.summary

    def test_advisor_requires_plan_and_every_step_approval(self):
        session = _make_session("advisor", responses=[
            "1. 列出项目 — 使用工具: list_projects",
            TOOL_LIST,
        ])
        calls = []

        async def fake_execute(name, args):
            calls.append((name, args))
            return {"success": True, "result": "ok"}

        with mock.patch("ai_hub.agent.agent.execute_tool", new=fake_execute):
            _run_workflow(session, "列出项目")
            # 计划级审批
            assert session.workflow_state.pending_approval == "plan"
            _run_workflow(session, "确认")
            # 步骤级审批（advisor=每步）
            assert session.workflow_state.pending_approval == "step:1"
            assert calls == []
            out3 = _run_workflow(session, "确认")
        joined3 = "\n".join(out3)
        assert WORKFLOW_MARKER_DONE in joined3
        assert [c[0] for c in calls] == ["list_projects"]

    def test_unparseable_plan_ends_with_hint(self):
        session = _make_session("full_auto", responses=["抱歉，我无法生成计划。"])
        out = _run_workflow(session, "请执行")
        joined = "\n".join(out)
        assert WORKFLOW_MARKER_DONE in joined
        assert "无法从" in joined
        assert session.workflow_state.phase == WorkflowPhase.DONE

    def test_verify_flags_failed_step_when_claimed_but_missing(self, tmp_path, monkeypatch):
        from ai_hub.agent import tools as tools_mod
        old_ws = tools_mod._workspace_dir
        tools_mod._workspace_dir = str(tmp_path)
        try:
            session = _make_session("full_auto", responses=[
                "1. 创建项目 ghost — 使用工具: create_project_intelligent(projectName=ghost, deviceType=switch)",
                TOOL_CREATE,
            ])

            async def fake_execute(name, args):
                return {"success": True, "result": json.dumps(
                    {"status": "created", "projectName": "ghost"}, ensure_ascii=False)}

            with mock.patch("ai_hub.agent.agent.execute_tool", new=fake_execute):
                _run_workflow(session, "创建项目 ghost")
            wf = session.workflow_state
            # 声称创建但磁盘无目录 → verify error → 步骤 FAILED
            assert wf.steps[0]["status"] == StepStatus.FAILED
            assert wf.verify_result["errors"] >= 1
        finally:
            tools_mod._workspace_dir = old_ws

    def test_verify_passes_when_disk_matches(self, tmp_path, monkeypatch):
        from ai_hub.agent import tools as tools_mod
        old_ws = tools_mod._workspace_dir
        tools_mod._workspace_dir = str(tmp_path)
        try:
            project_dir = tmp_path / "demo"
            (project_dir / "templates").mkdir(parents=True, exist_ok=True)
            (project_dir / "templates" / "ASW.j2").write_text("x", encoding="utf-8")
            session = _make_session("full_auto", responses=[
                "1. 创建项目 demo — 使用工具: create_project_intelligent(projectName=demo, deviceType=switch)",
                TOOL_CREATE,
            ])

            async def fake_execute(name, args):
                return {"success": True, "result": json.dumps(
                    {"status": "created", "projectName": "demo",
                     "structure": {"directories": ["templates", "excel"]}}, ensure_ascii=False)}

            with mock.patch("ai_hub.agent.agent.execute_tool", new=fake_execute):
                _run_workflow(session, "创建项目 demo")
            wf = session.workflow_state
            assert wf.steps[0]["status"] == StepStatus.SUCCEEDED
            assert wf.verify_result["ok"] is True
        finally:
            tools_mod._workspace_dir = old_ws


# ============================================================
# 会话任务上下文保留
# ============================================================

def test_workflow_state_kept_on_session():
    """workflow 任务上下文（task_id/plan/steps）随会话保留（切换/复用会话不丢）"""
    session = _make_session("full_auto", responses=[
        "1. 列出项目 — 使用工具: list_projects",
        TOOL_LIST,
    ])

    async def fake_execute(name, args):
        return {"success": True, "result": "ok"}

    with mock.patch("ai_hub.agent.agent.execute_tool", new=fake_execute):
        _run_workflow(session, "列出项目")
    assert session.workflow_state is not None
    assert session.workflow_state.task_id
    assert session.workflow_state.phase == WorkflowPhase.DONE
    assert len(session.workflow_state.steps) == 1


# ============================================================
# OwnAgentProvider 驱动（workflow 只对自有引擎生效）
# ============================================================

def test_own_provider_drives_workflow_when_enabled(tmp_path, monkeypatch):
    from ai_hub.agent.provider import get_own_provider
    from ai_hub.llm.provider import registry
    from ai_hub.agent.agent import get_or_create_session, _sessions

    saved = dict(_sessions)
    _sessions.clear()
    saved_registry = dict(registry._providers)
    registry._providers.clear()
    try:
        registry.register("mock-provider", MockStreamProvider([PLAN_2_STEPS, TOOL_CREATE, TOOL_LIST]))
        # 会话 workflow 标记（chat.py 侧设定；会话按引擎命名空间）
        session = get_or_create_session("wf-provider", engine="own")
        session.workflow = "on"
        provider = get_own_provider()

        async def fake_execute(name, args):
            return {"success": True, "result": "ok"}

        async def run():
            parts = []
            async for c in provider.stream_chat(
                session_id="wf-provider", message="请创建项目并列出", provider="mock-provider",
                mode="general", autonomy_mode="full_auto",
            ):
                parts.append(c)
            return "".join(parts)

        with mock.patch("ai_hub.agent.agent.execute_tool", new=fake_execute):
            joined = asyncio.run(run())

        assert WORKFLOW_MARKER_PLAN in joined
        assert WORKFLOW_MARKER_STEP.format(n=1) in joined
        assert WORKFLOW_MARKER_DONE in joined
        assert session.workflow_state is not None
        assert session.workflow_state.phase == WorkflowPhase.DONE
        # 任务上下文随会话保留（快照可序列化）
        assert json.dumps(session.workflow_state.snapshot())
    finally:
        _sessions.clear()
        _sessions.update(saved)
        registry._providers.clear()
        registry._providers.update(saved_registry)
