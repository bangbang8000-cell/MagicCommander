"""5.0.3-503-a：多步自主任务编排（Plan→Execute→Verify）状态机与驱动。

- TaskWorkflow：多步任务状态机（task_id / phase / steps / verify / 审批节点），
  阶段 Plan → Execute → Verify → Done；可含多轮 execute+verify（状态机可回退 Execute 追加步骤）。
- 审批：把确认点从「每工具轮」提升为「步骤级暂停/恢复」——
  - advisor     = 计划级 + 每步骤确认
  - semi_auto   = 计划级 + 关键步骤（CONFIRM 权限工具）确认
  - full_auto   = 全自动，无审批
- Verify：复用 ai_hub.agent.accuracy.verify_tool_result() 对执行过的工具做
  「工具声称结果 ↔ 磁盘/元数据」一致性校验（5.0.2 遗留资产接线）。
- 驱动：workflow_stream 使用会话 LLM Provider 生成/推进，并复用 AgentSession.run_stream
  单轮工具循环作为 execute 步进（不新造工具执行面，不扩展 AgentProvider 抽象接口）。

会话任务上下文（task_id/plan/steps/verify_result）随会话保留（引擎维度命名空间），
切换引擎/会话不丢（与 5.0.2 会话隔离兼容）。
"""
import json
import logging
import uuid
from enum import Enum
from typing import AsyncIterator, Optional

from ai_hub.agent.planner import parse_plan, get_planner_prompt

logger = logging.getLogger(__name__)

# ============================================================
# 工作流阶段 / 步骤状态 / 标记
# ============================================================

class WorkflowPhase(str, Enum):
    PLAN = "plan"          # 计划阶段
    EXECUTE = "execute"    # 执行阶段（逐步骤）
    VERIFY = "verify"      # 校验阶段
    DONE = "done"          # 完成
    ERROR = "error"        # 出错/中止

class StepStatus(str, Enum):
    PENDING = "pending"
    APPROVED = "approved"
    RUNNING = "running"
    SUCCEEDED = "succeeded"
    FAILED = "failed"
    SKIPPED = "skipped"

# 独立行标记（前端按行剥离，渲染为徽标/审批卡片；与 ---CONFIRM:xxx--- 同一设计）
WORKFLOW_MARKER_PLAN = "---WORKFLOW_PLAN---"
WORKFLOW_MARKER_STEP = "---WORKFLOW_STEP:{n}---"
WORKFLOW_MARKER_APPROVE_PLAN = "---WORKFLOW_APPROVE_PLAN---"
WORKFLOW_MARKER_APPROVE_STEP = "---WORKFLOW_APPROVE_STEP:{n}---"
WORKFLOW_MARKER_VERIFY = "---WORKFLOW_VERIFY---"
WORKFLOW_MARKER_DONE = "---WORKFLOW_DONE---"

# 审批词
APPROVE_WORDS = {"确认", "是", "继续", "好的", "确定", "ok", "yes", "confirm", "y", "批准", "同意"}
REJECT_WORDS = {"取消", "cancel", "no", "n", "不", "否", "中止", "拒绝"}

# 可校验的工具（accuracy.verify_tool_result 支持面）
VERIFIABLE_TOOLS = {
    "create_project", "create_from_template", "create_project_intelligent", "import_project",
    "update_project", "export_project", "delete_project", "list_projects",
}


def _now() -> str:
    from datetime import datetime
    return datetime.now().isoformat()


class TaskWorkflow:
    """多步任务状态机（会话内任务上下文；可序列化快照供 HTTP/IPC 透传）。"""

    def __init__(self, task_id: Optional[str] = None):
        self.task_id: str = task_id or f"task_{uuid.uuid4().hex[:12]}"
        self.phase: WorkflowPhase = WorkflowPhase.PLAN
        self.steps: list[dict] = []
        self.current_index: int = -1
        self.verify_result: Optional[dict] = None
        self.pending_approval: Optional[str] = None  # "plan" | "step:<n>"
        self.summary: str = ""
        self.created_at: str = _now()
        self.updated_at: str = _now()

    # ---- 状态转换 ----
    def set_plan(self, steps: list[dict]) -> None:
        """写入计划步骤并进入 EXECUTE（尚未开始的计划仍等待审批或直接执行）。"""
        self.steps = [dict(s) | {"status": StepStatus.PENDING} for s in steps]
        for i, s in enumerate(self.steps):
            s["index"] = s.get("index") or i + 1
        self.current_index = -1
        self.phase = WorkflowPhase.EXECUTE
        self.updated_at = _now()

    def request_plan_approval(self) -> None:
        self.pending_approval = "plan"
        self.updated_at = _now()

    def next_step(self) -> Optional[dict]:
        """取下一个未执行步骤（跳过已完成）；无则返回 None。"""
        for i, s in enumerate(self.steps):
            if s["status"] in (StepStatus.PENDING, StepStatus.APPROVED):
                self.current_index = i
                self.updated_at = _now()
                return s
        return None

    def current_step(self) -> Optional[dict]:
        if 0 <= self.current_index < len(self.steps):
            return self.steps[self.current_index]
        return None

    def approve_pending(self) -> Optional[str]:
        """批准当前待审批节点，返回其类型（"plan"/"step"）；无待审批返回 None。"""
        kind = self.pending_approval
        self.pending_approval = None
        if kind == "plan":
            self.phase = WorkflowPhase.EXECUTE
            self.updated_at = _now()
            return "plan"
        if kind and kind.startswith("step:"):
            try:
                n = int(kind.split(":")[1])
            except (ValueError, IndexError):
                return "step"
            # step:<n> 的 n 为 1-based 步骤序号 → 列表下标 n-1
            if 1 <= n <= len(self.steps):
                self.steps[n - 1]["status"] = StepStatus.APPROVED
            self.updated_at = _now()
            return "step"
        return None

    def reject_pending(self) -> None:
        """拒绝待审批节点 → 任务中止（DONE，summary=已取消）。"""
        self.pending_approval = None
        self.phase = WorkflowPhase.DONE
        self.summary = "任务已被用户取消"
        self.updated_at = _now()

    def mark_step(self, status: StepStatus, tool: str = "", verify: Optional[list] = None) -> None:
        """标记当前步骤状态；可附带工具名与 verify issue 列表。"""
        step = self.current_step()
        if step is None:
            return
        step["status"] = status
        if tool:
            step["tool"] = tool
        if verify is not None:
            step["verify"] = verify
            step["verify_summary"] = _summarize_issues(verify)
        self.updated_at = _now()

    def enter_verify(self) -> None:
        """进入 VERIFY 阶段：汇总各步骤 verify 结果。"""
        self.phase = WorkflowPhase.VERIFY
        issues = []
        for s in self.steps:
            issues.extend(s.get("verify") or [])
        self.verify_result = _summarize_issues(issues) | {"issues": issues}
        self.updated_at = _now()

    def finish(self, summary: str = "") -> None:
        self.phase = WorkflowPhase.DONE
        self.summary = summary or "任务已完成"
        self.updated_at = _now()

    # ---- 序列化快照 ----
    def snapshot(self) -> dict:
        return {
            "task_id": self.task_id,
            "phase": self.phase.value,
            "steps": [
                {
                    "index": s.get("index"),
                    "description": s.get("description", ""),
                    "tool": s.get("tool", ""),
                    "status": s.get("status", StepStatus.PENDING.value),
                    "verify_summary": s.get("verify_summary"),
                }
                for s in self.steps
            ],
            "current_index": self.current_index,
            "pending_approval": self.pending_approval,
            "verify_result": self.verify_result,
            "summary": self.summary,
        }


def _summarize_issues(issues: list) -> dict:
    """verify issue 汇总（与 accuracy.summarize 对齐：total/errors/warnings/ok）。"""
    total = len(issues)
    errors = sum(1 for i in issues if i.get("severity") == "error")
    return {"total": total, "errors": errors, "warnings": total - errors, "ok": errors == 0}


# ============================================================
# 审批判定
# ============================================================

def needs_plan_approval(autonomy_mode: str) -> bool:
    """计划级审批：advisor / semi_auto 需确认计划；full_auto 直接执行。"""
    return autonomy_mode != "full_auto"


def needs_step_approval(autonomy_mode: str, step: dict) -> bool:
    """步骤级审批：advisor=每步骤确认；semi_auto=关键步骤（CONFIRM 权限）确认；full_auto 否。"""
    if autonomy_mode == "full_auto":
        return False
    if autonomy_mode == "advisor":
        return True
    # semi_auto：关键步骤 = 工具权限为 CONFIRM（未知工具按 CONFIRM 保守处理）
    from ai_hub.agent.schemas import get_tool_permission, ToolPermission
    tool = step.get("tool") or ""
    return get_tool_permission(tool) == ToolPermission.CONFIRM


# ============================================================
# 驱动：workflow_stream
# ============================================================

_WORKFLOW_PLAN_INSTRUCTIONS = (
    "\n\n请把执行计划输出为编号步骤，每行格式：`N. 步骤描述 — 使用工具: 工具名(参数=值, ...)`"
    "（如 `1. 创建项目 demo — 使用工具: create_project_intelligent(projectName=demo, deviceType=switch)`）。"
    "每个步骤只使用一个工具；若某步无需工具可省略工具尾段。不要输出其他格式。"
)


async def _ask_for_plan(session, message: str) -> str:
    """调用会话 LLM Provider 生成计划文本（流式收集为完整文本）。"""
    parts = []
    async for chunk in session.provider.chat_stream(
        messages=[{"role": "user", "content": message}],
        system_prompt=get_planner_prompt() + _WORKFLOW_PLAN_INSTRUCTIONS,
    ):
        parts.append(chunk)
    return "".join(parts)


async def _run_single_execute(session, step: dict, max_tool_rounds: Optional[int]) -> AsyncIterator[str]:
    """执行单步：向会话注入步骤指令并复用 run_stream 单轮工具循环（execute 步进）。

    前置：session.last_tool_call / last_tool_result 由 run_stream 在工具执行后写入。
    """
    n = step.get("index", 1)
    session.add_user_message(
        f"请执行当前任务步骤（步骤 {n}）：{step['description']}"
        + (f"。计划指定工具 {step['tool']} 及参数 {json.dumps(step.get('args') or {}, ensure_ascii=False)}，请直接调用；"
           if step.get("tool") else "。请自行判断合适的工具完成该步骤。")
    )
    session.last_tool_call = None
    session.last_tool_result = None
    # 步骤级审批已通过：run_stream 对 CONFIRM 工具不再重复确认（执行后恢复）
    session.workflow_step_approved = True
    try:
        async for chunk in session.run_stream(max_tool_rounds=max_tool_rounds or 1):
            yield chunk
    finally:
        session.workflow_step_approved = False


def _verify_step(step: dict, workspace: str = "") -> list:
    """对已执行步骤调用 accuracy.verify_tool_result() 做一致性校验；不可校验工具返回空列表。"""
    from ai_hub.agent.accuracy import verify_tool_result
    tool = step.get("tool") or ""
    if tool not in VERIFIABLE_TOOLS:
        return []
    if not workspace:
        try:
            from ai_hub.agent import tools as tools_mod
            workspace = tools_mod._workspace_dir or ""
        except Exception:
            workspace = ""
    result = _step_result_payload(step)
    args = step.get("args") or {}
    if not isinstance(args, dict):
        args = {}
    try:
        return verify_tool_result(tool, args, result, workspace)
    except Exception as e:  # 校验失败不应阻断工作流
        logger.warning(f"verify_tool_result failed for {tool}: {e}")
        return []


def _step_result_payload(step: dict):
    """从步骤记录还原工具返回 payload（供 verify 使用）。

    优先用 run_stream 记录的真实结果（session.last_tool_result）；
    execute_tool 包装为 {success, result|error}，verify 需要的是内层 result payload。
    缺失时回退为步骤内记录的 result 文本。
    """
    result = step.get("_result")
    if isinstance(result, dict) and "success" in result and "result" in result:
        return result.get("result")
    return result


def _needs_step_approval_now(session, step: dict) -> bool:
    return needs_step_approval(session.autonomy_mode, step)


async def workflow_stream(session, message: str, max_tool_rounds: Optional[int] = None) -> AsyncIterator[str]:
    """驱动多步工作流（Plan→Execute→Verify），返回流式文本块（含独立行标记）。

    - 首次调用：生成计划 →（按 autonomy_mode）审批或直接执行。
    - 审批回复（确认/取消）在后续调用处理（会话保留 pending_approval）。
    - Execute：逐步骤调用 run_stream 单轮工具循环；执行后立即 verify_tool_result。
    - Verify/Done：汇总校验结果并产出完成标记。
    """
    wf = session.workflow_state
    if wf is None:
        wf = TaskWorkflow()
        session.workflow_state = wf

    # ---- 审批回复 ----
    if wf.pending_approval:
        reply = (message or "").strip().lower()
        if reply in APPROVE_WORDS:
            kind = wf.approve_pending()
            yield f"\n> ✅ 已批准（{kind}），继续执行。\n\n"
        elif reply in REJECT_WORDS:
            wf.reject_pending()
            yield f"\n> 已取消该操作。\n\n"
            yield f"\n{WORKFLOW_MARKER_DONE}\n"
            return
        # 非审批词：继续按当前阶段处理

    # ---- PLAN ----
    if wf.phase == WorkflowPhase.PLAN:
        plan_text = await _ask_for_plan(session, message)
        steps = parse_plan(plan_text)
        if not steps:
            wf.finish("未能解析出可执行计划")
            yield f"\n> ⚠️ 无法从 AI 响应中解析出可执行计划，请重试或更明确描述需求。\n\n"
            yield f"\n{WORKFLOW_MARKER_DONE}\n"
            return
        wf.set_plan(steps)
        yield f"\n{WORKFLOW_MARKER_PLAN}\n"
        yield _render_plan_text(wf)
        if needs_plan_approval(session.autonomy_mode):
            wf.request_plan_approval()
            yield f"\n{WORKFLOW_MARKER_APPROVE_PLAN}\n"
            yield "\n> ⚠️ 请确认以上执行计划：回复「确认」开始执行，或「取消」中止。\n\n"
            return

    # ---- EXECUTE ----
    if wf.phase == WorkflowPhase.EXECUTE:
        while True:
            step = wf.next_step()
            if step is None:
                wf.enter_verify()
                break
            n = step["index"]
            # 步骤级审批（advisor=每步；semi_auto=关键步骤）
            if _needs_step_approval_now(session, step) and step["status"] != StepStatus.APPROVED:
                wf.pending_approval = f"step:{n}"
                yield f"\n{WORKFLOW_MARKER_APPROVE_STEP.format(n=n)}\n"
                yield f"\n> ⚠️ 步骤 {n}「{step['description']}」需要确认：回复「确认」执行，或「取消」中止。\n\n"
                return
            yield f"\n{WORKFLOW_MARKER_STEP.format(n=n)}\n"
            yield f"\n> 🔧 执行步骤 {n}：{step['description']}\n\n"
            step["status"] = StepStatus.RUNNING
            async for chunk in _run_single_execute(session, step, max_tool_rounds):
                yield chunk
            # 执行结果回填 + verify（接线 accuracy.verify_tool_result）
            tool = (session.last_tool_call or {}).get("name") or step.get("tool") or ""
            result = session.last_tool_result
            step["tool"] = tool
            step["_result"] = result
            step["args"] = (session.last_tool_call or {}).get("args") or step.get("args") or {}
            verify = _verify_step(step)
            ok = bool(result and result.get("success") is not False)
            if ok and not any(i.get("severity") == "error" for i in verify):
                wf.mark_step(StepStatus.SUCCEEDED, tool=tool, verify=verify)
            else:
                wf.mark_step(StepStatus.FAILED, tool=tool, verify=verify)
            if verify:
                yield f"\n> 🧪 步骤 {n} 校验：{json.dumps(wf.current_step().get('verify_summary'), ensure_ascii=False)}\n\n"
            if not ok:
                # 步骤失败 → 进入 VERIFY 汇总（后续 DONE），不再继续后续步骤
                wf.enter_verify()
                break

    # ---- VERIFY ----
    if wf.phase == WorkflowPhase.VERIFY:
        wf.enter_verify()
        v = wf.verify_result or {}
        yield f"\n{WORKFLOW_MARKER_VERIFY}\n"
        yield f"\n> ✅ 校验汇总：{json.dumps(v, ensure_ascii=False)}\n\n"
        wf.finish()
        yield f"\n{WORKFLOW_MARKER_DONE}\n"
        return

    # ---- DONE（已完成的任务再次进入） ----
    if wf.phase == WorkflowPhase.DONE:
        yield f"\n{WORKFLOW_MARKER_DONE}\n"
        return


def _render_plan_text(wf: TaskWorkflow) -> str:
    """渲染计划文本（前端 PlanDisplay 可解析的 📋 执行计划格式）。"""
    lines = ["📋 执行计划:"]
    for s in wf.steps:
        tool_part = f" — 使用工具: {s['tool']}" if s.get("tool") else ""
        lines.append(f"{s['index']}. {s['description']}{tool_part}")
    return "\n".join(lines) + "\n"
