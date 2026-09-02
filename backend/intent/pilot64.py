"""
意图参数适配器 —— 64 台试点完整参数集（P1 试点）。

四网全量拓扑（64 台 GPU）：
- 参数网：2×SPINE + 8×LEAF（S9827，8 轨，每 Leaf 64×200G GPU 下联）
- 存储网：1×STO_SPINE + 2×STO_LEAF（独立 fabric，1×200G 存储/台）
- 业务&管理网：2×BIZ_AGG + 4×BIZ_ACC（2×25G 业务/台）
- 带外网：1×OOB_AGG + 2×OOB_ACC（1G BMC/ILO）

规范落地：命名 F9、IP 10.1.0.0/16 裂解 F10、VLAN F14（计算100-199/存储200-299/业务300-399/带外400-499）、PFC/CNP 队列 F16（默认 3/6）。
"""

import ipaddress
import os

from .resolver import IntentContext
from .normalizer import normalize_template
from .roce_templates import SPINE_TEMPLATE, LEAF_TEMPLATE, ROCE_DEFAULTS
from .biz_templates import BIZ_ACCESS_TEMPLATE, BIZ_AGG_TEMPLATE
from .planner.pilot_builder import build_pilot64_planned


def _p2p_ip(base_net: str, link_idx: int):
    """互联段第 link_idx 个 /31 点对点对，返回 (本地IP, 对端IP)。"""
    net = ipaddress.ip_network(base_net)
    base = int(net.network_address) + link_idx * 2
    return str(ipaddress.ip_address(base)), str(ipaddress.ip_address(base + 1))


def _adj_ip(ip_str):
    try:
        return str(ipaddress.ip_address(ip_str) + 1)
    except Exception:  # noqa: BLE001
        return ''


def _gw_nets(gw_list):
    """网关 /24 列表 -> (network, mask) 列表（供 BGP 通告）。"""
    nets, masks = [], []
    for gw in gw_list:
        net = ipaddress.ip_network(f'{gw}/24', strict=False)
        nets.append(str(net.network_address))
        masks.append(str(net.netmask))
    return nets, masks

# 存储网模板：参数化 SPINE/LEAF 场景；S9825-128B 全 200G，上联 WRED 用 200G
STORAGE_SPINE_TEMPLATE = SPINE_TEMPLATE.replace('SPINE', 'STO_SPINE') \
    .replace('400G-WRED-Template', '200G-WRED-Template')
STORAGE_LEAF_TEMPLATE = LEAF_TEMPLATE.replace('LEAF', 'STO_LEAF') \
    .replace('400G-WRED-Template', '200G-WRED-Template')

# 带外接入（OOB_ACC，1G：下行 access vlan + 上行 trunk 透传）
OOB_ACCESS_TEMPLATE = """# 带外网 接入层（OOB_ACC，1G BMC/ILO）
sysname {{hostname_hostname_B_OOBACC[[ID]]}}
#
clock timezone Beijing add 08:00:00
#
lldp global enable
#
# 下行（BMC/ILO）：access vlan
{%- for item in iter_obj_func("downlink_port[[ID]]", "downlink_vlan[[ID]]", "downlink_desc[[ID]]") %}
interface {{item.downlink_port[[ID]]}}
 port link-mode bridge
 description {{item.downlink_desc[[ID]]}}
 port access vlan {{item.downlink_vlan[[ID]]}}
#
{%- endfor %}
# 上行（到 OOB_AGG）：trunk 透传
{%- for item in iter_obj_func("uplink_port[[ID]]", "uplink_desc[[ID]]") %}
interface {{item.uplink_port[[ID]]}}
 port link-mode bridge
 description {{item.uplink_desc[[ID]]}}
 port link-type trunk
 port trunk permit vlan all
#
{%- endfor %}
#
snmp-agent
snmp-agent community read {{para_para_C_COMMUNITY}}
#
ssh server enable
"""

OOB_AGG_TEMPLATE = """# 带外网 汇聚层（OOB_AGG，自研简版）
sysname {{hostname_hostname_B_OOBAGG[[ID]]}}
#
ip vpn-instance mgt_vrf
 route-distinguisher 2:1
#
lldp global enable
#
interface M-GigabitEthernet0/0/0
 ip binding vpn-instance mgt_vrf
 ip address {{ipv4_M-ILO_P_OOBAGG[[ID]]}} 255.255.255.0
#
{%- for item in iter_obj_func("downlink_port[[ID]]", "downlink_vlan[[ID]]", "downlink_desc[[ID]]") %}
interface {{item.downlink_port[[ID]]}}
 port link-mode bridge
 description {{item.downlink_desc[[ID]]}}
 port link-type trunk
 port trunk permit vlan all
#
{%- endfor %}
#
{%- for item in iter_list_func("para_para_C_NTP") %}
ntp-service unicast-server {{item}}
{%- endfor %}
#
snmp-agent
snmp-agent community read {{para_para_C_COMMUNITY}}
#
ssh server enable
"""

# 场景 -> 模板
SCENARIO_TEMPLATES = {
    'SPINE': SPINE_TEMPLATE,
    'LEAF': LEAF_TEMPLATE,
    'STO_SPINE': STORAGE_SPINE_TEMPLATE,
    'STO_LEAF': STORAGE_LEAF_TEMPLATE,
    'BIZAGG': BIZ_AGG_TEMPLATE,
    'BIZACC': BIZ_ACCESS_TEMPLATE,
    'OOBAGG': OOB_AGG_TEMPLATE,
    'OOBACC': OOB_ACCESS_TEMPLATE,
}


def _hname(site, rack, scn_abbr, idx):
    return f'{site}-{rack}-AIDC-H3C-{scn_abbr}-{idx:02d}'


# 场景缩写（命名规范表 §2，2026-08-13 更正：参数网 P-* / 存储网 S-*）
_SCN_ABBR = {
    'SPINE': 'P-Spine', 'LEAF': 'P-Leaf', 'STO_SPINE': 'S-Spine', 'STO_LEAF': 'S-Leaf',
    'BIZAGG': 'BIZ-AGG', 'BIZACC': 'BIZ-ACC', 'OOBAGG': 'OOB-AGG', 'OOBACC': 'OOB-ACC',
}


def build_pilot64_context(pfc_queue=3, cnp_queue=6, site='BJ01') -> IntentContext:
    """构造 64 台试点完整意图上下文（P1.1 起由规划引擎生成）。"""
    return build_pilot64_planned(pfc_queue, cnp_queue, site)


def _build_pilot64_legacy(pfc_queue=3, cnp_queue=6, site='BJ01') -> IntentContext:
    """（历史硬编码实现，保留参考；已由规划引擎取代）构造 64 台试点完整意图上下文。"""
    ctx = IntentContext()
    ctx.globals = dict(ROCE_DEFAULTS)
    ctx.globals['pfc_queue'] = pfc_queue
    ctx.globals['cnp_queue'] = cnp_queue
    ctx.globals.update({
        'para_para_C_AAA1': '10.10.10.10',
        'para_para_C_AAA-PASSWORD': 'Aa@12345',
        'para_para_C_TACACS-NAME': 'tac_aidc',
        'para_para_C_TACACS-DOMAIN': 'bj01.corp',
        'para_para_C_LOCAL-USER': 'admin',
        'para_para_C_LOCAL-PASSWORD': 'Aa@12345',
        'para_para_C_NTP': '10.200.0.1,10.200.0.2',
        'para_para_C_COMMUNITY': 'mc-aidc',
        'para_para_C_NMS-TGW-VIP': '10.10.10.100',
    })
    ctx.scenario = 'PILOT64'
    ctx.device_params = {}
    ctx.lists = {}

    def add(scn, idx, rack, loopback, milo, asn=None):
        ctx.device_params.setdefault(scn, {})[idx] = {
            f'hostname_hostname_B_{scn}{idx}': _hname(site, rack, _SCN_ABBR[scn], idx),
            f'hostname_hostname_E_{scn}{idx}': asn or (65000 + idx),
            f'ipv4_LoopBack_P_{scn}{idx}': f'{loopback}/32',
            f'ipv4_M-ILO_P_{scn}{idx}': f'{milo}/24',
        }

    def set_list(scn, idx, name, values):
        ctx.lists[f'{scn}_{name}{idx}'] = list(values)

    def set_peers(scn, idx, local_ips, peer_as_list):
        """按上联 IP 生成 bgp_peer_ip（对端=相邻地址）+ bgp_peer_as。"""
        ctx.lists[f'{scn}_bgp_peer_ip{idx}'] = [_adj_ip(ip) for ip in local_ips]
        ctx.lists[f'{scn}_bgp_peer_as{idx}'] = list(peer_as_list)
        ctx.lists[f'{scn}_gw_net{idx}'] = []
        ctx.lists[f'{scn}_gw_mask{idx}'] = []

    def set_gw(scn, idx, vlan_gw_list):
        nets, masks = _gw_nets(vlan_gw_list)
        ctx.lists[f'{scn}_gw_net{idx}'] = nets
        ctx.lists[f'{scn}_gw_mask{idx}'] = masks

    # ---- 参数网：2 SPINE + 8 LEAF（8 轨），/31 互联，EBGP+ECMP ----
    for n in (1, 2):
        add('SPINE', n, 'R01', f'10.1.0.{n}', f'10.1.64.{n}', asn=65200 + n)
        ports = [f'FourHundredGigE1/0/{lf * 16 + i}' for lf in range(8) for i in range(16)]
        ips = [_p2p_ip('10.1.72.0/21', lf * 32 + i + 16 * (n - 1))[1]
               for lf in range(8) for i in range(16)]
        set_list('SPINE', n, 'uplink_port', ports)
        set_list('SPINE', n, 'uplink_ip', ips)
        set_peers('SPINE', n, ips, [65100 + lf + 1 for lf in range(8) for _ in range(16)])

    for n in range(1, 9):
        rack = f'R{1 + n:02d}'
        add('LEAF', n, rack, f'10.1.0.{100 + n}', f'10.1.64.{100 + n}', asn=65100 + n)
        # 64×200G GPU 下联（32×400G 1分2）
        gpu_ports = [f'TwoHundredGigE1/0/{p}:{s}' for p in range(1, 33) for s in (1, 2)]
        gpu_vlans = [100 + (n - 1) * 2 + (s - 1) for p in range(1, 33) for s in (1, 2)]
        set_list('LEAF', n, 'gpu_port', gpu_ports)
        set_list('LEAF', n, 'gpu_vlan', gpu_vlans)
        # 上联 2 Spine：每 Spine 16×400G（/31 点对点，本地取偶址）
        up_ports = [f'FourHundredGigE1/0/{33 + i}' for i in range(32)]
        up_ips = [_p2p_ip('10.1.72.0/21', (n - 1) * 32 + i)[0] for i in range(32)]
        set_list('LEAF', n, 'uplink_port', up_ports)
        set_list('LEAF', n, 'uplink_ip', up_ips)
        set_peers('LEAF', n, up_ips, [65200 + (i // 16) + 1 for i in range(32)])
        # VLAN 网关（计算 VLAN）
        set_list('LEAF', n, 'vlan_id', [100 + (n - 1) * 2, 100 + (n - 1) * 2 + 1])
        vlan_gw = [f'10.1.{16 + n}.1', f'10.1.{16 + n}.129']
        set_list('LEAF', n, 'vlan_gw', vlan_gw)
        set_gw('LEAF', n, vlan_gw)

    # ---- 存储网：1 STO_SPINE + 2 STO_LEAF（S9825-128B，EBGP）----
    add('STO_SPINE', 1, 'R01', '10.1.32.1', '10.1.48.1', asn=65301)
    sto_sp_ips = [f'10.1.72.{i * 4 - 2}' for i in (1, 2)]
    set_list('STO_SPINE', 1, 'uplink_port', [f'TwoHundredGigE1/0/{i}' for i in (1, 2)])
    set_list('STO_SPINE', 1, 'uplink_ip', sto_sp_ips)
    set_peers('STO_SPINE', 1, sto_sp_ips, [65400 + i for i in (1, 2)])
    for n in (1, 2):
        add('STO_LEAF', n, f'R{10 + n:02d}', f'10.1.32.{100 + n}', f'10.1.48.{100 + n}', asn=65400 + n)
        sto_lf_ip = [f'10.1.72.{n * 4 - 2}']
        set_list('STO_LEAF', n, 'uplink_port', [f'TwoHundredGigE1/0/33'])
        set_list('STO_LEAF', n, 'uplink_ip', sto_lf_ip)
        set_peers('STO_LEAF', n, sto_lf_ip, [65301])
        sto_ports = [f'TwoHundredGigE1/0/{i}' for i in range(1, 33)]
        sto_vlans = [200 + (i % 10) for i in range(32)]
        set_list('STO_LEAF', n, 'gpu_port', sto_ports)
        set_list('STO_LEAF', n, 'gpu_vlan', sto_vlans)
        set_list('STO_LEAF', n, 'vlan_id', [201, 202])
        sto_gw = [f'10.1.33.{n}', f'10.1.33.{n + 2}']
        set_list('STO_LEAF', n, 'vlan_gw', sto_gw)
        set_gw('STO_LEAF', n, sto_gw)

    # ---- 业务&管理网：2 BIZ_AGG + 4 BIZ_ACC（EBGP+ECMP；ACC 两两 MLAG）----
    for n in (1, 2):
        add('BIZAGG', n, 'R01', f'10.1.0.{200 + n}', f'10.1.48.{10 + n}', asn=65600 + n)
        agg_ips = [f'10.1.72.{200 + n * 4 - 3}', f'10.1.72.{200 + n * 4 + 1}']
        set_list('BIZAGG', n, 'uplink_port', [f'FortyGigE1/0/{i}' for i in (1, 2)])
        set_list('BIZAGG', n, 'uplink_ip', agg_ips)
        set_peers('BIZAGG', n, agg_ips, [65500 + i for i in range(1, 5)])
    for n in range(1, 5):
        add('BIZACC', n, f'R{14 + n:02d}', f'10.1.0.{300 + n}', f'10.1.48.{20 + n}', asn=65500 + n)
        set_list('BIZACC', n, 'biz_port', [f'Twenty-FiveGigE1/0/{i}' for i in range(1, 33)])
        set_list('BIZACC', n, 'biz_vlan', [300 + (i % 10) for i in range(32)])
        acc_ips = [f'10.1.72.{200 + n * 4 + 1}', f'10.1.72.{200 + n * 4 + 3}']
        set_list('BIZACC', n, 'uplink_port', [f'Ten-GigabitEthernet1/0/{49 + i}' for i in range(2)])
        set_list('BIZACC', n, 'uplink_ip', acc_ips)
        set_peers('BIZACC', n, acc_ips, [65600 + (i % 2) + 1 for i in range(2)])
        set_list('BIZACC', n, 'vlan_id', [300, 301])
        acc_gw = [f'10.1.40.{n}', f'10.1.41.{n}']
        set_list('BIZACC', n, 'vlan_gw', acc_gw)
        set_gw('BIZACC', n, acc_gw)
        # MLAG 成对（1↔2、3↔4），keepalive 199.0.0.1/2（H3C 直接 MLAG）
        pair = (n - 1) // 2 + 1
        member = (n - 1) % 2
        keep = '199.0.0.1' if member == 0 else '199.0.0.2'
        peer_keep = '199.0.0.2' if member == 0 else '199.0.0.1'
        ctx.device_params['BIZACC'][n]['mlag_pair'] = pair
        ctx.device_params['BIZACC'][n]['mlag_system_number'] = member + 1
        ctx.device_params['BIZACC'][n]['mlag_keepalive'] = keep
        ctx.device_params['BIZACC'][n]['mlag_peer_keepalive'] = peer_keep

    # ---- 带外网：1 OOB_AGG + 2 OOB_ACC ----
    add('OOBAGG', 1, 'R01', '10.1.0.250', '10.1.56.1', asn=65701)
    set_list('OOBAGG', 1, 'downlink_port', [f'GigabitEthernet1/0/{i}' for i in (1, 2)])
    set_peers('OOBAGG', 1, [], [])
    for n in (1, 2):
        add('OOBACC', n, f'R{18 + n:02d}', f'10.1.0.{240 + n}', f'10.1.56.{2 + n}', asn=65710 + n)
        set_list('OOBACC', n, 'downlink_port', [])
        set_peers('OOBACC', n, [], [])

    ctx.keys = set(ctx.globals)
    for scn, by_id in ctx.device_params.items():
        for _id, params in by_id.items():
            ctx.keys |= set(params)
    return ctx


def device_counts(ctx: IntentContext) -> dict:
    return {scn: len(by_id) for scn, by_id in ctx.device_params.items()}


def render_pilot(ctx: IntentContext, out_dir: str, scenario_filter=None) -> dict:
    """渲染全部设备为配置文本，写入 out_dir/{scenario}/{hostname}.cfg。"""
    os.makedirs(out_dir, exist_ok=True)
    rendered = {}
    for scn, by_id in ctx.device_params.items():
        if scenario_filter and scn not in scenario_filter:
            continue
        tpl = SCENARIO_TEMPLATES.get(scn)
        if tpl is None:
            continue
        for local, params in by_id.items():
            hostname = params.get(f'hostname_hostname_B_{scn}{local}')
            text = normalize_template(tpl, ctx, local, scenario=scn)
            sub = os.path.join(out_dir, scn)
            os.makedirs(sub, exist_ok=True)
            with open(os.path.join(sub, f'{hostname}.cfg'), 'w', encoding='utf-8') as f:
                f.write(text)
            rendered[hostname] = text
    return rendered


# 各平面 -> (项目名, 角色序列)
_PLANE_ROLES = [
    ('aidc_roce', ['SPINE'] * 2 + ['LEAF'] * 8, '参数网'),
    ('aidc_storage', ['STO_SPINE'] * 1 + ['STO_LEAF'] * 2, '存储网'),
    ('aidc_biz', ['BIZ_AGG'] * 2 + ['BIZ_ACCESS'] * 4, '业务&管理网'),
    ('aidc_oob', ['OOB_AGG'] * 1 + ['OOB_ACCESS'] * 2, '带外网'),
]


def generate_pilot64_projects(workspace_dir: str, ctx: IntentContext | None = None,
                              pfc_queue=3, cnp_queue=6) -> dict:
    """按四平面各生成一个 MC 项目，返回 {平面: project_dir}。"""
    from .project_aidc import AidcProjectGenerator
    ctx = ctx or build_pilot64_context(pfc_queue=pfc_queue, cnp_queue=cnp_queue)
    os.makedirs(workspace_dir, exist_ok=True)
    result = {}
    for project_name, roles, plane in _PLANE_ROLES:
        roles_dict = {i + 1: r for i, r in enumerate(roles)}
        project_dir = os.path.join(workspace_dir, project_name)
        AidcProjectGenerator(ctx, roles_dict, plane).write(project_dir)
        result[plane] = project_dir
    return result


def render_pilot64_projects(workspace_dir: str, ctx: IntentContext | None = None) -> dict:
    """生成并渲染全部四网 MC 项目，返回 {平面: {设备: 配置文本}}。"""
    import pandas as pd

    projects = generate_pilot64_projects(workspace_dir, ctx)
    # 注册到 MC_Para.xlsx
    pd.DataFrame({'项目名称': [os.path.basename(p) for p in projects.values()]}).to_excel(
        os.path.join(workspace_dir, 'MC_Para.xlsx'), sheet_name='项目名称', index=False)

    from pre_processing import PreProcessing
    pp = PreProcessing()
    pp.workspace = workspace_dir
    pp.read_MC_para('MC_Para.xlsx')
    pp.execute_render('all', 'device_name')

    # 读取渲染产物
    result = {}
    for plane, project_dir in projects.items():
        out = os.path.join(project_dir, 'output')
        texts = {}
        for time_dir in os.listdir(out):
            batch = os.path.join(out, time_dir)
            for entry in os.listdir(batch):
                role_path = os.path.join(batch, entry)
                if not os.path.isdir(role_path):
                    continue  # 跳过 manifest.json 等批次内文件
                for f in os.listdir(role_path):
                    if f.endswith('.txt'):
                        with open(os.path.join(role_path, f), encoding='utf-8') as fh:
                            texts[os.path.splitext(f)[0]] = fh.read()
        result[plane] = texts
    return result
