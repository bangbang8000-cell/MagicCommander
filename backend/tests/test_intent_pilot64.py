"""意图参数适配器 —— 64 台试点参数集测试。"""
import os
import tempfile

import pytest

from intent.pilot64 import (
    build_pilot64_context, render_pilot, device_counts,
    generate_pilot64_projects, render_pilot64_projects,
)
from intent.roce_templates import ROCE_DEFAULTS

sys_path_ok = True
try:
    from pre_processing import PreProcessing
    import config as mc_config
except Exception:  # noqa: BLE001
    sys_path_ok = False


class TestPilot64:
    def test_device_counts(self):
        ctx = build_pilot64_context()
        counts = device_counts(ctx)
        # 参数网 2+8、存储 1+2、业务 2+4、带外 1+2 = 22 台
        assert counts['SPINE'] == 2
        assert counts['LEAF'] == 8
        assert counts['STO_SPINE'] == 1
        assert counts['STO_LEAF'] == 2
        assert counts['BIZAGG'] == 2
        assert counts['BIZACC'] == 4
        assert counts['OOBAGG'] == 1
        assert counts['OOBACC'] == 2
        assert sum(counts.values()) == 22

    def test_naming_f9(self):
        ctx = build_pilot64_context()
        spn1 = ctx.device_params['SPINE'][1]['hostname_hostname_B_SPINE1']
        # 命名格式：{机房}-{机柜}-AIDC-H3C-{缩写}-{序号}
        assert spn1.startswith('BJ01-') and spn1.endswith('-AIDC-H3C-P-Spine-01')
        leaf8 = ctx.device_params['LEAF'][8]['hostname_hostname_B_LEAF8']
        assert leaf8.endswith('-AIDC-H3C-P-Leaf-08')

    def test_vlan_f14(self):
        ctx = build_pilot64_context()
        # 计算 VLAN 100-199
        vlans = ctx.lists['LEAF_gpu_vlan1']
        assert set(vlans) == {100, 101}
        # 存储 VLAN 200-299
        sto = ctx.lists['STO_LEAF_gpu_vlan1']
        assert all(200 <= v <= 299 for v in sto)

    def test_queue_f16(self):
        ctx = build_pilot64_context()
        assert ctx.globals['pfc_queue'] == 3
        assert ctx.globals['cnp_queue'] == 6
        ctx2 = build_pilot64_context(pfc_queue=5, cnp_queue=7)
        assert ctx2.globals['pfc_queue'] == 5
        assert ctx2.globals['cnp_queue'] == 7

    def test_render_all_planes(self):
        ctx = build_pilot64_context()
        with tempfile.TemporaryDirectory() as tmp:
            rendered = render_pilot(ctx, tmp)
            assert len(rendered) == 22

            def find(sub):
                return next(v for k, v in rendered.items() if sub in k)

            # 参数网 Leaf：GPU 下联 + PFC/CNP
            leaf1 = find('P-Leaf-01')
            assert 'priority-flow-control no-drop dot1p 3' in leaf1
            assert 'interface TwoHundredGigE1/0/1:1' in leaf1
            assert 'port access vlan 100' in leaf1
            assert 'qos wfq cs6 group sp' in leaf1
            # 存储 Leaf：200G 存储口
            stolf1 = find('S-Leaf-01')
            assert 'interface TwoHundredGigE1/0/1' in stolf1
            assert 'port access vlan 200' in stolf1
            # 业务接入
            bizacc1 = find('BIZ-ACC-01')
            assert 'interface Twenty-FiveGigE1/0/1' in bizacc1
            assert 'port access vlan 300' in bizacc1
            # 业务汇聚：带内管理
            bizagg1 = find('BIZ-AGG-01')
            assert 'ip vpn-instance mgt_vrf' in bizagg1
            assert 'hwtacacs scheme tac_aidc' in bizagg1
            # 带外
            oobacc1 = find('OOB-ACC-01')
            assert 'snmp-agent community read mc-aidc' in oobacc1

    def test_generate_four_projects(self):
        ctx = build_pilot64_context()
        with tempfile.TemporaryDirectory() as tmp:
            projects = generate_pilot64_projects(tmp, ctx)
            assert len(projects) == 4
            for plane, project_dir in projects.items():
                assert os.path.exists(os.path.join(project_dir, 'templates'))
                assert os.path.exists(os.path.join(project_dir, 'para.xlsx'))

    @pytest.mark.skipif(not sys_path_ok, reason='MC pre_processing 不可用')
    def test_render_four_projects(self, monkeypatch):
        ctx = build_pilot64_context()
        with tempfile.TemporaryDirectory() as tmp:
            monkeypatch.setattr(mc_config, 'WORKSPACE_DIR', tmp)
            rendered = render_pilot64_projects(tmp, ctx)
            # 四网都有输出
            assert '参数网' in rendered and len(rendered['参数网']) == 10  # 2 SPINE + 8 LEAF
            assert '存储网' in rendered and len(rendered['存储网']) == 3
            assert '业务&管理网' in rendered and len(rendered['业务&管理网']) == 6
            assert '带外网' in rendered and len(rendered['带外网']) == 3
            # 关键内容抽查
            roce = rendered['参数网']
            spn = next(v for k, v in roce.items() if 'P-Spine' in k)
            assert 'priority-flow-control no-drop dot1p 3' in spn
            biz = rendered['业务&管理网']
            bizagg = next(v for k, v in biz.items() if 'BIZ-AGG' in k)
            assert 'hwtacacs scheme tac_aidc' in bizagg
            oob = rendered['带外网']
            assert all('snmp-agent community read mc-aidc' in v for v in oob.values())
