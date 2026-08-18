#!/usr/bin/env python
# -*- coding: utf-8 -*-
"""渲染输出 vs 华三 RoCE 基准 命令核对（P1 试点验收辅助）。

扫描 aidc_pilot64/output/<最新时间戳>/ 下全部设备配置文本，
按「命令核对清单 v1.0（2026-08-13）」核对项 + 设备角色适用性输出命中矩阵。

用法：
    python scripts/verify_rendered.py [项目目录]

图例：✅ 命中 · ❌ 未命中 · — 该设备类型不适用
"""
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
