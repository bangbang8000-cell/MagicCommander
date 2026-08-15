"""AIDC 规划引擎测试（地址/端口/VLAN/接线）。"""
import ipaddress
import re
import tempfile

import pytest

from intent.planner.address import AddressPlanner, AddressPool
from intent.planner.ports import PortPlanner
from intent.planner.vlans import VlanPlanner
from intent.planner.pilot_builder import build_pilot64_planned, _hname


class TestAddress:
    def test_pool_octet_overflow(self):
        # 验证跨 /24 自动进位，杜绝 10.1.0.301
        pool = AddressPool('10.1.0.0/20')
        addrs = pool.take(300)
        assert addrs[0] == '10.1.0.1'
        # 第 256 个地址 10.1.0.256 数值进位为 10.1.1.0（ipaddress 正确渲染，无非法地址）
        assert addrs[255] == '10.1.1.0'
        # 实际校验：全部地址都是合法 IP
        for a in addrs:
            ipaddress.ip_address(a)

    def test_loopback_in_24(self):
        # 环回池从 10.1.0.x 起，第 300 个在 10.1.1.x
        pl = AddressPlanner()
        lps = pl.alloc_loopback(300)
        assert lps[0] == '10.1.0.1'
        assert lps[299].startswith('10.1.1.')

    def test_interconnect_pair(self):
        pl = AddressPlanner()
        a, b = pl.alloc_interconnect_pair()
        assert int(ipaddress.ip_address(b)) - int(ipaddress.ip_address(a)) == 1

    def test_interconnect_same_subnet(self):
        """地址分配引擎修复：链路两端必须同一 /31 网段（10.1.72.1/31 与 .2/31 不在同段）。"""
        pl = AddressPlanner()
        for _ in range(32):
            a, b = pl.alloc_interconnect_pair()
            net_a = int(ipaddress.ip_address(a)) // 2
            net_b = int(ipaddress.ip_address(b)) // 2
            assert net_a == net_b, f'{a} 与 {b} 不在同一 /31 网段'

    def test_interconnect_zero_conflict(self):
        """分配连续多条链路，全项目地址零冲突（对端不侵占下一条己端）。"""
        pl = AddressPlanner()
        seen = set()
        for _ in range(512):
            a, b = pl.alloc_interconnect_pair()
            assert a not in seen and b not in seen, f'地址冲突: {a}/{b}'
            seen.update([a, b])
        assert len(seen) == 1024

    def test_interconnect_idempotent(self):
        """同输入 → 同输出（幂等，渲染字节级稳定）。"""
        def alloc():
            p = AddressPlanner()
            return [p.alloc_interconnect_pair() for _ in range(64)]
        assert alloc() == alloc()

    def test_interconnect_custom_segment(self):
        """更换互联段（改配置）→ 分配逻辑一致但地址落在新区段。"""
        from intent.planner.plan_builder import _Pools
        p = _Pools({'interconnect': '10.2.0.0/21'})
        a, b = p.interconnect.alloc_link()
        assert a.startswith('10.2.') and b.startswith('10.2.')
        assert int(ipaddress.ip_address(a)) // 2 == int(ipaddress.ip_address(b)) // 2

    def test_pool_reserved_link_skip(self):
        """预留整个网段（D23）→ alloc_link 跳过该网段。"""
        pool = AddressPool('10.1.72.0/21', reserved=['10.1.72.4', '10.1.72.5'])
        pairs = [pool.alloc_link() for _ in range(4)]
        assert pairs == [('10.1.72.0', '10.1.72.1'), ('10.1.72.2', '10.1.72.3'),
                         ('10.1.72.6', '10.1.72.7'), ('10.1.72.8', '10.1.72.9')]

    def test_pool_reserved_loose_skip(self):
        """预留单地址 → take 跳过。"""
        pool = AddressPool('10.1.0.0/20', reserved=['10.1.0.1', '10.1.0.2'])
        assert pool.take(3) == ['10.1.0.3', '10.1.0.4', '10.1.0.5']

    def test_allocator_state_segments_switch(self):
        """allocator_state.json：segments 换段优先于 plan，状态持久化。"""
        import tempfile
        from intent.planner.allocator_state import AllocatorState
        d = tempfile.mkdtemp()
        plan_seg = {'loopback': '10.1.0.0/20', 'compute': '10.1.16.0/20', 'storage': '10.1.32.0/20',
                    'biz': '10.1.48.0/20', 'oob': '10.1.64.0/21', 'interconnect': '10.1.72.0/21'}
        st = AllocatorState(d)
        st.save(segments=plan_seg, allocated={'interconnect': [['10.1.72.0', '10.1.72.1']]})
        # 用户编辑换段
        st.segments['interconnect'] = '10.2.0.0/21'
        st.save(segments=st.segments, allocated={})
        st2 = AllocatorState(d)
        assert st2.effective_segments(plan_seg)['interconnect'] == '10.2.0.0/21'

    def test_allocator_state_reserved_roundtrip(self):
        """allocator_state.json：reserved 写回保留用户编辑。"""
        import tempfile
        from intent.planner.allocator_state import AllocatorState
        d = tempfile.mkdtemp()
        st = AllocatorState(d)
        st.reserved = {'interconnect': ['10.1.72.100', '10.1.72.101']}
        st.save(segments={}, allocated={})
        st2 = AllocatorState(d)
        assert st2.reserved['interconnect'] == ['10.1.72.100', '10.1.72.101']


class TestPorts:
    def test_leaf_gpu_split(self):
        # 1-32 400G 分光 -> 64×200G，从 :1/:2 起
        ports = PortPlanner.leaf_gpu_ports(64)
        assert ports[0] == 'TwoHundredGigE1/0/1:1'
        assert ports[1] == 'TwoHundredGigE1/0/1:2'
        assert len(ports) == 64

    def test_leaf_uplink_from_33(self):
        ports = PortPlanner.leaf_uplink_ports(32)
        assert ports[0] == 'FourHundredGigE1/0/33'
        assert len(ports) == 32

    def test_biz_agg_100g_down(self):
        # BIZ-AGG 100G 下行（此前误用 40G）
        ports = PortPlanner.biz_agg_down_ports(4)
        assert ports[0] == 'HundredGigE1/0/1'

    def test_oob_ports(self):
        assert PortPlanner.oob_down_ports(8)[0] == 'GigabitEthernet1/0/1'


class TestVlan:
    def test_group_vlans(self):
        vp = VlanPlanner()
        g1 = vp.group_vlans('biz', 1)
        g2 = vp.group_vlans('biz', 1)
        assert g1 == [300]
        assert g2 == [301]
        # 带外段
        vp2 = VlanPlanner()
        assert vp2.group_vlans('oob', 1) == [400]


class TestPilotBuilder:
    def test_no_invalid_ip(self):
        ctx = build_pilot64_planned()
        # 全部设备地址合法且按 /24 段（末位 0-255，或正确进位到下一 /24）
        bad = []
        for scn, by_id in ctx.device_params.items():
            for _id, params in by_id.items():
                for key, val in params.items():
                    if key.startswith('ipv4_') and isinstance(val, str):
                        ip = val.split('/')[0]
                        try:
                            ipaddress.ip_address(ip)
                        except ValueError:
                            bad.append((scn, _id, key, val))
        assert bad == []
        # 无 10.1.0.301 之类（4 段式合法判断已涵盖）

    def test_device_counts(self):
        ctx = build_pilot64_planned()
        counts = {scn: len(by_id) for scn, by_id in ctx.device_params.items()}
        assert counts == {'SPINE': 2, 'LEAF': 8, 'STO_SPINE': 1, 'STO_LEAF': 2,
                          'BIZAGG': 2, 'BIZACC': 4, 'OOBAGG': 1, 'OOBACC': 2}

    def test_leaf_ports_correct(self):
        ctx = build_pilot64_planned()
        gpu_ports = ctx.lists['LEAF_gpu_port1']
        up_ports = ctx.lists['LEAF_uplink_port1']
        assert gpu_ports[0] == 'TwoHundredGigE1/0/1:1'
        assert up_ports[0] == 'FourHundredGigE1/0/33'
        assert len(gpu_ports) == 64
        assert len(up_ports) == 32

    def test_biz_agg_100g(self):
        ctx = build_pilot64_planned()
        down = ctx.lists['BIZAGG_downlink_port1']
        assert down[0] == 'HundredGigE1/0/1'

    def test_each_leaf_gateway(self):
        ctx = build_pilot64_planned()
        for n in range(1, 9):
            assert ctx.lists[f'LEAF_vlan_gw{n}'], f'LEAF-{n} 缺网关'

    def test_gpu_desc_present(self):
        ctx = build_pilot64_planned()
        assert ctx.lists['LEAF_gpu_desc1']
        assert 'GPU' in ctx.lists['LEAF_gpu_desc1'][0]

    def test_oob_vlan(self):
        ctx = build_pilot64_planned()
        # 8 个下行口，VLAN 逐口重复
        assert len(ctx.lists['OOBACC_downlink_vlan1']) == 8
        assert set(ctx.lists['OOBACC_downlink_vlan1']) == {400}

    def test_render_planned_pilot(self):
        """规划引擎上下文渲染：验证修复项落地。"""
        from intent.pilot64 import render_pilot
        ctx = build_pilot64_planned()
        with tempfile.TemporaryDirectory() as tmp:
            rendered = render_pilot(ctx, tmp)
            assert len(rendered) == 22

            def find(sub):
                return next(v for k, v in rendered.items() if sub in k)

            # 参数 Leaf：GPU 描述 + 33-64 上联 + 对端描述
            leaf1 = find('P-Leaf-01')
            assert 'description GPU-' in leaf1
            assert 'interface FourHundredGigE1/0/33' in leaf1
            assert 'description to-P-Spine' in leaf1
            # 业务 ACC：MLAG 接入口 + 100G 上联
            acc1 = find('BIZ-ACC-01')
            assert 'port s-mlag group 1' in acc1
            assert 'description BIZ-' in acc1
            assert 'interface HundredGigE1/0/1' in acc1
            # 业务 AGG：100G 下行
            agg1 = find('BIZ-AGG-01')
            assert 'interface HundredGigE1/0/1' in agg1
            assert 'description to-BIZ-ACC' in agg1
            # 带外：access vlan + trunk + 描述
            oob1 = find('OOB-ACC-01')
            assert 'port access vlan 400' in oob1
            assert 'port link-type trunk' in oob1
            assert 'description OOB-' in oob1
            # 无非法 IP
            for text in rendered.values():
                for m in re.findall(r'\b\d+\.\d+\.\d+\.\d+\b', text):
                    ipaddress.ip_address(m)
