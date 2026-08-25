"""
P1.4 plan:table → MC 项目 转换程序（AL→MC 管道落点）。

流程：AL 输出 plan:table（宏规划，契约 v1.2 含桥接标识）→ MC **校验桥接标识**
→ 重建规划上下文（用宏参数：PFC/CNP 队列、收敛比等）→ 生成单项目四表格。

plan:table 的 macro 参数是「可调整参数」，转换时生效；拓扑/接线由规划引擎
按宏参数重建（G3 起按 deviceList/connections 全量驱动扩展）。

契约 v1.2（M-4/M-6）：按 projectId 自动匹配导入（新建/更新/跳过）+
mcPlanVersion 自增 + changelog 字段级 diff + plan.json 溯源保留。
"""
import datetime
import json
import os
import re
import time

from ..resolver import IntentContext
from ..project_single import SingleProjectGenerator
from .allocator_state import AllocatorState
from .plan_builder import build_plan_context
from .validate import plan_identity_warnings, validate_bridge_meta


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


# MC-M3n / MC-E1: originProjectId → 项目目录 索引缓存（TTL 5s）。
# 仅在"新建项目"时失效（更新不改索引键），保证自动流转（导入→校验→细化）中重复匹配不误建重复项目。
_origin_index_cache: dict = {}
_ORIGIN_INDEX_TTL = 5.0


def invalidate_origin_index(workspace_dir: str) -> None:
    """MC-M3n: 新建项目后失效索引（下次 find 重新扫描以命中新项目）"""
    _origin_index_cache.pop(workspace_dir, None)


def _build_origin_index(workspace_dir: str) -> dict:
    idx: dict = {}
    for name in sorted(os.listdir(workspace_dir)):
        proj_dir = os.path.join(workspace_dir, name)
        if not os.path.isdir(proj_dir):
            continue
        meta_path = os.path.join(proj_dir, 'template.meta.json')
        if not os.path.exists(meta_path):
            continue
        try:
            with open(meta_path, 'r', encoding='utf-8') as f:
                tmeta = json.load(f)
        except (OSError, ValueError):
            continue
        oid = tmeta.get('originProjectId')
        if oid:
            idx[oid] = name
    return idx


def find_mc_project_by_origin(origin_project_id: str, workspace_dir: str) -> str | None:
    """契约 v1.2（M-3 / P2 M-4 铺垫）：扫描 MC workspace，返回 originProjectId 匹配的已有项目目录名或 None。

    读取各项目 template.meta.json 的 originProjectId（无该文件 / 无身份的项目跳过）。
    P0 仅用于摘要 matched 报告；P2 将据此做自动路由/更新语义。
    MC-M3n：命中 TTL 索引缓存（5s），避免高频导入重复 O(n) 全量扫描。
    """
    if not origin_project_id or not workspace_dir or not os.path.isdir(workspace_dir):
        return None
    cached = _origin_index_cache.get(workspace_dir)
    now = time.monotonic()
    if cached and now - cached[0] < _ORIGIN_INDEX_TTL:
        return cached[1].get(origin_project_id)
    idx = _build_origin_index(workspace_dir)
    _origin_index_cache[workspace_dir] = (now, idx)
    return idx.get(origin_project_id)


def _now_utc() -> str:
    return datetime.datetime.now(datetime.timezone.utc).isoformat(timespec='seconds')


def _read_json(path, default=None):
    try:
        with open(path, 'r', encoding='utf-8') as f:
            return json.load(f)
    except (OSError, ValueError):
        return default


def _write_json(path, data):
    os.makedirs(os.path.dirname(path), exist_ok=True)
    with open(path, 'w', encoding='utf-8') as f:
        json.dump(data, f, ensure_ascii=False, indent=2)


def diff_macro(old: dict, new: dict) -> list[dict]:
    """字段级宏观 diff（camelCase macro）：返回 [{field, from, to}]。"""
    keys = sorted(set(old or {}) | set(new or {}))
    out = []
    for k in keys:
        a, b = (old or {}).get(k), (new or {}).get(k)
        if a != b:
            out.append({'field': f'macro.{k}', 'from': a, 'to': b})
    return out


def _summarize_changes(changed: list[dict]) -> str:
    if not changed:
        return '无字段级变化'
    parts = [f"{c['field']}: {c['from']} → {c['to']}" for c in changed[:5]]
    if len(changed) > 5:
        parts.append(f'…共 {len(changed)} 项')
    return '；'.join(parts)


def _default_project_dir(plan: dict, workspace_dir: str) -> str:
    """未命中匹配时：默认目录 = projectName（清洗）/ project / aidc_{gpu}，冲突加后缀。"""
    meta = plan.get('meta', {}) or {}
    macro = plan.get('macro', {}) or {}
    base = (meta.get('projectName') or meta.get('project')
            or f"aidc_{macro.get('gpuCount', '')}").strip()
    base = re.sub(r'[^\w一-鿿.\-]', '_', base).strip('._')
    if not base:
        base = 'aidc_project'
    candidate = os.path.join(workspace_dir, base)
    n = 2
    while os.path.exists(candidate):
        candidate = os.path.join(workspace_dir, f'{base}-{n}')
        n += 1
    return candidate


def _device_count(plan: dict) -> int:
    dev = plan.get('deviceList', [])
    return sum(d.get('count', 1) for d in dev) if dev and 'count' in dev[0] else len(dev)


def import_plan_auto(plan: dict, workspace_dir: str,
                     explicit_dir: str | None = None) -> dict:
    """契约 v1.2（M-4/M-6）：按 originProjectId 自动匹配导入。

    语义：
      - 命中已有同 projectId 项目且 planHash 相同 → 跳过（不重写）；
      - 命中且 planHash 不同 → **更新回原目录**（保留 allocator_state），mcPlanVersion+1，changelog 追加；
      - 未命中 → 新建（目录默认 projectName，冲突加后缀），mcPlanVersion=1；
      - 旧文件无 projectId → 按 explicit_dir（缺省默认目录）新建，matched='none'。

    返回 GUI 摘要 dict（name/device_count/matched/mcPlanVersion/changelog/origin/warnings）。
    """
    issues = validate_bridge_meta(plan)
    if issues:
        raise ValueError('; '.join(issues))
    meta = plan.get('meta', {}) or {}
    macro = plan.get('macro', {}) or {}
    origin_id = meta.get('projectId', '')
    origin_name = meta.get('projectName', '') or meta.get('project', '')
    origin_site = meta.get('site', '') or macro.get('site', '')
    origin_plan_ver = meta.get('planVersion')

    # 匹配已有项目（P0 find_mc_project_by_origin 返回相对目录名 → 拼回绝对路径）
    existing = find_mc_project_by_origin(origin_id, workspace_dir) if origin_id else None
    # 目标目录：命中 → 更新原目录；否则 explicit_dir 或默认目录
    project_dir = (os.path.join(workspace_dir, existing) if existing
                   else (explicit_dir or _default_project_dir(plan, workspace_dir)))
    name = os.path.basename(project_dir.rstrip('/'))

    # 上次导入的版本/宏观（溯源）
    prev_plan = _read_json(os.path.join(project_dir, 'plan.json')) if os.path.isdir(project_dir) else None
    prev_meta = _read_json(os.path.join(project_dir, 'template.meta.json')) if os.path.isdir(project_dir) else {}
    prev_macro = (prev_plan or {}).get('macro', {}) or {}
    prev_hash = ((prev_plan or {}).get('meta', {}) or {}).get('planHash')
    new_hash = meta.get('planHash', '')
    prev_mc = prev_meta.get('mcPlanVersion', 0) or 0

    # 跳过：同 projectId 同 planHash（内容无变化）
    if existing and prev_hash and new_hash and prev_hash == new_hash:
        return {
            'ok': True, 'matched': 'skip', 'name': name, 'project_dir': project_dir,
            'device_count': _device_count(plan), 'connections': len(plan.get('connections', [])),
            'terminals': len(plan.get('terminals', [])),
            'bridge': {k: meta.get(k) for k in ('source', 'projectType', 'bridgeVersion')},
            'mcPlanVersion': prev_mc, 'changed': False, 'changelog': prev_meta.get('changelog', []),
            'origin': {'projectId': origin_id, 'projectName': origin_name,
                       'site': origin_site, 'planVersion': origin_plan_ver, 'matched': 'skip'},
            'warnings': plan_identity_warnings(plan),
        }

    # 导入（重建派生文件；更新同目录 → allocator_state.json 天然保留）
    os.makedirs(project_dir, exist_ok=True)
    plantable_to_project(plan, project_dir)
    _write_json(os.path.join(project_dir, 'plan.json'), plan)  # 溯源/重放保留

    # 版本与变更记录（契约 v1.2 §6）
    mc_ver = prev_mc + 1 if (prev_mc or existing) else 1
    # 首次导入（无上次 plan 溯源）→ 不产 None→值 噪音 diff，标记首次导入
    changed = diff_macro(prev_macro, macro) if prev_plan is not None else []
    changelog = list(prev_meta.get('changelog') or [])
    changelog.append({
        'at': _now_utc(),
        'planVersion': meta.get('planVersion'),
        'mcPlanVersion': mc_ver,
        'planHash': new_hash,
        'changed': changed,
        'summary': _summarize_changes(changed),
    })
    tmeta = _read_json(os.path.join(project_dir, 'template.meta.json')) or {}
    tmeta['mcPlanVersion'] = mc_ver
    tmeta['changelog'] = changelog[-20:]  # 保留最近 20 条
    _write_json(os.path.join(project_dir, 'template.meta.json'), tmeta)

    matched = 'update' if existing else ('none' if not origin_id else 'new')
    # MC-M3n: 新建项目后失效索引（更新不改索引键，无需失效）
    if matched == 'new':
        invalidate_origin_index(workspace_dir)
    return {
        'ok': True, 'matched': matched, 'name': name, 'project_dir': project_dir,
        'device_count': _device_count(plan), 'connections': len(plan.get('connections', [])),
        'terminals': len(plan.get('terminals', [])),
        'bridge': {k: meta.get(k) for k in ('source', 'projectType', 'bridgeVersion')},
        'mcPlanVersion': mc_ver, 'changed': True,
        'changelog': changelog[-5:],
        'origin': {'projectId': origin_id, 'projectName': origin_name,
                   'site': origin_site, 'planVersion': origin_plan_ver, 'matched': matched},
        'warnings': plan_identity_warnings(plan),
    }


def generate_plantable_and_project(project_dir: str, pfc=3, cnp=6) -> tuple:
    """便捷：AL 出 plan:table → MC 出项目，一次闭环（用于联调/测试）。"""
    from .plantable import generate_plantable
    ctx = build_pilot64_planned(pfc, cnp)
    plan = generate_plantable(ctx)
    plantable_to_project(plan, project_dir)
    return plan, project_dir
