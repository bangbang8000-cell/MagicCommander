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

import datetime

from ..project_aidc import ROLE_SCENARIO
from ..resolver import IntentContext

_SCN_TO_ROLE = {
    'SPINE': 'SPINE', 'LEAF': 'LEAF', 'STO_SPINE': 'STO_SPINE', 'STO_LEAF': 'STO_LEAF',
    'BIZAGG': 'BIZ_AGG', 'BIZACC': 'BIZ_ACCESS', 'OOBAGG': 'OOB_AGG', 'OOBACC': 'OOB_ACCESS',
}
# H1：型号单一来源 = ROLE_SCENARIO（消除 _SCN_MODEL 重复硬编码）
_SCN_MODEL = {scn: ROLE_SCENARIO[role][1] for scn, role in _SCN_TO_ROLE.items()}
_TERMINAL_KEY = {'LEAF': 'gpu', 'STO_LEAF': 'gpu', 'BIZACC': 'biz', 'OOBACC': 'downlink'}

# 桥接标识（契约 v1.1；本生成器为 AL 产出的测试/联调模拟，故 source=autolink）
_BRIDGE = {
    'source': 'autolink', 'projectType': 'aidc', 'bridgeVersion': '1.0', 'schema': 'plan:table/1.1',
}
# macro 补齐默认值（契约 v1.1，F9/F10/D17）
_NOMINAL = {
    'gpuCount': 64,
    'naming': {'format': '{site}-R{rack:02d}-AIDC-{vendor}-{abbr}-{seq:02d}',
               'abbr': {'SPINE': 'P-Spine', 'LEAF': 'P-Leaf', 'STO_SPINE': 'S-Spine', 'STO_LEAF': 'S-Leaf',
                        'BIZAGG': 'BIZ-AGG', 'BIZACC': 'BIZ-ACC', 'OOBAGG': 'OOB-AGG', 'OOBACC': 'OOB-ACC'}},
    'ipSegments': {'loopback': '10.1.0.0/20', 'compute': '10.1.16.0/20', 'storage': '10.1.32.0/20',
                   'biz': '10.1.48.0/20', 'oob': '10.1.64.0/21', 'interconnect': '10.1.72.0/21'},
    'ospf': {'process': 10, 'area': '0.0.0.0'},
}


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

    n_spine = next((d['count'] for d in device_list if d['role'] == 'SPINE'), 2)
    n_leaf = next((d['count'] for d in device_list if d['role'] == 'LEAF'), 8)
    now = datetime.datetime.now(datetime.timezone.utc).isoformat(timespec='seconds')
    return {
        'meta': {
            'project': project, 'site': site,
            'version': '1.1', 'schema': _BRIDGE['schema'],
            'generatedAt': now,
            'source': _BRIDGE['source'], 'projectType': _BRIDGE['projectType'],
            'bridgeVersion': _BRIDGE['bridgeVersion'],
        },
        'macro': {
            'site': site, 'gpuCount': _NOMINAL['gpuCount'],
            'pfcQueue': ctx.globals.get('pfc_queue', 3),
            'cnpQueue': ctx.globals.get('cnp_queue', 6),
            'bgpMaxPaths': ctx.globals.get('bgp_max_paths', 16),
            'convergence': 1.0,
            'rails': 8,
            'naming': _NOMINAL['naming'],
            'ipSegments': _NOMINAL['ipSegments'],
            'deviceModels': dict(_SCN_MODEL),
            'asRange': [65001, 65500],
            'vlanRanges': {'compute': [100, 199], 'storage': [200, 299],
                           'biz': [300, 399], 'oob': [400, 499]},
            'ospf': _NOMINAL['ospf'],
        },
        'topology': {
            'layers': 2, 'spines': n_spine, 'leaves': n_leaf, 'pods': None,
            'scale': {'gpuCount': _NOMINAL['gpuCount'], 'spine': n_spine, 'leaf': n_leaf},
        },
        'deviceList': device_list,
        'connections': connections,
        'terminals': terminals,
        'protocols': {
            'ospf': _NOMINAL['ospf'],
            'bgp': {'asRange': [65001, 65500], 'ecmp': ctx.globals.get('bgp_max_paths', 16)},
        },
        'convergence': {'compute': 1.0, 'storage': 1.0, 'biz': 1.0},
    }
