"""
G3.1 plan:table → IntentContext 全量重建（导入按 plan 驱动，规模无关）。

替代 plantable_to_context 中「仅取 4 宏观参数 + 固定 64 台重建」：
- 设备清单/接线/终端 全部取自 plan 的 deviceList/connections/terminals；
- 环回/管理/缺失网关 从 macro.ipSegments 对应段确定性分配；
- 聚合层（SPINE/STO_SPINE/BIZ_AGG/OOB_AGG）上联由对端反向连接按场景重建；
- 与 plan 规模无关（32~1024 同逻辑）。
"""

import ipaddress

from ..resolver import IntentContext
from .address import AddressPool
from .ports import PortPlanner

# 默认地址段（F10 10.1.0.0/16 裂解；契约 v1.1 macro.ipSegments）
_DEFAULT_SEG = {
    'loopback': '10.1.0.0/20',
    'compute': '10.1.16.0/20',
    'storage': '10.1.32.0/20',
    'biz': '10.1.48.0/20',
    'oob': '10.1.64.0/21',
    'interconnect': '10.1.72.0/21',
}

# role → 场景（MC 场景命名）
_ROLE_TO_SCN = {
    'SPINE': 'SPINE', 'LEAF': 'LEAF', 'STO_SPINE': 'STO_SPINE', 'STO_LEAF': 'STO_LEAF',
    'BIZ_AGG': 'BIZAGG', 'BIZ_ACCESS': 'BIZACC', 'OOB_AGG': 'OOBAGG', 'OOB_ACCESS': 'OOBACC',
}

# 聚合场景 → 接入对端场景（反向上联重建）
_AGG_SCN = {'SPINE': 'LEAF', 'STO_SPINE': 'STO_LEAF', 'BIZAGG': 'BIZACC', 'OOBAGG': 'OOBACC'}

# 网关池选择（平面）
_SCN_GW_POOL = {'LEAF': 'compute', 'STO_LEAF': 'storage', 'BIZACC': 'biz'}

# 终端列表键（场景 → 端口/VLAN/描述）
_TERMINAL_PORT = {'LEAF': 'gpu_port', 'STO_LEAF': 'gpu_port', 'BIZACC': 'biz_port', 'OOBACC': 'downlink_port'}
_TERMINAL_VLAN = {'LEAF': 'gpu_vlan', 'STO_LEAF': 'gpu_vlan', 'BIZACC': 'biz_vlan', 'OOBACC': 'downlink_vlan'}
_TERMINAL_DESC = {'LEAF': 'gpu_desc', 'STO_LEAF': 'gpu_desc', 'BIZACC': 'biz_desc', 'OOBACC': 'downlink_desc'}


class _Pools:
    """由 macro.ipSegments 构建的地址池。"""

    def __init__(self, seg):
        self.loopback = AddressPool(seg.get('loopback', _DEFAULT_SEG['loopback']))
        self.oob_mgmt = AddressPool(seg.get('oob', _DEFAULT_SEG['oob']))
        self.compute_gw = AddressPool(seg.get('compute', _DEFAULT_SEG['compute']))
        self.storage_gw = AddressPool(seg.get('storage', _DEFAULT_SEG['storage']))
        self.biz_gw = AddressPool(seg.get('biz', _DEFAULT_SEG['biz']))
        # G3.1 地址引擎修复：互联段由 MC 分配器统一分配（决策：MC 唯一事实源），
        # 不再复用 AL plan 的 src_ip/dst_ip（存在跨 /31 网段 + 地址冲突缺陷）。
        self.interconnect = AddressPool(seg.get('interconnect', _DEFAULT_SEG['interconnect']))

    def gw_pool(self, pool_name):
        return {'compute': self.compute_gw, 'storage': self.storage_gw, 'biz': self.biz_gw}[pool_name]


def _dedup(vals):
    seen, out = set(), []
    for v in vals:
        if v not in seen:
            seen.add(v)
            out.append(v)
    return out


class PlanContextBuilder:
    """按 plan:table（契约 v1.1）全量重建 IntentContext。"""

    def __init__(self, plan: dict):
        self.plan = plan
        self.macro = plan.get('macro', {})
        seg = self.macro.get('ipSegments') or self.macro.get('ip_segments') or _DEFAULT_SEG
        self.addr = _Pools(seg)
        self.ctx = IntentContext()
        self.by_name = {}
        self.scn_id_of = {}
        self._counters = {}
        self._agg_reverse = {}   # agg_scn -> list[(src_ip, dst_ip, peer_as, desc)]

    # ---- 工具 ----
    def _append(self, scn, idx, name, val):
        if val is None:
            return
        self.ctx.lists.setdefault(f'{scn}_{name}{idx}', []).append(val)

    def _id_of(self, scn, name):
        """从命名尾部取序号（BIJ01-...-P-Leaf-01 → 1）；失败用场景内计数器。"""
        try:
            seq = int(name.rsplit('-', 1)[-1])
        except (ValueError, TypeError):
            seq = 0
        if seq > 0:
            return seq
        self._counters[scn] = self._counters.get(scn, 0) + 1
        return self._counters[scn]

    def _expanded_devices(self):
        """兼容逐设备（AL）与分组式（MC）deviceList。"""
        out = []
        for d in self.plan.get('deviceList', []):
            if d.get('name'):
                out.append(d)
            elif d.get('devices'):
                for nm in d['devices']:
                    c = dict(d)
                    c['name'] = nm
                    c.pop('devices', None)
                    c.pop('count', None)
                    out.append(c)
        return out

    def _peer_asn(self, c):
        """连接对端 ASN：真实主机名 → deviceList；角色名 → 该角色首个设备。"""
        dst = c.get('dst', '')
        if dst in self.by_name:
            return self.by_name[dst].get('asn', 65000)
        dst_scn = _ROLE_TO_SCN.get(dst)
        for d in self.plan.get('deviceList', []):
            if d.get('scenario') == dst_scn or d.get('role') == dst:
                return d.get('asn', 65000)
        return 65000

    # ---- 1) 设备 ----
    def _build_devices(self):
        for d in self._expanded_devices():
            name = d.get('name')
            if not name:
                continue
            scn = d.get('scenario') or _ROLE_TO_SCN.get(d.get('role', ''), '')
            if not scn:
                continue
            idx = self._id_of(scn, name)
            self.by_name[name] = d
            self.scn_id_of[name] = (scn, idx)
            loop = self.addr.loopback.take(1)[0]
            mgmt = self.addr.oob_mgmt.take(1)[0]
            params = {
                f'hostname_hostname_B_{scn}{idx}': name,
                f'hostname_hostname_E_{scn}{idx}': d.get('asn', 65000),
                f'ipv4_LoopBack_P_{scn}{idx}': f'{loop}/32',
                f'ipv4_M-ILO_P_{scn}{idx}': f'{mgmt}/24',
            }
            if scn == 'BIZACC':
                pair = d.get('mlag_pair') or ((idx - 1) // 2 + 1)
                member = int(d.get('mlag_system_number', (idx - 1) % 2 + 1))
                params['mlag_pair'] = pair
                params['mlag_system_number'] = member
                params['mlag_keepalive'] = '199.0.0.1' if member == 1 else '199.0.0.2'
                params['mlag_peer_keepalive'] = '199.0.0.2' if member == 1 else '199.0.0.1'
            self.ctx.device_params.setdefault(scn, {})[idx] = params

    # ---- 2) 接线 ----
    def _apply_connections(self):
        for c in self.plan.get('connections', []):
            src = c.get('src', '')
            local_ip = peer_ip = ''
            if src in self.scn_id_of:
                scn, idx = self.scn_id_of[src]
                # 地址引擎修复：互联 IP 由 MC 分配器按 /31 网段粒度分配（幂等、对齐、零冲突），
                # 忽略 AL plan 的 src_ip/dst_ip（决策：MC 分配器唯一事实源）。
                local_ip, peer_ip = self.addr.interconnect.alloc_link()
                self._append(scn, idx, 'uplink_port', c.get('src_port'))
                self._append(scn, idx, 'uplink_ip', local_ip)
                self._append(scn, idx, 'bgp_peer_ip', peer_ip)
                self._append(scn, idx, 'bgp_peer_as', self._peer_asn(c))
                self._append(scn, idx, 'uplink_desc', c.get('desc', ''))
            # 对端反向（dst 为聚合角色）→ 供聚合层上联重建（用分配器地址，非 AL 的 IP）
            dst_scn = _ROLE_TO_SCN.get(c.get('dst', ''))
            if dst_scn in _AGG_SCN:
                peer_as = self.by_name.get(src, {}).get('asn', 65000)
                self._agg_reverse.setdefault(dst_scn, []).append(
                    (local_ip, peer_ip, peer_as, c.get('desc', '')))

    # ---- 3) 终端 ----
    def _apply_terminals(self):
        for t in self.plan.get('terminals', []):
            src = t.get('src', '')
            if src not in self.scn_id_of:
                continue
            scn, idx = self.scn_id_of[src]
            if scn not in _TERMINAL_PORT:
                continue
            self._append(scn, idx, _TERMINAL_PORT[scn], t.get('src_port'))
            self._append(scn, idx, _TERMINAL_VLAN[scn], t.get('vlan'))
            self._append(scn, idx, _TERMINAL_DESC[scn], t.get('desc', ''))

    # ---- 4) VLAN 网关 ----
    def _apply_gateways(self):
        for scn in ('LEAF', 'STO_LEAF', 'BIZACC'):
            for idx in sorted(self.ctx.device_params.get(scn, {})):
                vids = _dedup(self.ctx.lists.get(f'{scn}_{_TERMINAL_VLAN[scn]}{idx}', []))
                if not vids:
                    continue
                dev = self.by_name.get(self.ctx.device_params[scn][idx].get(f'hostname_hostname_B_{scn}{idx}'))
                plan_gws = (dev or {}).get('gateways') or []
                gws = []
                for i in range(len(vids)):
                    if i < len(plan_gws):
                        gws.append(str(plan_gws[i]))
                    else:
                        gws.append(self.addr.gw_pool(_SCN_GW_POOL[scn]).take(1)[0])
                self.ctx.lists[f'{scn}_vlan_id{idx}'] = list(vids)
                self.ctx.lists[f'{scn}_vlan_gw{idx}'] = gws
                nets, masks = [], []
                for gw in gws:
                    net = ipaddress.ip_network(f'{gw}/24', strict=False)
                    nets.append(str(net.network_address))
                    masks.append(str(net.netmask))
                self.ctx.lists[f'{scn}_gw_net{idx}'] = nets
                self.ctx.lists[f'{scn}_gw_mask{idx}'] = masks

    # ---- 5) 聚合层上联（由反向连接重建） ----
    def _build_agg_uplinks(self):
        for agg_scn, reverse in self._agg_reverse.items():
            devs = self.ctx.device_params.get(agg_scn, {})
            if not devs:
                continue
            idxs = sorted(devs)
            per_dev = {i: [] for i in idxs}
            for n, rec in enumerate(reverse):
                per_dev[idxs[n % len(idxs)]].append(rec)
            for idx, recs in per_dev.items():
                if not recs:
                    continue
                self.ctx.lists[f'{agg_scn}_uplink_port{idx}'] = _agg_uplink_ports(agg_scn, len(recs))
                self.ctx.lists[f'{agg_scn}_uplink_ip{idx}'] = [r[1] for r in recs]
                self.ctx.lists[f'{agg_scn}_bgp_peer_ip{idx}'] = [r[0] for r in recs]
                self.ctx.lists[f'{agg_scn}_bgp_peer_as{idx}'] = [r[2] for r in recs]
                self.ctx.lists[f'{agg_scn}_uplink_desc{idx}'] = [r[3] for r in recs]
                self.ctx.lists[f'{agg_scn}_gw_net{idx}'] = []
                self.ctx.lists[f'{agg_scn}_gw_mask{idx}'] = []

    # ---- 6) 聚合层下联合成（BIZ_AGG/OOB_AGG） ----
    def _build_agg_downlinks(self):
        acc_count = len(self.ctx.device_params.get('BIZACC', {}))
        for idx in sorted(self.ctx.device_params.get('BIZAGG', {})):
            down = max(acc_count, 0)
            self.ctx.lists[f'BIZAGG_downlink_port{idx}'] = PortPlanner.biz_agg_down_ports(down)
            self.ctx.lists[f'BIZAGG_downlink_desc{idx}'] = [f'to-BIZ-ACC-{i}' for i in range(1, down + 1)]
        oob_count = len(self.ctx.device_params.get('OOBACC', {}))
        for idx in sorted(self.ctx.device_params.get('OOBAGG', {})):
            self.ctx.lists[f'OOBAGG_downlink_port{idx}'] = PortPlanner.oob_down_ports(oob_count)
            self.ctx.lists[f'OOBAGG_downlink_vlan{idx}'] = [400] * oob_count
            self.ctx.lists[f'OOBAGG_downlink_desc{idx}'] = [f'OOB-AGG-DL-{i}' for i in range(1, oob_count + 1)]

    # ---- 7) 全局参数 ----
    def _set_globals(self):
        m = self.macro
        self.ctx.globals.update({
            'pfc_queue': int(m.get('pfcQueue', m.get('pfc_queue', 3))),
            'cnp_queue': int(m.get('cnpQueue', m.get('cnp_queue', 6))),
            'bgp_max_paths': int(m.get('bgpMaxPaths', m.get('bgp_max_paths', 16))),
            'roce_pfc_headroom': 80000,
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

    def _set_bridge(self):
        """G3.2：桥接标识透传到 context（供 template.meta.json 持久化）。"""
        meta = self.plan.get('meta', {})
        if meta.get('source') or meta.get('projectType') or meta.get('bridgeVersion'):
            self.ctx.bridge = {
                'source': meta.get('source', 'autolink'),
                'projectType': meta.get('projectType', 'aidc'),
                'bridgeVersion': meta.get('bridgeVersion', '1.0'),
                'originPlan': meta.get('project', ''),
            }
        else:
            self.ctx.bridge = None

    def build(self) -> IntentContext:
        self._build_devices()
        self._apply_connections()
        self._apply_terminals()
        self._apply_gateways()
        self._build_agg_uplinks()
        self._build_agg_downlinks()
        self._set_globals()
        self._set_bridge()
        return self.ctx


def _agg_uplink_ports(scn: str, count: int) -> list:
    P = PortPlanner
    if scn == 'SPINE':
        return P.spine_uplink_ports(count)
    if scn == 'STO_SPINE':
        return P.sto_uplink_ports(count, 1)
    if scn == 'BIZAGG':
        return P.biz_uplink_ports(count)
    return P.oob_uplink_ports(count)


def build_plan_context(plan: dict) -> IntentContext:
    """G3.1：按 plan:table 全量重建 IntentContext（导入入口）。"""
    return PlanContextBuilder(plan).build()
