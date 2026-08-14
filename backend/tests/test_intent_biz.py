"""意图参数适配器 —— 业务&管理网模板测试（BIZ_ACCESS / BIZ_AGG）。"""
from intent.normalizer import normalize_template
from intent.biz_templates import (
    BIZ_ACCESS_TEMPLATE, BIZ_AGG_TEMPLATE, build_biz_context,
)


class TestBizTemplates:
    def test_biz_access(self):
        ctx = build_biz_context(acc_count=2)
        out = normalize_template(BIZ_ACCESS_TEMPLATE, ctx, 1, scenario='BIZACC')
        assert 'sysname BJ01-R15-AIDC-H3C-BIZ-ACC-01' in out
        assert 'interface Twenty-FiveGigE1/0/1' in out
        assert 'port access vlan 300' in out
        # 同组 ACC MLAG（H3C 直接 MLAG）
        assert 'mlag system-mac 0001-0001-0001' in out
        assert 'mlag system-number 1' in out
        assert 'mlag keepalive ip destination 199.0.0.2 source 199.0.0.1' in out
        # EBGP + ECMP
        assert 'router bgp 65501' in out
        assert 'maximum-paths ebgp 16' in out
        assert 'interface Vlan-interface300' in out
        assert 'snmp-agent community read mc-biz' in out
        assert 'ssh server enable' in out

    def test_biz_agg(self):
        ctx = build_biz_context(agg_count=2, acc_count=2)
        out = normalize_template(BIZ_AGG_TEMPLATE, ctx, 1, scenario='BIZAGG')
        assert 'sysname BJ01-R01-AIDC-H3C-BIZ-AGG-01' in out
        assert 'ip vpn-instance mgt_vrf' in out
        assert 'ip binding vpn-instance mgt_vrf' in out
        # EBGP + ECMP（下联 ACC）
        assert 'router bgp 65601' in out
        assert 'maximum-paths ebgp 16' in out
        assert 'neighbor 10.1.56.6 as-number 65502' in out
        assert 'hwtacacs scheme tac_biz' in out
        assert 'primary authentication 10.10.10.10' in out
        assert 'ntp-service unicast-server 10.200.0.1' in out
        assert 'ntp-service unicast-server 10.200.0.2' in out
        assert 'snmp-agent target-host trap address udp-domain 10.10.10.100' in out
        assert 'info-center loghost 10.10.10.100' in out

    def test_biz_agg_no_aaa(self):
        ctx = build_biz_context(agg_count=1)
        ctx.globals['para_para_C_AAA1'] = None
        out = normalize_template(BIZ_AGG_TEMPLATE, ctx, 1, scenario='BIZAGG')
        assert 'hwtacacs scheme' not in out
        assert 'ssh server enable' in out

    def test_biz_agg_ntp_list(self):
        ctx = build_biz_context(agg_count=1)
        out = normalize_template(BIZ_AGG_TEMPLATE, ctx, 1, scenario='BIZAGG')
        assert out.count('ntp-service unicast-server') == 2
