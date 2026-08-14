"""意图参数适配器 —— RoCE 计算网模板测试（PFC/CNP 队列可调）。"""
from intent.resolver import IntentContext
from intent.normalizer import normalize_template
from intent.roce_templates import SPINE_TEMPLATE, LEAF_TEMPLATE, build_roce_context


class TestRoceTemplates:
    def test_spine_default_queues(self):
        ctx = build_roce_context(pfc_queue=3, cnp_queue=6)
        out = normalize_template(SPINE_TEMPLATE, ctx, 1, scenario='SPINE')
        # 默认 PFC=3 / CNP=6
        assert 'sysname BJ01-R01-AIDC-H3C-P-Spine-01' in out
        assert 'priority-flow-control no-drop dot1p 3' in out
        assert 'priority-flow-control deadlock cos 3' in out
        assert 'buffer egress cell queue 6 shared ratio 100' in out
        assert 'buffer egress cell queue 3 shared ratio 100' in out
        assert 'qos wfq cs6 group sp' in out
        assert 'qos wred apply 400G-WRED-Template' in out
        # EBGP + ECMP（2026-08-13 架构）
        assert 'router bgp 65201' in out
        assert 'bgp router-id 10.1.0.1' in out
        assert 'maximum-paths ebgp 16' in out
        assert 'neighbor 10.1.16.67 as-number 65102' in out
        assert 'network 10.1.0.1 mask 255.255.255.255' in out
        assert 'ip binding vpn-instance Mgnt' in out

    def test_leaf_default_queues(self):
        ctx = build_roce_context(pfc_queue=3, cnp_queue=6)
        out = normalize_template(LEAF_TEMPLATE, ctx, 1, scenario='LEAF')
        assert 'sysname BJ01-R02-AIDC-H3C-P-Leaf-01' in out
        # 上联 400G：PFC no-drop 3
        assert 'interface FourHundredGigE1/0/33' in out
        assert 'priority-flow-control no-drop dot1p 3' in out
        # GPU 200G 分光：1:2 子口 + 200G WRED + gts 走 CNP 队列
        assert 'interface TwoHundredGigE1/0/1:1' in out
        assert 'port access vlan 171' in out
        assert 'qos wred apply 200G-WRED-Template' in out
        assert 'qos gts queue 6 cir 200000000 cbs 16000000' in out
        # VLAN 网关
        assert 'interface Vlan-interface171' in out

    def test_queues_overridable(self):
        ctx = build_roce_context(pfc_queue=5, cnp_queue=7)
        out = normalize_template(LEAF_TEMPLATE, ctx, 1, scenario='LEAF')
        assert 'priority-flow-control no-drop dot1p 5' in out
        assert 'priority-flow-control deadlock cos 5' in out
        assert 'qos wfq cs7 group sp' in out
        assert 'qos gts queue 7 cir 200000000 cbs 16000000' in out
        assert 'qos wfq cs6 group sp' not in out

    def test_leaf_peer_hostname(self):
        ctx = build_roce_context(leaf_count=8)
        out = normalize_template(LEAF_TEMPLATE, ctx, 2, scenario='LEAF')
        assert 'sysname BJ01-R03-AIDC-H3C-P-Leaf-02' in out
