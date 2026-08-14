"""
P1.4 plan:table → MC 项目 转换程序（AL→MC 管道落点）。

流程：AL 输出 plan:table（宏规划）→ MC 转换程序重建规划上下文
（用宏参数：PFC/CNP 队列、收敛比等）→ 生成单项目四表格。

plan:table 的 macro 参数是「可调整参数」，转换时生效；拓扑/接线由规划引擎
按宏参数重建（当前实现以 64 台试点拓扑为基准，未来按 deviceList 扩展）。
"""

from ..resolver import IntentContext
from ..project_single import SingleProjectGenerator
from .pilot_builder import build_pilot64_planned


def plantable_to_context(plan: dict) -> IntentContext:
    """从 plan:table 重建规划上下文（应用 macro 可调参数）。"""
    macro = plan.get('macro', {})
    pfc = int(macro.get('pfc_queue', 3))
    cnp = int(macro.get('cnp_queue', 6))
    site = macro.get('site', 'BJ01')
    ctx = build_pilot64_planned(pfc_queue=pfc, cnp_queue=cnp, site=site)
    # 覆盖可调参数（来自 plan）
    ctx.globals['pfc_queue'] = pfc
    ctx.globals['cnp_queue'] = cnp
    if macro.get('bgp_max_paths'):
        ctx.globals['bgp_max_paths'] = macro['bgp_max_paths']
    return ctx


def plantable_to_project(plan: dict, project_dir: str) -> str:
    """plan:table → 单项目四表格 MC 项目。"""
    ctx = plantable_to_context(plan)
    return SingleProjectGenerator(ctx).write(project_dir)


def generate_plantable_and_project(project_dir: str, pfc=3, cnp=6) -> tuple:
    """便捷：AL 出 plan:table → MC 出项目，一次闭环（用于联调/测试）。"""
    from .plantable import generate_plantable
    ctx = build_pilot64_planned(pfc, cnp)
    plan = generate_plantable(ctx)
    plantable_to_project(plan, project_dir)
    return plan, project_dir
