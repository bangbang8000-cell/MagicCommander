"""
64 台试点参数集构建器（用规划引擎，P1.1）。

用 AddressPlanner / PortPlanner / VlanPlanner 正确生成 22 台设备上下文，
修复硬编码问题：IP 溢出（10.1.0.301）、端口编号、BIZ-AGG 100G 下行、
OOB vlan/trunk、每 Leaf 网关、全接口 description。
"""

import ipaddress

from ..resolver import IntentContext
from .address import AddressPlanner
from .ports import PortPlanner
from .vlans import VlanPlanner


def _hname(site, rack, abbr, idx):
    return f'{site}-{rack}-AIDC-H3C-{abbr}-{idx:02d}'


# 场景缩写（命名规范表 §2）
_SCN_ABBR = {
    'SPINE': 'P-Spine', 'LEAF': 'P-Leaf', 'STO_SPINE': 'S-Spine', 'STO_LEAF': 'S-Leaf',
    'BIZAGG': 'BIZ-AGG', 'BIZACC': 'BIZ-ACC', 'OOBAGG': 'OOB-AGG', 'OOBACC': 'OOB-ACC',
}


class PilotBuilder:
    """用规划引擎构建 64 台试点上下文。"""

    def __init__(self, pfc_queue=3, cnp_queue=6, site='BJ01', segments=None, reserved=None, state=None):
        self.pfc = pfc_queue
        self.cnp = cnp_queue
        self.site = site
        self.state = state
        # D23：可传 allocator 状态（segments 换段 / reserved 预留跳过）
        if state:
            self.addr = AddressPlanner(segments=state.effective_segments(segments or {}),
                                       reserved=reserved or state.reserved)
        else:
            self.addr = AddressPlanner(segments=segments, reserved=reserved)
        self.ports = PortPlanner()
        self.vlans = VlanPlanner()
        self.ctx = IntentContext()
        self._rack = {}   # scenario+id -> rack

    # ---- 工具 ----
    def _add(self, scn, idx, asn, desc_prefix=None):
        loop = self.addr.alloc_loopback()[0]
        mgmt = self.addr.alloc_mgmt()[0]
        params = {
            f'hostname_hostname_B_{scn}{idx}': _hname(self.site, self._rack_of(scn, idx), _SCN_ABBR[scn], idx),
            f'hostname_hostname_E_{scn}{idx}': asn,
            f'ipv4_LoopBack_P_{scn}{idx}': f'{loop}/32',
            f'ipv4_M-ILO_P_{scn}{idx}': f'{mgmt}/24',
        }
        self.ctx.device_params.setdefault(scn, {})[idx] = params
        return params

    def _rack_of(self, scn, idx):
        key = (scn, idx)
        if key not in self._rack:
            self._rack[key] = f'R{len(self._rack) + 1:02d}'
        return self._rack[key]

    def _set(self, scn, idx, name, values):
        self.ctx.lists[f'{scn}_{name}{idx}'] = list(values)

    def _peers(self, scn, idx, local_ips, peer_ips, peer_ases, gw_ips=None):
        """按上联 IP 生成 bgp_peer（对端由分配器给出，同 /31 网段）+ uplink_desc 与（可选）gw 通告。"""
        self.ctx.lists[f'{scn}_bgp_peer_ip{idx}'] = list(peer_ips)
        self.ctx.lists[f'{scn}_bgp_peer_as{idx}'] = list(peer_ases)
        self.ctx.lists[f'{scn}_uplink_desc{idx}'] = [f'to-{_peer_abbr(a)}' for a in peer_ases]
        if gw_ips:
            nets, masks = [], []
            for gw in gw_ips:
                net = ipaddress.ip_network(f'{gw}/24', strict=False)
                nets.append(str(net.network_address))
                masks.append(str(net.netmask))
            self.ctx.lists[f'{scn}_gw_net{idx}'] = nets
            self.ctx.lists[f'{scn}_gw_mask{idx}'] = masks
        else:
            self.ctx.lists[f'{scn}_gw_net{idx}'] = []
            self.ctx.lists[f'{scn}_gw_mask{idx}'] = []

    # ---- 参数网 ----
    def build_roce(self):
        leaf_count = 8
        # Spine 2 台：上联 8 Leaf × 16 = 128
        for n in (1, 2):
            self._add('SPINE', n, 65110 + n)
            pairs = [self.addr.alloc_interconnect_pair() for _ in range(128)]
            ips = [p[1] for p in pairs]          # 聚合侧己端 = 网段第二地址
            peer_ips = [p[0] for p in pairs]     # 对端 = 网段第一地址（接入侧）
            self._set('SPINE', n, 'uplink_port', self.ports.spine_uplink_ports(128))
            self._set('SPINE', n, 'uplink_ip', ips)
            self._peers('SPINE', n, ips, peer_ips, [65100 + lf + 1 for lf in range(8) for _ in range(16)])
        # Leaf 8 台：1-32 分光 64 GPU + 33-64 上联 32
        for n in range(1, leaf_count + 1):
            self._add('LEAF', n, 65100 + n)
            gpu_ports = self.ports.leaf_gpu_ports(64)
            gpu_vlans = _repeat(self.vlans.group_vlans('compute', 2), len(gpu_ports))
            gpu_descs = [f'GPU-{self._rack_of("LEAF", n)}-{i // 8 % 8 + 1}-{i % 8 + 1}' for i in range(64)]
            self._set('LEAF', n, 'gpu_port', gpu_ports)
            self._set('LEAF', n, 'gpu_vlan', gpu_vlans)
            self._set('LEAF', n, 'gpu_desc', gpu_descs)
            pairs = [self.addr.alloc_interconnect_pair() for _ in range(32)]
            up_ips = [p[0] for p in pairs]
            peer_ips = [p[1] for p in pairs]
            self._set('LEAF', n, 'uplink_port', self.ports.leaf_uplink_ports(32))
            self._set('LEAF', n, 'uplink_ip', up_ips)
            self._peers('LEAF', n, up_ips, peer_ips, [65110 + (i // 16) + 1 for i in range(32)])
            # 每 Leaf 网关（H2：VLAN 去重 → 每 VLAN 一行）
            distinct_vlans = list(dict.fromkeys(gpu_vlans))
            gws = [self.addr.compute_gw.take_ip() for _ in distinct_vlans]
            self._set('LEAF', n, 'vlan_id', distinct_vlans)
            self._set('LEAF', n, 'vlan_gw', gws)
            self._peers_gw('LEAF', n, gws)

    def _peers_gw(self, scn, idx, gw_ips):
        nets, masks = [], []
        for gw in gw_ips:
            net = ipaddress.ip_network(f'{gw}/24', strict=False)
            nets.append(str(net.network_address))
            masks.append(str(net.netmask))
        self.ctx.lists[f'{scn}_gw_net{idx}'] = nets
        self.ctx.lists[f'{scn}_gw_mask{idx}'] = masks

    # ---- 存储网 ----
    def build_storage(self):
        # 1 STO_SPINE + 2 STO_LEAF（S9825-128B 200G）
        self._add('STO_SPINE', 1, 65121)
        sp_pairs = [self.addr.alloc_interconnect_pair() for _ in range(2)]
        sp_ips = [p[1] for p in sp_pairs]
        sp_peer_ips = [p[0] for p in sp_pairs]
        self._set('STO_SPINE', 1, 'uplink_port', self.ports.sto_uplink_ports(2, 1))
        self._set('STO_SPINE', 1, 'uplink_ip', sp_ips)
        self._peers('STO_SPINE', 1, sp_ips, sp_peer_ips, [65130 + i for i in (1, 2)])
        for n in (1, 2):
            self._add('STO_LEAF', n, 65130 + n)
            sto_ports = self.ports.sto_leaf_down_ports(32)
            sto_vlans = _repeat(self.vlans.group_vlans('storage', 2), len(sto_ports))
            sto_descs = [f'STO-{self._rack_of("STO_LEAF", n)}-{i:02d}' for i in range(1, len(sto_ports) + 1)]
            self._set('STO_LEAF', n, 'gpu_port', sto_ports)
            self._set('STO_LEAF', n, 'gpu_vlan', sto_vlans)
            self._set('STO_LEAF', n, 'gpu_desc', sto_descs)
            lf_pair = self.addr.alloc_interconnect_pair()
            lf_ips = [lf_pair[0]]
            lf_peer_ips = [lf_pair[1]]
            self._set('STO_LEAF', n, 'uplink_port', self.ports.sto_uplink_ports(1, 33))
            self._set('STO_LEAF', n, 'uplink_ip', lf_ips)
            self._peers('STO_LEAF', n, lf_ips, lf_peer_ips, [65121])
            # H2：VLAN 去重 → 每 VLAN 一行
            distinct_vlans = list(dict.fromkeys(sto_vlans))
            gws = [self.addr.storage_gw.take_ip() for _ in distinct_vlans]
            self._set('STO_LEAF', n, 'vlan_id', distinct_vlans)
            self._set('STO_LEAF', n, 'vlan_gw', gws)
            self._peers_gw('STO_LEAF', n, gws)

    # ---- 业务网 ----
    def build_biz(self):
        # 2 BIZ_AGG + 4 BIZ_ACC（ACC 每 32 业务口 25G，上联 100G 到 2 AGG）
        for n in (1, 2):
            self._add('BIZAGG', n, 65150 + n)
            agg_pairs = [self.addr.alloc_interconnect_pair() for _ in range(2)]
            agg_ips = [p[1] for p in agg_pairs]
            agg_peer_ips = [p[0] for p in agg_pairs]
            self._set('BIZAGG', n, 'uplink_port', self.ports.biz_uplink_ports(2))
            self._set('BIZAGG', n, 'uplink_ip', agg_ips)
            self._peers('BIZAGG', n, agg_ips, agg_peer_ips, [65140 + i for i in range(1, 5)])
            self._set('BIZAGG', n, 'downlink_port', self.ports.biz_agg_down_ports(4))
            self._set('BIZAGG', n, 'downlink_desc',
                      [f'to-BIZ-ACC-{i}' for i in range(1, 5)])
        for n in range(1, 5):
            self._add('BIZACC', n, 65140 + n)
            biz_ports = self.ports.biz_acc_down_ports(32)
            biz_vlans = _repeat(self.vlans.group_vlans('biz', 1, reuse=(n % 2 == 1)), len(biz_ports))
            biz_descs = [f'BIZ-{self._rack_of("BIZACC", n)}-{i:02d}' for i in range(1, len(biz_ports) + 1)]
            self._set('BIZACC', n, 'biz_port', biz_ports)
            self._set('BIZACC', n, 'biz_vlan', biz_vlans)
            self._set('BIZACC', n, 'biz_desc', biz_descs)
            acc_pairs = [self.addr.alloc_interconnect_pair() for _ in range(2)]
            acc_ips = [p[0] for p in acc_pairs]
            acc_peer_ips = [p[1] for p in acc_pairs]
            self._set('BIZACC', n, 'uplink_port', self.ports.biz_uplink_ports(2))
            self._set('BIZACC', n, 'uplink_ip', acc_ips)
            self._peers('BIZACC', n, acc_ips, acc_peer_ips, [65150 + (i % 2) + 1 for i in range(2)])
            gws = [self.addr.biz_gw.take_ip() for _ in range(2)]
            self._set('BIZACC', n, 'vlan_id', [300, 301])
            self._set('BIZACC', n, 'vlan_gw', gws)
            self._peers_gw('BIZACC', n, gws)
            # MLAG 成对
            pair = (n - 1) // 2 + 1
            member = (n - 1) % 2
            keep = '199.0.0.1' if member == 0 else '199.0.0.2'
            self.ctx.device_params['BIZACC'][n].update({
                'mlag_pair': pair, 'mlag_system_number': member + 1,
                'mlag_keepalive': keep,
                'mlag_peer_keepalive': '199.0.0.2' if member == 0 else '199.0.0.1',
            })

    # ---- 带外网 ----
    def build_oob(self):
        self._add('OOBAGG', 1, 65161)
        oob_agg_down = self.ports.oob_down_ports(2)
        self._set('OOBAGG', 1, 'downlink_port', oob_agg_down)
        self._set('OOBAGG', 1, 'downlink_vlan', [400, 401])
        self._set('OOBAGG', 1, 'downlink_desc', ['OOB-AGG-DL-1', 'OOB-AGG-DL-2'])
        self._set('OOBAGG', 1, 'uplink_port', self.ports.oob_uplink_ports(1))
        self._peers('OOBAGG', 1, [], [], [])
        for n in (1, 2):
            self._add('OOBACC', n, 65170 + n)
            oob_ports = self.ports.oob_down_ports(8)
            self._set('OOBACC', n, 'downlink_port', oob_ports)
            self._set('OOBACC', n, 'downlink_vlan', [400] * len(oob_ports))
            self._set('OOBACC', n, 'downlink_desc',
                      [f'OOB-{self._rack_of("OOBACC", n)}-{i:02d}' for i in range(1, len(oob_ports) + 1)])
            trunk_pair = self.addr.alloc_interconnect_pair()
            trunk_ips = [trunk_pair[0]]
            trunk_peer_ips = [trunk_pair[1]]
            self._set('OOBACC', n, 'uplink_port', self.ports.oob_uplink_ports(1))
            self._set('OOBACC', n, 'uplink_ip', trunk_ips)
            self._peers('OOBACC', n, trunk_ips, trunk_peer_ips, [65161])

    def build(self) -> IntentContext:
        self.build_roce()
        self.build_storage()
        self.build_biz()
        self.build_oob()
        self.ctx.globals.update({
            'pfc_queue': self.pfc, 'cnp_queue': self.cnp,
            'bgp_max_paths': 16, 'roce_pfc_headroom': 80000,
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
        self.ctx.keys = set(self.ctx.globals)
        for scn, by_id in self.ctx.device_params.items():
            for _id, params in by_id.items():
                self.ctx.keys |= set(params)
        if self.state:
            # D23：状态账本写回（reserved 保留用户编辑）
            self.state.save(segments=self.addr.segments, allocated=self.addr.allocated())
        return self.ctx


def _adj(ip_str):
    try:
        return str(ipaddress.ip_address(ip_str) + 1)
    except Exception:  # noqa: BLE001
        return ''


def _repeat(vals, n):
    """将列表循环重复到长度 n（如 2 个 VLAN 覆盖 64 个口）。"""
    if not vals:
        return []
    return [vals[i % len(vals)] for i in range(n)]


def _peer_abbr(asn: int) -> str:
    """AS → 对端设备缩写（uplink description 用）。

    压缩 AS 方案：6510x=P-Leaf 6511x=P-Spine 6512x=S-Spine 6513x=S-Leaf
                   6514x=BIZ-ACC 6515x=BIZ-AGG 6516x=OOB-AGG 6517x=OOB-ACC
    """
    tens = (int(asn) % 100) // 10
    return {0: 'P-Leaf', 1: 'P-Spine', 2: 'S-Spine', 3: 'S-Leaf',
            4: 'BIZ-ACC', 5: 'BIZ-AGG', 6: 'OOB-AGG', 7: 'OOB-ACC'}.get(tens, 'UNKNOWN')


def build_pilot64_planned(pfc_queue=3, cnp_queue=6, site='BJ01', state=None) -> IntentContext:
    """用规划引擎生成 64 台试点上下文。

    state：可选 AllocatorState（segments 换段 / reserved 预留跳过，build 后写回）。
    """
    return PilotBuilder(pfc_queue, cnp_queue, site, state=state).build()
