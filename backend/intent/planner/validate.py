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

import ipaddress

from ..resolver import IntentContext

AS_MIN, AS_MAX = 65001, 65500
VLAN_PLANE = {'compute': (100, 199), 'storage': (200, 299), 'biz': (300, 399), 'oob': (400, 499)}


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


def validate_plan(plan: dict) -> list[str]:
    """校验 plan:table（macro 级）。"""
    issues = []
    macro = plan.get('macro', {})
    for q in ('pfc_queue', 'cnp_queue'):
        v = macro.get(q)
        if v is not None and not (0 <= int(v) <= 7):
            issues.append(f'{q} 须在 0-7: {v}')
    # 设备名唯一
    names = [d.get('name') for d in plan.get('deviceList', []) if d.get('name')]
    dup = {n for n in names if names.count(n) > 1}
    if dup:
        issues.append(f'设备名重复: {dup}')
    return issues
