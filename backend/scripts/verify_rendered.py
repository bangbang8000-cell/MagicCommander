#!/usr/bin/env python
# -*- coding: utf-8 -*-
"""渲染输出 vs 华三 RoCE 基准 命令核对（P1 试点验收辅助）。

扫描 aidc_pilot64/output/<最新时间戳>/ 下全部设备配置文本，
按「命令核对清单 v1.0（2026-08-13）」核对项 + 设备角色适用性输出命中矩阵。

用法：
    python scripts/verify_rendered.py [项目目录]

图例：✅ 命中 · ❌ 未命中 · — 该设备类型不适用
"""
import ipaddress
import json
import os
import re
import sys

# 项目目录（默认 aidc_pilot64）
DEFAULT_PROJECT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..',
                                                'workspace', 'H3C-64台-BJ01'))

# 核对项 → 基准正则（依据：命令核对清单 v1.0 / FR-8 华三 RoCE 基准）
CHECKS = [
    ('管理VRF', r'ip vpn-instance Mgnt'),
    ('管理口绑Mgnt', r'ip binding vpn-instance Mgnt'),
    ('PFC头空间', r'priority-flow-control poolid'),
    ('PFC无损dot1p3', r'priority-flow-control no-drop dot1p \d+'),
    ('PFC死锁', r'priority-flow-control deadlock'),
    ('Buffer共享', r'buffer egress cell queue'),
    ('dot1p映射', r'qos map-table dot1p-lp'),
    ('DSCP信任', r'qos trust dscp'),
    ('CNP_WFQ_cs6', r'qos wfq cs\d+ group sp'),
    ('400G_WRED', r'qos wred apply 400G-WRED-Template'),
    ('200G_WRED', r'qos wred apply 200G-WRED-Template'),
    ('CNP_gts', r'qos gts queue'),
    ('EBGP进程', r'router bgp \d+'),
    ('EBGP_ECMP', r'maximum-paths ebgp \d+'),
    ('EBGP邻居/31', r'neighbor \S+ as-number \d+'),
    ('环回通告', r'network \S+ mask 255\.255\.255\.255'),
    ('上联路由口', r'port link-mode route'),
    ('MLAG', r'mlag system-mac'),
    ('分光子口', r'TwoHundredGigE1/0/\d+:\d+\b'),
    ('桥接口', r'port link-mode bridge'),
    ('edged_port', r'stp edged-port'),
    ('VLAN网关', r'interface Vlan-interface'),
]

# 角色（输出目录名）→ 平面 + 适用核对项集合（按命令核对清单的适用性）
PFC_CORE = ['管理VRF', '管理口绑Mgnt', 'PFC头空间', 'PFC无损dot1p3', 'PFC死锁',
            'Buffer共享', 'dot1p映射', 'DSCP信任', 'CNP_WFQ_cs6', 'CNP_gts']
EBGP_CORE = ['EBGP进程', 'EBGP_ECMP', 'EBGP邻居/31', '环回通告', '上联路由口']
PARAM_SPINE = PFC_CORE + ['400G_WRED'] + EBGP_CORE
PARAM_LEAF = PFC_CORE + ['400G_WRED', '200G_WRED'] + EBGP_CORE + ['分光子口', '桥接口', 'edged_port', 'VLAN网关']
STO_SPINE = PFC_CORE + ['200G_WRED'] + EBGP_CORE
STO_LEAF = PFC_CORE + ['200G_WRED'] + EBGP_CORE + ['桥接口', 'edged_port', 'VLAN网关']
BIZ_AGG = ['管理VRF', '管理口绑Mgnt'] + EBGP_CORE
BIZ_ACC = BIZ_AGG + ['MLAG', '桥接口', 'edged_port', 'VLAN网关']
OOB_AGG = ['管理VRF', '管理口绑Mgnt']
OOB_ACC = OOB_AGG + ['桥接口', 'edged_port']

ROLE_CHECKS = {
    'SPINE': (PARAM_SPINE, '参数网'), 'LEAF': (PARAM_LEAF, '参数网'),
    'STO_SPINE': (STO_SPINE, '存储网'), 'STO_LEAF': (STO_LEAF, '存储网'),
    'BIZ_AGG': (BIZ_AGG, '业务网'), 'BIZ_ACCESS': (BIZ_ACC, '业务网'),
    'OOB_AGG': (OOB_AGG, '带外网'), 'OOB_ACCESS': (OOB_ACC, '带外网'),
}


def verify_project_data(project_dir: str) -> dict:
    """契约 v1.2（P2 V-MC2）：命令核对 → 结构化数据（GUI 命中矩阵用）。"""
    output_dir = os.path.join(project_dir, 'output')
    if not os.path.isdir(output_dir):
        return {'ok': False, 'error': f'无 output 目录: {output_dir}', 'checks': [], 'devices': [], 'summary': {}}
    ts = sorted(os.listdir(output_dir))[-1]
    base = os.path.join(output_dir, ts)
    txts = [f for f in glob_txt(base)]
    if not txts:
        return {'ok': False, 'error': f'{base} 下无 .txt 配置', 'checks': [], 'devices': [], 'summary': {}}
    all_checks = [c[0] for c in CHECKS]
    summary: dict = {}
    devices = []
    for p in sorted(txts):
        role = os.path.basename(os.path.dirname(p))
        name = os.path.splitext(os.path.basename(p))[0]
        text = open(p, encoding='utf-8').read()
        applicable, plane = ROLE_CHECKS.get(role, (all_checks, '?'))
        results = []
        for cname, regex in CHECKS:
            if cname in applicable:
                hit = bool(re.search(regex, text))
                s = summary.setdefault(cname, {'total': 0, 'hit': 0})
                s['total'] += 1
                if hit:
                    s['hit'] += 1
                results.append({'check': cname, 'applicable': True, 'hit': hit})
            else:
                results.append({'check': cname, 'applicable': False, 'hit': None})
        devices.append({'name': name, 'role': role, 'plane': plane, 'results': results})
    return {'ok': True, 'rendered_at': ts, 'checks': all_checks,
            'devices': devices, 'summary': summary}


# ---------------------------------------------------------------------------
# 5.0.1（501-d）：结构核对（设备数 / 命名规范 / IP 连通 / 连接表 / 收敛比）
# ---------------------------------------------------------------------------

# 接口名 → 速率（Gbps）
_PORT_RATES = (
    ('FourHundredGigE', 400), ('TwoHundredGigE', 200), ('HundredGigE', 100),
    ('Twenty-FiveGigE', 25), ('Ten-GigabitEthernet', 10), ('GigabitEthernet', 1),
)


def _port_rate(ifname):
    for prefix, rate in _PORT_RATES:
        if str(ifname).startswith(prefix):
            return rate
    return None


def _read_plan(project_dir):
    path = os.path.join(project_dir, 'plan.json')
    if not os.path.exists(path):
        return None
    try:
        with open(path, encoding='utf-8') as f:
            return json.load(f)
    except (OSError, ValueError):
        return None


def _naming_abbr_map(plan):
    return (plan.get('macro', {}).get('naming') or {}).get('abbr') or {}


def _naming_pattern(plan, site):
    """由命名 format 构建结构正则：{site}-R{rack:02d}-AIDC-{vendor}-{abbr}-{seq:02d}。"""
    fmt = (plan.get('macro', {}).get('naming') or {}).get('format', '')
    pattern = fmt.replace('{site}', re.escape(str(site))).replace('{rack:02d}', r'\d{2}')
    pattern = pattern.replace('{vendor}', r'[\w-]+').replace('{abbr}', r'[\w-]+').replace('{seq:02d}', r'\d{2}')
    return pattern


def _verify_naming(records, plan, issues):
    site = plan.get('macro', {}).get('site', '')
    abbr_map = _naming_abbr_map(plan)
    pattern = _naming_pattern(plan, site)
    names = {n for n, _, _ in records}
    for d in plan.get('deviceList', []):
        name = d.get('name', '')
        if name not in names:
            issues.append(f'plan 设备 {name} 未渲染')
            continue
        abbr = abbr_map.get(d.get('scenario', ''), '')
        if pattern and not re.fullmatch(pattern, name):
            issues.append(f'设备名 {name} 不符合命名规范 {pattern}')
        elif abbr and abbr not in name:
            issues.append(f'设备名 {name} 缺角色 abbr {abbr}')


def _ip_in(net, ip):
    try:
        return ipaddress.ip_address(ip) in ipaddress.ip_network(net)
    except ValueError:
        return False


def _verify_ip_connectivity(records, plan, issues):
    seg = plan.get('macro', {}).get('ipSegments') or {}
    loop_seg = seg.get('loopback', '10.1.0.0/20')
    oob_seg = seg.get('oob', '10.1.64.0/21')
    inter_seg = seg.get('interconnect', '10.1.72.0/21')
    for name, role, text in records:
        m = re.search(r'interface LoopBack0\s+ip address (\S+) 255\.255\.255\.255', text)
        if m and not _ip_in(loop_seg, m.group(1)):
            issues.append(f'{name} 环回 IP {m.group(1)} 不在环回段 {loop_seg}')
        m = re.search(r'interface M-GigabitEthernet0/0/0.*?ip address (\S+) 255\.255\.255\.0', text, re.S)
        if m and not _ip_in(oob_seg, m.group(1)):
            issues.append(f'{name} 管理 IP {m.group(1)} 不在带外/管理段 {oob_seg}')
        for m in re.finditer(r'ip address (\S+) 255\.255\.255\.254', text):
            if not _ip_in(inter_seg, m.group(1)):
                issues.append(f'{name} 互联 IP {m.group(1)} 不在互联段 {inter_seg}')


def _rate_gbps(rate):
    m = re.match(r'^(\d+(?:\.\d+)?)\s*[Gg]$', str(rate or '').strip())
    return float(m.group(1)) if m else None


def _verify_connection_table(records, plan, issues, metrics):
    """连接表：plan connections 的 己端端口/速率 在渲染文本中对端引用齐全。

    对端引用 = 渲染配置含 `interface <己端端口>`（L3 上联 /31、L2 trunk/access 均覆盖）；
    速率 = 接口名速率前缀与连接表 rate 声明一致。
    """
    by_src = {}
    for c in plan.get('connections', []):
        by_src.setdefault(c.get('src', ''), []).append(c)
    records_by_name = {n: (n, r, t) for n, r, t in records}
    uplink_totals = []
    for name, conns in by_src.items():
        rec = records_by_name.get(name)
        if rec is None:
            issues.append(f'连接对端 {name} 未渲染')
            continue
        text = rec[2]
        plan_ports = [c.get('src_port') for c in conns]
        missing = [p for p in plan_ports
                   if not re.search(rf'^interface\s+{re.escape(str(p))}$', text, re.M)]
        if missing:
            issues.append(f'{name} 连接表缺对端接口 {missing[:5]}（{len(plan_ports) - len(missing)}/{len(plan_ports)}）')
        # 速率：接口名前缀 vs 连接表 rate
        for c in conns:
            named = _port_rate(c.get('src_port'))
            declared = _rate_gbps(c.get('rate'))
            if named and declared and abs(named - declared) > 1e-9:
                issues.append(f'{name} {c.get("src_port")} 接口速率({named}G) 与连接表 rate({c.get("rate")}) 不符')
        uplink_totals.append(sum(_port_rate(p) or 0 for p in plan_ports))
    metrics['uplink_bandwidth_g'] = sum(uplink_totals)


def _verify_convergence(plan, issues, metrics):
    """收敛比：参数网 LEAF 下联带宽 / 上联带宽 vs plan macro.convergence 目标。"""
    conns = plan.get('connections', [])
    terms = plan.get('terminals', [])
    leaf_names = {d['name'] for d in plan.get('deviceList', []) if d.get('role') == 'LEAF'}
    leaf_conns = [c for c in conns if c.get('src') in leaf_names]
    leaf_terms = [t for t in terms if t.get('src') in leaf_names]
    down = sum(_port_rate(t.get('src_port')) or 0 for t in leaf_terms)
    up = sum(_port_rate(c.get('src_port')) or 0 for c in leaf_conns)
    target = plan.get('macro', {}).get('convergence')
    ratio = (down / up) if up else None
    metrics['convergence_actual'] = ratio
    metrics['convergence_target'] = target
    if target is None or up == 0:
        return
    target = float(target)
    # 允许下联/上联带宽比不超过目标（不超售）；IB（目标=1）要求精确 1:1
    if ratio is not None and ratio > target + 0.01:
        issues.append(f'参数网收敛比 {ratio:.2f}:1 超过目标 {target:g}:1')
    if ratio is not None and abs(target - 1.0) < 1e-9 and abs(ratio - 1.0) > 0.01:
        issues.append(f'IB 参数网收敛比须 1:1，实际 {ratio:.2f}:1')


def verify_structural(records, plan):
    """501-d：结构核对（设备数/命名/IP 连通/连接表/收敛比）。返回 (issues, metrics)。"""
    issues = []
    metrics = {'device_count': len(records), 'plan_device_count': len(plan.get('deviceList', []))}

    # 1) 设备数
    if len(records) != len(plan.get('deviceList', [])):
        issues.append(f'渲染设备数 {len(records)} ≠ plan deviceList {len(plan.get("deviceList", []))}')

    # 2) 命名规范
    _verify_naming(records, plan, issues)

    # 3) IP 连通（环回/管理/互联段）
    _verify_ip_connectivity(records, plan, issues)

    # 4) 连接表（对端引用 / 速率）
    _verify_connection_table(records, plan, issues, metrics)

    # 5) 收敛比（上联/下联 vs 目标）
    _verify_convergence(plan, issues, metrics)

    return issues, metrics


def verify_project_full(project_dir: str) -> dict:
    """501-d：渲染产物全量核对 = 命令核对矩阵 + 结构核对（设备数/命名/IP/连接表/收敛比）。"""
    cmd = verify_project_data(project_dir)
    out = dict(cmd)
    plan = _read_plan(project_dir)
    if cmd.get('ok') and plan:
        records = [(d['name'], d['role'], '') for d in cmd.get('devices', [])]
        # 重新读取文本（verify_project_data 未保留原文）
        base = os.path.join(project_dir, 'output', cmd.get('rendered_at', ''))
        texts = {}
        for p in glob_txt(base):
            texts[os.path.splitext(os.path.basename(p))[0]] = open(p, encoding='utf-8').read()
        records = [(n, r, texts.get(n, '')) for n, r, _ in records]
        issues, metrics = verify_structural(records, plan)
        out['structural'] = {'ok': not issues, 'issues': issues, 'metrics': metrics}
        out['ok'] = out['ok'] and not issues
    return out


def main(project_dir: str = DEFAULT_PROJECT):
    output_dir = os.path.join(project_dir, 'output')
    if not os.path.isdir(output_dir):
        print(f'[ERR] 无 output 目录: {output_dir}')
        return 1
    ts = sorted(os.listdir(output_dir))[-1]  # 最新渲染
    base = os.path.join(output_dir, ts)
    txts = [f for f in glob_txt(base)]
    if not txts:
        print(f'[ERR] {base} 下无 .txt 配置')
        return 1

    print(f'渲染产物: {base}  ({len(txts)} 台设备)\n')
    devices = []
    for p in sorted(txts):
        role_dir = os.path.basename(os.path.dirname(p))
        role = role_dir
        name = os.path.splitext(os.path.basename(p))[0]
        text = open(p, encoding='utf-8').read()
        devices.append((name, role, text))

    # 命中矩阵
    all_checks = [c[0] for c in CHECKS]
    headers = ['设备'] + all_checks
    print(' | '.join(headers))
    print('-|-'.join(['---'] * len(headers)))

    summary = {}
    for name, role, text in devices:
        applicable, plane = ROLE_CHECKS.get(role, (all_checks, '?'))
        row = [f'{name}']
        for cname, _ in CHECKS:
            if cname in applicable:
                hit = bool(re.search(dict(CHECKS)[cname], text))
                row.append('✅' if hit else '❌')
                summary.setdefault(cname, {'total': 0, 'hit': 0})['total'] += 1
                if hit:
                    summary[cname]['hit'] += 1
            else:
                row.append('—')
        print(' | '.join(row))

    # 汇总
    print('\n=== 命中汇总（适用项） ===')
    for cname in all_checks:
        s = summary.get(cname)
        if s and s['total']:
            status = '✅' if s['hit'] == s['total'] else '⚠️'
            print(f'{status} {cname}: {s["hit"]}/{s["total"]}')
    return 0


def glob_txt(base):
    out = []
    for root, _, files in os.walk(base):
        for f in files:
            if f.endswith('.txt'):
                out.append(os.path.join(root, f))
    return out


if __name__ == '__main__':
    sys.exit(main(sys.argv[1] if len(sys.argv) > 1 else DEFAULT_PROJECT))
