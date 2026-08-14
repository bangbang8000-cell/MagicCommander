"""
意图参数适配器 —— AIDC 通用 MC 项目生成器（参数网 / 存储网 / 业务网 / 带外）。

把意图上下文映射为 MagicCommander 可渲染的项目：
- excel/hostname.xlsx   设备表（赋值表）
- excel/parameter.xlsx  参数表（PFC/CNP 队列、OSPF、全局参数 —— 均可在 MC 内调整）
- excel/ipaddress.xlsx  IP规划地址表（上联对称表）+ 环回地址表
- excel/connection.xlsx 终端连接表（GPU/业务口，赋值表）
- para.xlsx            project_para 声明
- templates/{role}.j2  MC info 风格模板
- template.meta.json + README.md

当前覆盖：参数网（SPINE/LEAF）、存储网（STO_SPINE/STO_LEAF）。
"""

import os
import json

import pandas as pd

from .resolver import IntentContext
from .roce_templates import ROCE_DEFAULTS

# 角色 -> (场景前缀, 默认型号)
# 参数网 S9827（128×400G）；存储网 S9825-128B（128×200G，2026-08-13 确认）
# H1（D-1~D-3）：BIZ_AGG=S9850-32H、BIZ_ACCESS=S6850-56HF、OOB_AGG=S6805-56HF-G、OOB_ACC=S5560X-54C-EI
ROLE_SCENARIO = {
    'SPINE': ('SPINE', 'H3C S9827'),
    'LEAF': ('LEAF', 'H3C S9827'),
    'STO_SPINE': ('STO_SPINE', 'H3C S9825-128B'),
    'STO_LEAF': ('STO_LEAF', 'H3C S9825-128B'),
    'BIZ_AGG': ('BIZAGG', 'H3C S9850-32H'),
    'BIZ_ACCESS': ('BIZACC', 'H3C S6850-56HF'),
    'OOB_AGG': ('OOBAGG', 'H3C S6805-56HF-G'),
    'OOB_ACCESS': ('OOBACC', 'H3C S5560X-54C-EI'),
}


def _strip_prefix(val):
    return str(val).split('/')[0]


# 单层对端 AS（MC info 简化：Leaf→Spine 层、Spine→Leaf 层）
_PEER_AS = {
    'LEAF': 65201, 'SPINE': 65101,
    'STO_LEAF': 65301, 'STO_SPINE': 65401,
    'BIZ_ACCESS': 65601, 'BIZ_AGG': 65501,
}


def _prefix_to_mask(prefix):
    from . import filters
    return filters.to_mask(f'0.0.0.0/{prefix}')


# ---------------------------------------------------------------------------
# 参数网/存储网 info 模板
# ---------------------------------------------------------------------------
_ROCE_INFO_HEAD = """# __ROLE__（__PLANE__）
sysname {{ info['设备名'] }}
#
ip vpn-instance Mgnt
#
priority-flow-control poolid 0 headroom {{ info['PFCHeadroom'] }}
#
ip ttl-expires enable
#
lldp global enable
#
buffer egress cell queue {{ info['CNP队列'] }} shared ratio 100
buffer egress cell queue {{ info['PFC队列'] }} shared ratio 100
buffer apply
#
priority-flow-control deadlock cos {{ info['PFC队列'] }} interval 10
priority-flow-control deadlock precision high
priority-flow-control deadlock auto-recover cos {{ info['PFC队列'] }} delay 10
password-recovery enable
#
vlan 1
#
qos map-table dot1p-lp
 import 0 export 0
 import 1 export 1
 import 2 export 2
 import 3 export 3
 import 4 export 4
 import 5 export 5
 import 6 export 6
 import 7 export 7
#
interface LoopBack0
 ip address {{ info['环回IP'] }} 255.255.255.255
#
interface M-GigabitEthernet0/0/0
 ip binding vpn-instance Mgnt
 ip address {{ info['管理IP'] }} 255.255.255.0
#
"""

_IP_LINK_TEMPLATE = """{# 上联互联（IP规划地址表，对称表，按 己端接口 嵌套，/31 EBGP 邻居） #}
{%- for key, val in info.get('IP规划地址表 己端接口', {}).items() %}
interface {{ key }}
 port link-mode route
 link-delay up 2
 priority-flow-control enable
 priority-flow-control no-drop dot1p {{ info['PFC队列'] }}
 priority-flow-control deadlock enable
 ip address {{ val['己端IP地址'] }} 255.255.255.254
 qos trust dscp
 qos wfq byte-count
 qos wfq cs{{ info['CNP队列'] }} group sp
 qos wfq cs7 group sp
 qos wred apply __WRED__
#
{%- endfor %}
"""

# EBGP + ECMP（设备 AS 来自设备表 BGP AS；对端 AS 为单层 AS，来自设备表对端AS）
_BGP_INFO_BLOCK = """{# EBGP + ECMP #}
router bgp {{ info['BGP AS'] }}
 bgp router-id {{ info['环回IP'] }}
 bgp log-neighbor-changes
 bgp graceful-restart
 bgp bestpath as-path multipath-relax
 bgp always-compare-med
 maximum-paths ebgp {{ info['BGP多路径'] }}
{%- for key, val in info.get('IP规划地址表 己端接口', {}).items() %}
 neighbor {{ val['对端IP地址'] }} as-number {{ info['对端AS'] }}
{%- endfor %}
 address-family ipv4
  network {{ info['环回IP'] }} mask 255.255.255.255
{%- for key, val in info.get('IP规划地址表 己端接口', {}).items() %}
  neighbor {{ val['对端IP地址'] }} activate
  neighbor {{ val['对端IP地址'] }} send-community both
{%- endfor %}
{%- set gw_vlans = info.get('网关VLAN', []) %}
{%- set gw_ips = info.get('网关IP', []) %}
{%- if gw_vlans and gw_vlans[0] == 'list' %}
{%- for v in gw_vlans[1:] %}
  network {{ gw_ips[loop.index0 + 1] }} mask 255.255.255.0
{%- endfor %}
{%- endif %}
  exit-address-family
#
"""

_GPU_TERM_TEMPLATE = """{# GPU/存储下联口（终端连接表，赋值表+列表值单元格，带 description） #}
{%- set gpu_ports = info['己端接口'][1:] %}
{%- set gpu_vlans = info['己端VLAN'][1:] %}
{%- set gpu_descs = info.get('己端描述', ['list'])[1:] %}
{%- for p in gpu_ports %}
interface {{ p }}
 port link-mode bridge
 description {{ gpu_descs[loop.index0] if gpu_descs else '' }}
 port access vlan {{ gpu_vlans[loop.index0] }}
 link-delay up 2
 priority-flow-control enable
 priority-flow-control no-drop dot1p {{ info['PFC队列'] }}
 priority-flow-control deadlock enable
 stp edged-port
 qos trust dscp
 qos wfq byte-count
 qos wfq cs{{ info['CNP队列'] }} group sp
 qos wfq cs7 group sp
 qos wred apply 200G-WRED-Template
 qos gts queue {{ info['CNP队列'] }} cir 200000000 cbs 16000000
#
{%- endfor %}
"""

# VLAN 网关接口（Leaf，数据来自 VLAN网关表 赋值表+列表值）
_VLAN_GW_TEMPLATE = """{# VLAN 网关（VLAN网关表） #}
{%- set gw_vlans = info['网关VLAN'][1:] %}
{%- set gw_ips = info['网关IP'][1:] %}
{%- for v in gw_vlans %}
interface Vlan-interface{{ v }}
 ip address {{ gw_ips[loop.index0] }} 255.255.255.0
#
{%- endfor %}
"""


# ---------------------------------------------------------------------------
# 业务&管理网 / 带外网 info 模板（非无损）
# ---------------------------------------------------------------------------
_BIZ_AGG_INFO = """# BIZ_AGG（业务汇聚，承载带内管理；下联 EBGP+ECMP）
sysname {{ info['设备名'] }}
#
ip vpn-instance mgt_vrf
 route-distinguisher 2:1
#
lldp global enable
#
{%- for key, val in info.get('IP规划地址表 己端接口', {}).items() %}
interface {{ key }}
 port link-mode route
 link-delay up 2
 ip address {{ val['己端IP地址'] }} 255.255.255.254
#
{%- endfor %}
router bgp {{ info['BGP AS'] }}
 bgp router-id {{ info['环回IP'] }}
 bgp log-neighbor-changes
 maximum-paths ebgp {{ info['BGP多路径'] }}
{%- for key, val in info.get('IP规划地址表 己端接口', {}).items() %}
 neighbor {{ val['对端IP地址'] }} as-number {{ info['对端AS'] }}
{%- endfor %}
 address-family ipv4
  network {{ info['环回IP'] }} mask 255.255.255.255
{%- for key, val in info.get('IP规划地址表 己端接口', {}).items() %}
  neighbor {{ val['对端IP地址'] }} activate
{%- endfor %}
  exit-address-family
#
interface M-GigabitEthernet0/0/0
 ip binding vpn-instance mgt_vrf
 ip address {{ info['管理IP'] }} 255.255.255.0
#
hwtacacs scheme {{ info['AAA名称'] }}
 primary authentication {{ info['AAA地址'][1] if info['AAA地址'][0] == 'list' else info['AAA地址'] }}
 key authentication simple {{ info['AAA认证密钥'] }}
 user-name-format without-domain
#
local-user {{ info['本地用户名'] }} class manage
 password simple {{ info['本地用户密钥'] }}
 service-type ssh terminal
#
{%- for item in info['NTP地址'][1:] %}
ntp-service unicast-server {{ item }}
{%- endfor %}
#
snmp-agent
snmp-agent community read {{ info['SNMP团体名'] }}
#
info-center enable
info-center loghost {{ info['LOGHOST地址'] }}
#
ssh server enable
"""

_BIZ_ACCESS_INFO = """# BIZ_ACCESS（业务接入，2×25G；同组 ACC 间 MLAG，上联 EBGP+ECMP）
sysname {{ info['设备名'] }}
#
lldp global enable
#
{%- if info['MLAG对'] %}
ip vpn-instance keepalive
#
stp global enable
#
mlag system-mac 0001-0001-000{{ info['MLAG对'] }}
mlag system-number {{ info['MLAG序号'] }}
mlag keepalive ip destination {{ info['MLAG对端'] }} source {{ info['MLAG本端'] }} vpn-instance keepalive
#
{%- endif %}
{# 业务接入口（25G，MLAG 接入口 + description） #}
{%- set biz_ports = info['己端接口'][1:] %}
{%- set biz_vlans = info['己端VLAN'][1:] %}
{%- set biz_descs = info.get('己端描述', ['list'])[1:] %}
{%- for p in biz_ports %}
interface {{ p }}
 port link-mode bridge
 description {{ biz_descs[loop.index0] if biz_descs else '' }}
 port access vlan {{ biz_vlans[loop.index0] }}
 stp edged-port
{%- if info['MLAG对'] %}
 port s-mlag group {{ info['MLAG对'] }}
{%- endif %}
#
{%- endfor %}
{%- for key, val in info.get('IP规划地址表 己端接口', {}).items() %}
interface {{ key }}
 port link-mode route
 ip address {{ val['己端IP地址'] }} 255.255.255.254
#
{%- endfor %}
router bgp {{ info['BGP AS'] }}
 bgp router-id {{ info['环回IP'] }}
 bgp log-neighbor-changes
 maximum-paths ebgp {{ info['BGP多路径'] }}
{%- for key, val in info.get('IP规划地址表 己端接口', {}).items() %}
 neighbor {{ val['对端IP地址'] }} as-number {{ info['对端AS'] }}
{%- endfor %}
 address-family ipv4
  network {{ info['环回IP'] }} mask 255.255.255.255
{%- for key, val in info.get('IP规划地址表 己端接口', {}).items() %}
  neighbor {{ val['对端IP地址'] }} activate
{%- endfor %}
  exit-address-family
#
snmp-agent
snmp-agent community read {{ info['SNMP团体名'] }}
#
local-user {{ info['本地用户名'] }} class manage
 password simple {{ info['本地用户密钥'] }}
 service-type ssh terminal
#
ssh server enable
"""

_OOB_AGG_INFO = """# OOB_AGG（带外汇聚，自研简版）
sysname {{ info['设备名'] }}
#
ip vpn-instance mgt_vrf
 route-distinguisher 2:1
#
interface M-GigabitEthernet0/0/0
 ip binding vpn-instance mgt_vrf
 ip address {{ info['管理IP'] }} 255.255.255.0
#
{%- for item in info['NTP地址'][1:] %}
ntp-service unicast-server {{ item }}
{%- endfor %}
#
snmp-agent
snmp-agent community read {{ info['SNMP团体名'] }}
#
ssh server enable
"""

_OOB_ACCESS_INFO = """# OOB_ACCESS（带外接入，1G BMC/ILO：下行 access vlan + 上行 trunk）
sysname {{ info['设备名'] }}
#
lldp global enable
#
interface M-GigabitEthernet0/0/0
 ip address {{ info['管理IP'] }} 255.255.255.0
#
{# 带外下行（access vlan + description） #}
{%- set oob_ports = info['己端接口'][1:] %}
{%- set oob_vlans = info['己端VLAN'][1:] %}
{%- set oob_descs = info.get('己端描述', ['list'])[1:] %}
{%- for p in oob_ports %}
interface {{ p }}
 port link-mode bridge
 description {{ oob_descs[loop.index0] if oob_descs else '' }}
 port access vlan {{ oob_vlans[loop.index0] }}
#
{%- endfor %}
{# 带外上行（trunk 透传） #}
{%- for key, val in info.get('IP规划地址表 己端接口', {}).items() %}
interface {{ key }}
 port link-mode bridge
 description to-AGG
 port link-type trunk
 port trunk permit vlan all
#
{%- endfor %}
snmp-agent
snmp-agent community read {{ info['SNMP团体名'] }}
#
ssh server enable
"""

_BIZ_OOB_TEMPLATES = {
    'BIZ_AGG': _BIZ_AGG_INFO,
    'BIZ_ACCESS': _BIZ_ACCESS_INFO,
    'OOB_AGG': _OOB_AGG_INFO,
    'OOB_ACCESS': _OOB_ACCESS_INFO,
}

# H2（D-5）：平面 → sheet 后缀（用户约定短名：业务网 不带 &管理网）
_PLANE_SHEET = {'参数网': '参数网', '存储网': '存储网', '业务&管理网': '业务网', '带外网': '带外网'}


def _info_template(role: str, plane: str) -> str:
    if role in _BIZ_OOB_TEMPLATES:
        tpl = _BIZ_OOB_TEMPLATES[role]
    else:
        # 存储网 S9825-128B（200G）上联用 200G WRED；参数网 S9827（400G）用 400G
        wred = '200G-WRED-Template' if role.startswith('STO_') else '400G-WRED-Template'
        head = _ROCE_INFO_HEAD.replace('__ROLE__', role).replace('__PLANE__', plane)
        ip_link = _IP_LINK_TEMPLATE.replace('__WRED__', wred)
        if role.endswith('LEAF'):
            tpl = head + ip_link + _GPU_TERM_TEMPLATE + _VLAN_GW_TEMPLATE + _BGP_INFO_BLOCK
        else:
            tpl = head + ip_link + _BGP_INFO_BLOCK
    # H2（D-5/D-6）：对称表 sheet 名按平面（IP规划地址表-{plane_sheet}）；
    # 对端AS 从对称表行内取（val['对端AS']，hostname 设备表已去该列）
    plane_sheet = _PLANE_SHEET.get(plane, plane)
    tpl = tpl.replace('IP规划地址表 己端接口', f'IP规划地址表-{plane_sheet} 己端接口')
    tpl = tpl.replace("info['对端AS']", "val['对端AS']")
    return tpl


# ---------------------------------------------------------------------------
# 生成器
# ---------------------------------------------------------------------------
class AidcProjectGenerator:
    """通用 AIDC 项目生成器（参数网/存储网）。"""

    def __init__(self, ctx: IntentContext, roles: dict, plane: str):
        """
        roles: {device_id: role} 如 {1:'SPINE', 2:'SPINE', 3:'LEAF', ...}
        plane: '参数网' / '存储网'
        """
        self.ctx = ctx
        self.roles = roles
        self.plane = plane
        self.role_list = sorted(set(roles.values()))

    def _scenario_of(self, role):
        return ROLE_SCENARIO[role][0]

    def _model_of(self, role):
        # H1（D-4）：型号从 MC 设备库解析，fallback 到 ROLE_SCENARIO 字符串
        try:
            from .device_library import role_model_str
            return role_model_str(role) or ROLE_SCENARIO[role][1]
        except Exception:  # noqa: BLE001
            return ROLE_SCENARIO[role][1]

    def _dev(self, scn, local_id, var_tail):
        params = self.ctx.device_params.get(scn, {}).get(local_id, {})
        return params.get(f'{var_tail}{scn}{local_id}')

    def _list(self, scn, local_id, name):
        return self.ctx.lists.get(f'{scn}_{name}{local_id}', [])

    def _grouped(self):
        """按场景分组，为每个设备分配场景内本地序号。"""
        grouped = {}
        counters = {}
        for _did, role in sorted(self.roles.items()):
            scn = self._scenario_of(role)
            counters[scn] = counters.get(scn, 0) + 1
            grouped.setdefault(scn, {})[counters[scn]] = role
        return grouped

    # ---- 表 ----
    def build_device_table(self):
        rows = []
        for scn, by_local in self._grouped().items():
            for local, role in by_local.items():
                hostname = self._dev(scn, local, 'hostname_hostname_B_')
                loopback = self._dev(scn, local, 'ipv4_LoopBack_P_')
                milo = self._dev(scn, local, 'ipv4_M-ILO_P_')
                asn = self._dev(scn, local, 'hostname_hostname_E_')
                params = self.ctx.device_params.get(scn, {}).get(local, {})
                prefix = str(loopback).split('/')[1] if loopback and '/' in str(loopback) else '32'
                mprefix = str(milo).split('/')[1] if milo and '/' in str(milo) else '24'
                row = {
                    '设备名': hostname,
                    '型号': self._model_of(role),
                    '角色': role,
                    '环回接口': 'LoopBack0',
                    '环回IP': _strip_prefix(loopback),
                    '环回长度': int(prefix),
                    '管理接口': 'M-GigabitEthernet0/0/0',
                    '管理IP': _strip_prefix(milo),
                    '管理掩码': _prefix_to_mask(int(mprefix)),
                    'BGP AS': asn if asn is not None else 65000,
                    'BGP多路径': self.ctx.globals.get('bgp_max_paths', 16),
                    'MLAG对': params.get('mlag_pair', ''),
                    'MLAG序号': params.get('mlag_system_number', ''),
                    'MLAG本端': params.get('mlag_keepalive', ''),
                    'MLAG对端': params.get('mlag_peer_keepalive', ''),
                    'SN': f'AIDC{scn}{local:03d}',
                }
                rows.append(row)
        return pd.DataFrame(rows)

    def build_param_table(self):
        """参数表：PFC/CNP 队列（可调）+ OSPF + 全局参数。"""
        rows = [
            {'全局参数名': 'PFC队列', '参数值': self.ctx.globals.get('pfc_queue', 3)},
            {'全局参数名': 'CNP队列', '参数值': self.ctx.globals.get('cnp_queue', 6)},
            {'全局参数名': 'PFCHeadroom', '参数值': self.ctx.globals.get('roce_pfc_headroom', 80000)},
            {'全局参数名': 'OSPF进程', '参数值': self.ctx.globals.get('roce_ospf_process', 10)},
            {'全局参数名': 'OSPF区域', '参数值': self.ctx.globals.get('roce_ospf_area', '0.0.0.0')},
        ]
        # 业务/带外通用全局参数
        for intent_name, mc_name in (
                ('para_para_C_COMMUNITY', 'SNMP团体名'),
                ('para_para_C_LOCAL-USER', '本地用户名'),
                ('para_para_C_LOCAL-PASSWORD', '本地用户密钥'),
                ('para_para_C_NTP', 'NTP地址'),
                ('para_para_C_NMS-TGW-VIP', 'LOGHOST地址'),
                ('para_para_C_AAA1', 'AAA地址'),
                ('para_para_C_AAA-PASSWORD', 'AAA认证密钥'),
                ('para_para_C_TACACS-NAME', 'AAA名称'),
                ('para_para_C_TACACS-DOMAIN', 'domain名称')):
            val = self.ctx.globals.get(intent_name)
            if val is not None:
                if isinstance(val, (list, tuple)):
                    val = ','.join(str(v) for v in val)
                rows.append({'全局参数名': mc_name, '参数值': val})
        return pd.DataFrame(rows)

    def _peer_hosts(self, scn, role):
        """取上联对端真实主机名列表：LEAF↔SPINE、BIZ_ACCESS↔BIZ_AGG。"""
        peer_roles = [r for r in self.role_list
                      if (r.endswith('SPINE') if role.endswith('LEAF') else r.endswith('LEAF'))]
        if not peer_roles:
            # 业务网显式配对：BIZ_ACCESS ↔ BIZ_AGG
            if role == 'BIZ_ACCESS':
                peer_roles = [r for r in self.role_list if r == 'BIZ_AGG']
            elif role == 'BIZ_AGG':
                peer_roles = [r for r in self.role_list if r == 'BIZ_ACCESS']
        hosts = []
        for pr in peer_roles:
            peer_scn = self._scenario_of(pr)
            for _local, r in self._grouped().get(peer_scn, {}).items():
                if r == pr:
                    h = self._dev(peer_scn, _local, 'hostname_hostname_B_')
                    if h:
                        hosts.append(h)
        return hosts

    def _adjacent_ip(self, ip_str):
        """对端 IP 推导（/31 约定：取相邻地址），供对称表对端填充。"""
        try:
            import ipaddress
            return str(ipaddress.ip_address(ip_str) + 1)
        except Exception:  # noqa: BLE001
            return ''

    def build_ip_table(self):
        """IP规划地址表（对称表）：上联互联，按 己端接口 嵌套。

        每个物理链路一行，仅从 LEAF 方向生成（对端=SPINE，对称表自动镜像到对端）。
        对端接口用唯一索引占位（P2 地址分配引擎做精确端口映射）。
        """
        rows = []
        for scn, by_local in self._grouped().items():
            for local, role in by_local.items():
                if not role.endswith('LEAF') and role != 'BIZ_ACCESS':
                    continue  # 只从下联方向生成，避免双向重复/镜像污染
                peers = self._peer_hosts(scn, role)
                peer_ases = self._list(scn, local, 'bgp_peer_as')
                my_as = self._dev(scn, local, 'hostname_hostname_E_')
                if not peers:
                    continue
                for idx, (port, ip) in enumerate(
                        zip(self._list(scn, local, 'uplink_port'),
                            self._list(scn, local, 'uplink_ip'))):
                    peer = peers[idx % len(peers)]  # 上联按序轮询到各 Spine
                    rows.append({
                        '己端设备': self._dev(scn, local, 'hostname_hostname_B_'),
                        '己端接口': port,
                        '己端IP地址': ip,
                        '己端IP长度': 31,
                        '己端AS': my_as if my_as is not None else 65000,
                        '对端设备': peer,
                        '对端接口': f'FourHundredGigE1/0/{(local - 1) * 16 + idx}',
                        '对端IP地址': self._adjacent_ip(ip),
                        '对端IP长度': 31,
                        '对端AS': peer_ases[idx] if idx < len(peer_ases) else '',
                        '备注信息': f'{self.plane}上联',
                    })
        return pd.DataFrame(rows)

    def build_vlan_gw_table(self):
        """VLAN网关表（H2：每 VLAN 一行，去逗号拼接）：Leaf 的 VLAN 网关接口。"""
        rows = []
        for scn, by_local in self._grouped().items():
            for local, role in by_local.items():
                if not role.endswith('LEAF'):
                    continue
                vids = self._list(scn, local, 'vlan_id')
                gwips = self._list(scn, local, 'vlan_gw')
                if not vids:
                    continue
                host = self._dev(scn, local, 'hostname_hostname_B_')
                for i, v in enumerate(vids):
                    rows.append({
                        '己端设备': host,
                        '网关VLAN': v,
                        '网关IP': gwips[i] if i < len(gwips) else '',
                        '备注信息': f'{self.plane}网关',
                    })
        return pd.DataFrame(rows)

    def build_terminal_table(self):
        """终端连接表（H2：每接口一行，去逗号拼接）：GPU/存储/业务/带外下联口。"""
        # 角色 -> 终端数据键
        term_key = {'LEAF': 'gpu', 'STO_LEAF': 'gpu',
                    'BIZ_ACCESS': 'biz', 'OOB_ACCESS': 'downlink'}
        rows = []
        for scn, by_local in self._grouped().items():
            for local, role in by_local.items():
                tkey = term_key.get(role)
                if not tkey:
                    continue
                ports = self._list(scn, local, f'{tkey}_port')
                vlans = self._list(scn, local, f'{tkey}_vlan')
                descs = self._list(scn, local, f'{tkey}_desc')
                if not ports:
                    continue
                host = self._dev(scn, local, 'hostname_hostname_B_')
                for i, p in enumerate(ports):
                    rows.append({
                        '己端设备': host,
                        '己端接口': p,
                        '己端VLAN': vlans[i] if i < len(vlans) else '',
                        '己端描述': descs[i] if i < len(descs) else '',
                        '接口类型': '200G' if role.endswith('LEAF') else '25G',
                        '业务类别': 'GPU' if role.endswith('LEAF') else 'BIZ',
                        '终端编号': '',
                        '备注信息': f'{self.plane}下联',
                    })
        return pd.DataFrame(rows)

    # ---- 写项目 ----
    def write(self, project_dir: str):
        os.makedirs(os.path.join(project_dir, 'excel'), exist_ok=True)
        os.makedirs(os.path.join(project_dir, 'templates'), exist_ok=True)

        # H2（D-5）：sheet 名带平面后缀（单平面项目）
        plane_sheet = _PLANE_SHEET.get(self.plane, self.plane)
        self.build_device_table().to_excel(
            os.path.join(project_dir, 'excel', 'hostname.xlsx'), index=False, sheet_name=f'设备表-{plane_sheet}')
        self.build_param_table().to_excel(
            os.path.join(project_dir, 'excel', 'parameter.xlsx'), index=False, sheet_name='参数表')
        self.build_ip_table().to_excel(
            os.path.join(project_dir, 'excel', 'ipaddress.xlsx'), index=False, sheet_name=f'IP规划地址表-{plane_sheet}')
        with pd.ExcelWriter(os.path.join(project_dir, 'excel', 'connection.xlsx')) as writer:
            self.build_terminal_table().to_excel(writer, index=False, sheet_name=f'终端连接表-{plane_sheet}')
            self.build_vlan_gw_table().to_excel(writer, index=False, sheet_name=f'VLAN网关表-{plane_sheet}')

        proj_para = pd.DataFrame({
            '工作簿名称': ['hostname.xlsx', 'parameter.xlsx', 'ipaddress.xlsx', 'connection.xlsx', 'connection.xlsx'],
            '工作表名称': [f'设备表-{plane_sheet}', '参数表', f'IP规划地址表-{plane_sheet}',
                          f'终端连接表-{plane_sheet}', f'VLAN网关表-{plane_sheet}'],
            '工作表类型': ['赋值表', '参数表', '对称表', '赋值表', '赋值表'],
            '对称列数': [0, 0, 5, 0, 0],
            'key列数': [1, 1, 2, 2, 2],
        })
        proj_para.to_excel(os.path.join(project_dir, 'para.xlsx'), index=False, sheet_name='project_para')

        for role in self.role_list:
            tpl_path = os.path.join(project_dir, 'templates', f'{role}.j2')
            with open(tpl_path, 'w', encoding='utf-8') as f:
                f.write(_info_template(role, self.plane))

        meta = {
            'name': os.path.basename(project_dir.rstrip('/')),
            'source': 'intent-adapter-aidc-project-gen',
            'license': 'private',
            'plane': self.plane,
            'roles': self.role_list,
            'tunables': ['PFC队列', 'CNP队列'],
            'generator': 'intent.project_aidc.AidcProjectGenerator',
            'version': '0.1',
        }
        with open(os.path.join(project_dir, 'template.meta.json'), 'w', encoding='utf-8') as f:
            json.dump(meta, f, ensure_ascii=False, indent=2)
        with open(os.path.join(project_dir, 'README.md'), 'w', encoding='utf-8') as f:
            f.write(f'# {meta["name"]}\n\nAIDC {self.plane} MC 项目（P1 试点）。'
                    f'可调参数：PFC队列/CNP队列（0-7，默认 3/6）。\n')
        return project_dir


def generate_roce_project(project_dir: str, ctx: IntentContext,
                          spine_count=2, leaf_count=8, **kw):
    """生成参数网 MC 项目。"""
    roles = {i: 'SPINE' for i in range(1, spine_count + 1)}
    roles.update({spine_count + i: 'LEAF' for i in range(1, leaf_count + 1)})
    return AidcProjectGenerator(ctx, roles, '参数网').write(project_dir)


def generate_storage_project(project_dir: str, ctx: IntentContext,
                             spine_count=1, leaf_count=2, **kw):
    """生成存储网 MC 项目。"""
    roles = {i: 'STO_SPINE' for i in range(1, spine_count + 1)}
    roles.update({spine_count + i: 'STO_LEAF' for i in range(1, leaf_count + 1)})
    return AidcProjectGenerator(ctx, roles, '存储网').write(project_dir)


def build_storage_context(spine_count=1, leaf_count=2, pfc_queue=3, cnp_queue=6,
                          sto_down_per_leaf=4, uplink_per_leaf=2) -> IntentContext:
    """构造存储网意图上下文（独立 fabric，S9827，1×200G 存储/台）。

    - sto_down_per_leaf 个 200G 存储口（每台 Leaf）
    """
    from .roce_templates import ROCE_DEFAULTS
    ctx = IntentContext()
    ctx.globals = dict(ROCE_DEFAULTS)
    ctx.globals['pfc_queue'] = pfc_queue
    ctx.globals['cnp_queue'] = cnp_queue
    ctx.scenario = 'STORAGE'
    ctx.device_params = {}
    ctx.lists = {}

    # S9825-128B（128×200G）：上联亦为 200G（TwoHundredGigE）
    for n in range(1, spine_count + 1):
        scn = 'STO_SPINE'
        ctx.device_params.setdefault(scn, {})[n] = {
            f'hostname_hostname_B_{scn}{n}': f'BJ01-R01-AIDC-H3C-S-Spine-{n:02d}',
            f'ipv4_LoopBack_P_{scn}{n}': f'10.1.32.{n}/32',
            f'ipv4_M-ILO_P_{scn}{n}': f'10.1.48.{n}/24',
        }
        ctx.lists[f'{scn}_uplink_port{n}'] = [f'TwoHundredGigE1/0/{lf}' for lf in range(1, leaf_count + 1)]
        ctx.lists[f'{scn}_uplink_ip{n}'] = [f'10.1.56.{n * 64 + lf * 4 - 2}' for lf in range(1, leaf_count + 1)]

    for n in range(1, leaf_count + 1):
        scn = 'STO_LEAF'
        ctx.device_params.setdefault(scn, {})[n] = {
            f'hostname_hostname_B_{scn}{n}': f'BJ01-R{10 + n:02d}-AIDC-H3C-S-Leaf-{n:02d}',
            f'ipv4_LoopBack_P_{scn}{n}': f'10.1.32.{100 + n}/32',
            f'ipv4_M-ILO_P_{scn}{n}': f'10.1.48.{100 + n}/24',
        }
        ctx.lists[f'{scn}_uplink_port{n}'] = [f'TwoHundredGigE1/0/{33 + i}' for i in range(uplink_per_leaf)]
        ctx.lists[f'{scn}_uplink_ip{n}'] = [f'10.1.56.{n * 64 + i * 4 - 2}' for i in range(1, uplink_per_leaf + 1)]
        ctx.lists[f'{scn}_gpu_port{n}'] = [f'TwoHundredGigE1/0/{i}' for i in range(1, sto_down_per_leaf + 1)]
        ctx.lists[f'{scn}_gpu_vlan{n}'] = [201 + (i % 8) for i in range(sto_down_per_leaf)]

    ctx.keys = set(ctx.globals)
    for scn, by_id in ctx.device_params.items():
        for _id, params in by_id.items():
            ctx.keys |= set(params)
    return ctx
