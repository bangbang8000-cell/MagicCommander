"""
命令核对脚本（P1 验收前置）：把渲染配置与华三 S9825 命令基准逐项比对。

用法：
    python -m intent.verify_baseline <华三示例目录> [输出md路径]

比对维度（FR-8 / 华三 RoCE 参数网示例）：
- 管理面：ip vpn-instance Mgnt / M-GigabitEthernet0/0/0 绑定
- PFC：priority-flow-control poolid headroom / no-drop dot1p / deadlock
- QoS：buffer egress cell queue / qos map-table / trust dscp / wfq / wred / gts
- Underlay：ospf 进程·区域·router-id / network-type p2p
- 接口：上联 400G 路由口 / GPU 200G 桥接口（access vlan）/ 分光子口命名
- 网关：Vlan-interface
- sysname 命名规范

输出：核对清单 markdown（✅ 匹配 / ⚠️ 需人工确认 / ❌ 缺失）。
"""

import os
import re
import sys

from .pilot64 import build_pilot64_context, render_pilot64_projects

# 核对项：类别 -> [(检查函数, 描述, 基准说明)]
_CHECKERS = [
    ('管理面', lambda t: 'ip vpn-instance Mgnt' in t,
     '管理 VRF（Mgnt）', '基准：ip vpn-instance Mgnt'),
    ('管理面', lambda t: 'ip binding vpn-instance Mgnt' in t,
     '管理口绑定 Mgnt', '基准：M-GE0/0/0 ip binding vpn-instance Mgnt'),
    ('PFC', lambda t: 'priority-flow-control poolid 0 headroom' in t,
     'PFC 头空间 poolid', '基准：priority-flow-control poolid 0 headroom 80000'),
    ('PFC', lambda t: 'priority-flow-control no-drop dot1p 3' in t,
     'PFC 无损队列 dot1p=3', '基准：no-drop dot1p 3（F16 可调）'),
    ('PFC', lambda t: 'priority-flow-control deadlock' in t,
     'PFC 死锁检测', '基准：deadlock cos 3 interval 10 / auto-recover'),
    ('QoS', lambda t: 'buffer egress cell queue' in t and 'buffer apply' in t,
     'Buffer 队列共享', '基准：buffer egress cell queue 6/3 shared ratio 100 + buffer apply'),
    ('QoS', lambda t: 'qos map-table dot1p-lp' in t,
     'dot1p→LP 映射表', '基准：qos map-table dot1p-lp import 0..7'),
    ('QoS', lambda t: 'qos trust dscp' in t,
     'DSCP 信任', '基准：qos trust dscp'),
    ('QoS', lambda t: 'qos wfq cs6 group sp' in t,
     'CNP 队列 WFQ（cs6）', '基准：qos wfq cs6 group sp（F16 CNP=6 可调）'),
    ('QoS', lambda t: 'qos wred apply 400G-WRED-Template' in t,
     '400G WRED/ECN 模板', '基准：qos wred apply 400G-WRED-Template'),
    ('QoS', lambda t: 'qos wred apply 200G-WRED-Template' in t,
     '200G WRED/ECN 模板', '基准：qos wred apply 200G-WRED-Template'),
    ('QoS', lambda t: 'qos gts queue 6 cir 200000000' in t,
     'CNP 队列 gts 整形', '基准：qos gts queue 6 cir 200000000 cbs 16000000（F16 可调）'),
    ('Underlay', lambda t: 'router bgp' in t,
     'EBGP 进程（Leaf-Spine）', '基准：router bgp <AS>（RFC7938，2026-08-13）'),
    ('Underlay', lambda t: 'maximum-paths ebgp' in t,
     'EBGP ECMP 多路径', '基准：maximum-paths ebgp 16'),
    ('Underlay', lambda t: 'neighbor 10.' in t and 'as-number' in t,
     'EBGP 邻居（/31）', '基准：neighbor <对端/31> as-number <对端AS>'),
    ('Underlay', lambda t: 'network ' in t and 'mask 255.255.255.255' in t,
     '环回/网关 BGP 通告', '基准：network <loopback/gw> mask'),
    ('接口', lambda t: 'port link-mode route' in t,
     '上联 400G 路由口', '基准：上联口 port link-mode route'),
    ('MLAG', lambda t: 'mlag system-mac' in t and 'mlag keepalive' in t,
     'ACC 间 MLAG', '基准：mlag system-mac + system-number + keepalive（H3C 直接 MLAG）'),
    ('接口', lambda t: 'interface TwoHundredGigE1/0/1:1' in t,
     'GPU 200G 分光子口命名', '基准：TwoHundredGigE1/0/1:1 / :2（1分2）'),
    ('接口', lambda t: 'port link-mode bridge' in t and 'port access vlan' in t,
     'GPU 200G 桥接口+access vlan', '基准：GPU 口 port link-mode bridge / access vlan'),
    ('接口', lambda t: 'stp edged-port' in t,
     'GPU 口 edged-port', '基准：stp edged-port'),
    ('网关', lambda t: 'interface Vlan-interface' in t,
     'VLAN 网关接口', '基准：Vlan-interface171/172 + 网关 IP'),
]


def check_rendered(rendered: dict) -> dict:
    """对每类渲染文本逐项核对，返回 {plane: {device: {check_name: bool}}}。"""
    results = {}
    for plane, devices in rendered.items():
        results[plane] = {}
        for hostname, text in devices.items():
            results[plane][hostname] = {
                name: (bool(fn(text)), note, desc, base)
                for _cat, fn, desc, base in _CHECKERS
                for name, note in [(desc, None)]
            }
    return results


def build_checklist(rendered: dict, out_md: str | None = None) -> str:
    """生成核对清单 markdown。"""
    lines = []
    lines.append('# P1 试点 命令核对清单（渲染 vs 华三 S9825 基准）\n')
    lines.append('> 生成：' + '2026-08-13' + '  | 依据：FR-8 华三 RoCE 命令核对基准 | F16 PFC/CNP 队列可调')
    lines.append('> 图例：✅ 匹配 · ⚠️ 需人工确认 · ❌ 缺失\n')

    # 汇总矩阵
    lines.append('## 1. 核对项 × 平面 命中矩阵\n')
    lines.append('| 核对项 | 参数网 | 存储网 | 业务&管理网 | 带外网 |')
    lines.append('|---|---|---|---|---|')
    cat_order = []
    names = []
    for _cat, _fn, desc, _base in _CHECKERS:
        if desc not in names:
            names.append(desc)
    for _cat, _fn, desc, _base in _CHECKERS:
        if _cat not in cat_order:
            cat_order.append(_cat)

    per_plane_hit = {p: {} for p in rendered}
    for plane, devices in rendered.items():
        for hostname, text in devices.items():
            for _cat, fn, desc, _base in _CHECKERS:
                per_plane_hit[plane][desc] = per_plane_hit[plane].get(desc, 0) + (1 if fn(text) else 0)

    for desc in names:
        counts = []
        for plane in rendered:
            hit = per_plane_hit[plane].get(desc, 0)
            total = len(rendered[plane])
            mark = '✅' if hit == total and total > 0 else ('⚠️' if hit > 0 else '—')
            counts.append(f'{mark} {hit}/{total}')
        lines.append(f'| {desc} | ' + ' | '.join(counts) + ' |')

    # 逐设备明细（代表性设备）
    lines.append('\n## 2. 代表性设备核对明细\n')
    for plane, want in [('参数网', 'P-Spine-01'), ('参数网', 'P-Leaf-01'),
                        ('存储网', 'S-Leaf-01'), ('业务&管理网', 'BIZ-AGG-01'),
                        ('带外网', 'OOB-ACC-01')]:
        dev = next((k for k in rendered.get(plane, {}) if want in k), None)
        if not dev:
            continue
        text = rendered[plane][dev]
        lines.append(f'### {plane} / {dev}\n')
        lines.append('| 核对项 | 状态 | 说明 |')
        lines.append('|---|---|---|')
        for _cat, fn, desc, base in _CHECKERS:
            ok = fn(text)
            # 不适用判定：无损项对业务/带外；EBGP 对带外；MLAG 对参数/存储/带外
            if _cat in ('PFC', 'QoS') and plane in ('业务&管理网', '带外网'):
                lines.append(f'| {desc} | — | 不适用（非无损平面） |')
                continue
            if _cat == 'Underlay' and plane == '带外网':
                lines.append(f'| {desc} | — | 不适用（带外不跑 EBGP） |')
                continue
            if _cat == 'MLAG' and plane in ('参数网', '存储网', '带外网'):
                lines.append(f'| {desc} | — | 不适用（仅业务 ACC） |')
                continue
            mark = '✅' if ok else '❌'
            lines.append(f'| {desc} | {mark} | {base} |')
        lines.append('')

    if out_md:
        with open(out_md, 'w', encoding='utf-8') as f:
            f.write('\n'.join(lines))
    return '\n'.join(lines)


def main():
    import tempfile
    from .pilot64 import render_pilot
    from .planner.pilot_builder import build_pilot64_planned
    from .project_single import generate_single_pilot64_project
    import config as mc_config
    tmp = tempfile.mkdtemp()
    mc_config.WORKSPACE_DIR = tmp
    # 用规划引擎上下文 + 意图模板渲染逐设备配置（canonical）
    rendered = render_pilot(build_pilot64_planned(), os.path.join(tmp, 'configs'))
    out_md = sys.argv[1] if len(sys.argv) > 1 else None
    md = build_checklist(rendered, out_md)
    if out_md:
        print(f'[OK] 命令核对清单已生成: {out_md} ({len(md)} 字符)')
    else:
        # 控制台输出纯 ASCII（避免 GBK 编码问题）
        ascii_md = md.replace('✅', '[OK]').replace('⚠️', '[WARN]').replace('❌', '[MISS]')
        print(ascii_md)


if __name__ == '__main__':
    main()
