"""Agent v2 结果汇总器"""
import logging

logger = logging.getLogger(__name__)

class StepResult:
    def __init__(self, step: int, description: str, success: bool,
                 detail: str = "", tool_name: str = ""):
        self.step = step
        self.description = description
        self.success = success
        self.detail = detail
        self.tool_name = tool_name

class ExecutionReport:
    def __init__(self):
        self.steps: list[StepResult] = []

    def add_step(self, step: StepResult):
        self.steps.append(step)

    def generate_summary(self) -> str:
        total = len(self.steps)
        success_count = sum(1 for s in self.steps if s.success)
        fail_count = total - success_count
        lines = ["\n## 📊 执行报告\n"]
        if fail_count == 0:
            lines.append(f"✅ 全部 {total} 个步骤执行成功。\n")
        else:
            lines.append(f"⚠️ {success_count}/{total} 成功，{fail_count} 失败。\n")
        lines.append("| 步骤 | 操作 | 状态 | 详情 |")
        lines.append("|------|------|------|------|")
        for s in self.steps:
            status = "✅" if s.success else "❌"
            detail = s.detail[:100] if s.detail else "-"
            lines.append(f"| {s.step} | {s.description} | {status} | {detail} |")
        return "\n".join(lines)