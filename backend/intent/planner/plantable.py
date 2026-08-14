"""
P1.3 plan:table 生成器（AL 规划输出，接口契约 PRD v2.0 §5）。

把规划上下文（IntentContext）序列化为 AL→MC 的 plan:table JSON：
- meta / macro（可调参数：PFC/CNP 队列、收敛比、命名、AS 段、设备选型）
- deviceList（设备清单：角色/型号/机柜/AS）
- connections（接线规划：上联 + 终端，端口级 + 描述）
- vlanRanges / protocols（VLAN 段、BGP AS/ECMP）
- convergence

AL 程序据此输出；MC 程序（plantable_importer）消费生成项目。
"""

from ..resolver import IntentContext

_SCN_TO_ROLE = {
    'SPINE': 'SPINE', 'LEAF': 'LEAF', 'STO_SPINE': 'STO_SPINE', 'STO_LEAF': 'STO_LEAF',
    'BIZAGG': 'BIZ_AGG', 'BIZACC': 'BIZ_ACCESS', 'OOBAGG': 'OOB_AGG', 'OOBACC': 'OOB_ACCESS',
}
_SCN_MODEL = {
    'SPINE': 'H3C S9827', 'LEAF': 'H3C S9827', 'STO_SPINE': 'H3C S9825-128B', 'STO_LEAF': 'H3C S9825-128B',
    'BIZAGG': 'H3C S9850', 'BIZACC': 'H3C S6805', 'OOBAGG': 'H3C S5820V2', 'OOBACC': 'H3C S5820V2',
}
_TERMINAL_KEY = {'LEAF': 'gpu', 'STO_LEAF': 'gpu', 'BIZACC': 'biz', 'OOBACC': 'downlink'}


def _dev(ctx, scn, local, var_tail):
    return ctx.device_params.get(scn, {}).get(local, {}).get(f'{var_tail}{scn}{local}')


def _lst(ctx, scn, local, name):
    return ctx.lists.get(f'{scn}_{name}{local}', [])


def generate_plantable(ctx: IntentContext, project: str = 'aidc_pilot64') -> dict:
    """从规划上下文生成 plan:table JSON。"""
    site = 'BJ01'
    # 设备清单
    device_list = []
    for scn in sorted(ctx.device_params):
        count = len(ctx.device_params[scn])
        racks = sorted({_dev(ctx, scn, l, 'hostname_hostname_B_') for l in ctx.device_params[scn]})
        asn = _dev(ctx, scn, 1, 'hostname_hostname_E_')
        device_list.append({
            'role': _SCN_TO_ROLE[scn], 'scenario': scn, 'model': _SCN_MODEL[scn],
            'count': count, 'asn': asn,
            'devices': sorted(racks),
        })

    # 接线规划（上联 + 终端）
    connections = []
    terminals = []
    for scn in sorted(ctx.device_params):
        for local in sorted(ctx.device_params[scn]):
            host = _dev(ctx, scn, local, 'hostname_hostname_B_')
            # 上联
            for i, port in enumerate(_lst(ctx, scn, local, 'uplink_port')):
                ip = _lst(ctx, scn, local, 'uplink_ip')[i] if i < len(_lst(ctx, scn, local, 'uplink_ip')) else ''
                desc = _lst(ctx, scn, local, 'uplink_desc')[i] if i < len(_lst(ctx, scn, local, 'uplink_desc')) else ''
                peer_ip = _lst(ctx, scn, local, 'bgp_peer_ip')[i] if i < len(_lst(ctx, scn, local, 'bgp_peer_ip')) else ''
                connections.append({
                    'src': host, 'src_port': port, 'src_ip': ip,
                    'dst': 'SPINE/AGG', 'dst_ip': peer_ip,
                    'rate': '400G' if scn in ('SPINE', 'LEAF') else '200G' if scn.startswith('STO')
                            else '100G' if scn.startswith('BIZ') else '1G',
                    'desc': desc,
                })
            # 终端
            tkey = _TERMINAL_KEY.get(scn)
            if tkey:
                ports = _lst(ctx, scn, local, f'{tkey}_port')
                vlans = _lst(ctx, scn, local, f'{tkey}_vlan')
                descs = _lst(ctx, scn, local, f'{tkey}_desc')
                for i, p in enumerate(ports):
                    terminals.append({
                        'src': host, 'src_port': p,
                        'vlan': vlans[i] if i < len(vlans) else None,
                        'desc': descs[i] if i < len(descs) else '',
                    })

    return {
        'meta': {'project': project, 'site': site, 'version': '1.0'},
        'macro': {
            'site': site,
            'pfc_queue': ctx.globals.get('pfc_queue', 3),
            'cnp_queue': ctx.globals.get('cnp_queue', 6),
            'bgp_max_paths': ctx.globals.get('bgp_max_paths', 16),
            'convergence': 1.0,
            'rails': 8,
            'deviceModels': dict(_SCN_MODEL),
            'asRange': [65001, 65500],
            'vlanRanges': {'compute': [100, 199], 'storage': [200, 299],
                           'biz': [300, 399], 'oob': [400, 499]},
        },
        'deviceList': device_list,
        'connections': connections,
        'terminals': terminals,
        'protocols': {'bgp': {'asRange': [65001, 65500], 'ecmp': ctx.globals.get('bgp_max_paths', 16)}},
        'convergence': {'compute': 1.0, 'storage': 1.0, 'biz': 1.0},
    }
