"""
P1.4 plan:table → MC 项目 转换程序（AL→MC 管道落点）。

流程：AL 输出 plan:table（宏规划，契约 v1.1 含桥接标识）→ MC **校验桥接标识**
→ 重建规划上下文（用宏参数：PFC/CNP 队列、收敛比等）→ 生成单项目四表格。

plan:table 的 macro 参数是「可调整参数」，转换时生效；拓扑/接线由规划引擎
按宏参数重建（G3 起按 deviceList/connections 全量驱动扩展）。
"""

from ..resolver import IntentContext
from ..project_single import SingleProjectGenerator
from .allocator_state import AllocatorState
from .plan_builder import build_plan_context
from .validate import validate_bridge_meta


def _macro_val(macro: dict, camel: str, snake: str, default):
    """camelCase 优先、snake_case 兜底（兼容 v1.0 过渡，契约 §3）。"""
    return macro.get(camel, macro.get(snake, default))


def plantable_to_context(plan: dict) -> IntentContext:
    """G3.1：从 plan:table **全量**重建规划上下文（deviceList/connections/terminals 驱动，规模无关）。

    不再「仅取 4 宏观参数 + 固定 64 台重建」；地址/网关按 macro.ipSegments 确定性分配。
    """
    return build_plan_context(plan)


def plantable_to_project(plan: dict, project_dir: str) -> str:
    """plan:table → 单项目四表格 MC 项目；桥接标识校验失败即抛错（不静默，回报 AL）。

    D23：创建 AllocatorState（allocator_state.json）——segments 换段优先、reserved 预留跳过，
    build 后写回 allocated 审计；重复导入幂等（同配置同地址）。
    """
    issues = validate_bridge_meta(plan)
    if issues:
        raise ValueError('; '.join(issues))
    state = AllocatorState(project_dir)
    ctx = build_plan_context(plan, state)
    return SingleProjectGenerator(ctx).write(project_dir)


def generate_plantable_and_project(project_dir: str, pfc=3, cnp=6) -> tuple:
    """便捷：AL 出 plan:table → MC 出项目，一次闭环（用于联调/测试）。"""
    from .plantable import generate_plantable
    ctx = build_pilot64_planned(pfc, cnp)
    plan = generate_plantable(ctx)
    plantable_to_project(plan, project_dir)
    return plan, project_dir
