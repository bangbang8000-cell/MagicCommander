"""
AIDC 规划校验引擎（P1.2 FR-E：生成即校验）。

对规划上下文做专业校验，错误在规划/转换阶段暴露（不等到渲染）：
- 设备名唯一
- IP 合法、无冲突（跨设备不重复）
- 端口/VLAN 引用一致（终端口 vlan 存在且段内）
- AS 段内（65001-65500）
- PFC/CNP 队列 0-7
- VLAN 段（F14：计算 100-199 / 存储 200-299 / 业务 300-399 / 带外 400-499）
- 网关 IP 合法

返回 issues 列表（空 = 通过）。
"""

import hashlib
import ipaddress
import json

from ..resolver import IntentContext

AS_MIN, AS_MAX = 65001, 65500
VLAN_PLANE = {'compute': (100, 199), 'storage': (200, 299), 'biz': (300, 399), 'oob': (400, 499)}

# 桥接标识（契约 v1.2，判别规则见 docs/plan_table_契约v1.2 §2）
BRIDGE_FIELDS = ('source', 'projectType', 'bridgeVersion')
BRIDGE_SOURCE = 'autolink'
BRIDGE_TYPE = 'aidc'


def canonical_macro(macro: dict) -> str:
    """契约 v1.2 §1.3：canonical(macro) = json.dumps(macro, sort_keys=True, ensure_ascii=False)。

    与 AL 端 aidc_planner.canonical_macro 算法一致（契约测试桩保证）。
    """
    return json.dumps(macro, sort_keys=True, ensure_ascii=False)


def plan_hash(macro: dict) -> str:
    """planHash = sha256(canonical(macro))，双端一致算法。"""
    return hashlib.sha256(canonical_macro(macro).encode('utf-8')).hexdigest()


def validate_bridge_meta(plan: dict) -> list[str]:
    """校验 plan 的桥接标识：缺字段 / 不一致 → 报错回 AL（不静默）。"""
    meta = plan.get('meta', {}) if isinstance(plan, dict) else {}
    missing = [f for f in BRIDGE_FIELDS if not meta.get(f)]
    if missing:
        return [f'缺桥接标识 {missing}（须由 AL plan:table 契约 v1.2 提供）']
    source, ptype = meta.get('source'), meta.get('projectType')
    if ptype == BRIDGE_TYPE and source != BRIDGE_SOURCE:
        return [f'桥接标识不一致: projectType={ptype} 但 source={source}（须为 {BRIDGE_SOURCE}）']
    # 契约 v1.2 §1.1：projectId 若存在必须是非空字符串
    pid = meta.get('projectId')
    if pid is not None and (not isinstance(pid, str) or not pid.strip()):
        return [f'projectId 非法: {pid!r}（须为非空字符串）']
    return []


def plan_identity_warnings(plan: dict) -> list[str]:
    """契约 v1.2：身份缺失警告（warn 不阻断；旧 v1.0/v1.1 文件兼容导入）。"""
    meta = plan.get('meta', {}) if isinstance(plan, dict) else {}
    warnings = []
    if not meta.get('projectId'):
        warnings.append('plan 缺 projectId（v1.0/v1.1 旧文件）：无法按项目编号自动匹配，按目录导入')
    if not meta.get('planHash'):
        warnings.append('plan 缺 planHash：无法校验内容完整性')
    return warnings


def _plane_of_vlan(vlan: int) -> str | None:
    for plane, (lo, hi) in VLAN_PLANE.items():
        if lo <= vlan <= hi:
            return plane
    return None


def validate_context(ctx: IntentContext) -> list[str]:
    """校验规划上下文，返回问题列表（空 = 通过）。"""
    issues = []

    # 1) 设备名唯一 + 主机名/AS/环回/管理 提取
    hostnames = set()
    all_ips = []
    for scn, by_id in ctx.device_params.items():
        for _id, params in by_id.items():
            host = params.get(f'hostname_hostname_B_{scn}{_id}', '')
            if host:
                if host in hostnames:
                    issues.append(f'设备名重复: {host}')
                hostnames.add(host)
            else:
                issues.append(f'{scn}{_id} 缺主机名')
            # 环回/管理 IP
            for key in (f'ipv4_LoopBack_P_{scn}{_id}', f'ipv4_M-ILO_P_{scn}{_id}'):
                val = params.get(key)
                if val:
                    ip = str(val).split('/')[0]
                    all_ips.append((host, key, ip))
            # AS
            asn = params.get(f'hostname_hostname_E_{scn}{_id}')
            if asn is not None and not (AS_MIN <= int(asn) <= AS_MAX):
                issues.append(f'{host} AS 越界: {asn}')

    # 2) IP 合法 + 无冲突
    seen_ip = {}
    for host, key, ip in all_ips:
        try:
            ipaddress.ip_address(ip)
        except ValueError:
            issues.append(f'{host} 非法 IP: {ip}')
            continue
        if ip in seen_ip:
            issues.append(f'IP 冲突: {ip}（{seen_ip[ip]} 与 {host}.{key}）')
        else:
            seen_ip[ip] = f'{host}.{key}'

    # 3) 队列 0-7
    for q in ('pfc_queue', 'cnp_queue'):
        v = ctx.globals.get(q)
        if v is not None and not (0 <= int(v) <= 7):
            issues.append(f'{q} 须在 0-7: {v}')

    # 4) 终端 VLAN 段内 + 端口数对齐
    for scn, by_id in ctx.device_params.items():
        for _id in by_id:
            host = ctx.device_params[scn][_id].get(f'hostname_hostname_B_{scn}{_id}', '')
            for lname in ('gpu_port', 'biz_port', 'downlink_port'):
                ports = ctx.lists.get(f'{scn}_{lname}{_id}', [])
                if not ports:
                    continue
                vname = lname.replace('port', 'vlan')
                vlans = ctx.lists.get(f'{scn}_{vname}{_id}', [])
                # L2 终端口（有 vlan 列表）校验 vlan 数与端口一致；L3 路由口（无 vlan）跳过
                if vlans:
                    if len(vlans) != len(ports):
                        issues.append(f'{host} {lname} 端口数({len(ports)}) 与 vlan 数({len(vlans)}) 不一致')
                    for v in vlans:
                        if _plane_of_vlan(int(v)) is None:
                            issues.append(f'{host} VLAN {v} 不在 F14 段内')
            # 上联 IP 合法
            for ip in ctx.lists.get(f'{scn}_uplink_ip{_id}', []):
                try:
                    ipaddress.ip_address(ip)
                except ValueError:
                    issues.append(f'{host} 上联 IP 非法: {ip}')

    return issues


# 契约级必填宏观字段（camelCase 或 snake_case；缺 → 报错回 AL）
_REQUIRED_MACRO = ('site', 'gpuCount', 'pfcQueue', 'cnpQueue')
_MACRO_SNAKE = {'gpuCount': 'gpu_count', 'pfcQueue': 'pfc_queue', 'cnpQueue': 'cnp_queue'}
# 接线 dst 允许的语义角色（契约 §5）
_ROLE_SET = {'SPINE', 'LEAF', 'STO_SPINE', 'STO_LEAF',
             'BIZ_AGG', 'BIZ_ACCESS', 'OOB_AGG', 'OOB_ACCESS', 'SPINE/AGG'}


def validate_plan(plan: dict) -> list[str]:
    """校验 plan:table（G3.3 契约级）：桥接标识 + macro 完整 + deviceList 一致 + 接线引用。"""
    issues = validate_bridge_meta(plan)
    macro = plan.get('macro', {})
    # 1) 必填宏观字段（缺 → 回报 AL）
    missing = [f for f in _REQUIRED_MACRO
               if not macro.get(f) and not macro.get(_MACRO_SNAKE.get(f, ''))]
    if missing:
        issues.append(f'缺宏观字段 {missing}（请回 AL 补齐）')
    # 2) 队列 0-7
    for camel, snake in (('pfcQueue', 'pfc_queue'), ('cnpQueue', 'cnp_queue')):
        v = macro.get(camel, macro.get(snake))
        if v is not None and not (0 <= int(v) <= 7):
            issues.append(f'{camel} 须在 0-7: {v}')
    # 3) deviceList 非空 + 设备名唯一（兼容逐设备 name 与分组式 devices 两种形式）
    devs = plan.get('deviceList', [])
    if not devs:
        issues.append('deviceList 为空')
    names = []
    for d in devs:
        if d.get('name'):
            names.append(d['name'])
        if d.get('devices'):
            names.extend(d['devices'])
    dup = {n for n in names if names.count(n) > 1}
    if dup:
        issues.append(f'设备名重复: {dup}')
    # 4) 接线引用完整：src 须在 deviceList；dst 须为角色或 deviceList 设备
    known = set(names)
    for c in plan.get('connections', []):
        s, d = c.get('src', ''), c.get('dst', '')
        if s and s not in known:
            issues.append(f'接线 src 未在 deviceList: {s}')
        if d and d not in known and d not in _ROLE_SET:
            issues.append(f'接线 dst 未知: {d}')
    # 5) planHash 完整性（契约 v1.2 §7）：重算比对，防"版本号一致但内容被篡改/算法不同步"
    ph = (plan.get('meta', {}) or {}).get('planHash')
    if ph:
        try:
            if plan_hash(macro) != str(ph):
                issues.append('planHash 与 macro 不符（文件被篡改或算法不同步）')
        except (TypeError, ValueError):
            issues.append('planHash 校验失败（macro 不可序列化）')
    return issues
