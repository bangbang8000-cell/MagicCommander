"""AIDC 单项目四表格生成器测试。"""
import os
import tempfile

import pandas as pd
import pytest

from intent.pilot64 import build_pilot64_context
from intent.project_single import generate_single_pilot64_project, SingleProjectGenerator

sys_path_ok = True
try:
    from pre_processing import PreProcessing
    import config as mc_config
except Exception:  # noqa: BLE001
    sys_path_ok = False


class TestSingleProject:
    def test_generate_four_workbooks(self):
        ctx = build_pilot64_context()
        with tempfile.TemporaryDirectory() as tmp:
            project = os.path.join(tmp, 'aidc_pilot64')
            generate_single_pilot64_project(project, ctx)
            assert os.path.exists(os.path.join(project, 'para.xlsx'))
            assert os.path.exists(os.path.join(project, 'excel', 'hostname.xlsx'))
            assert os.path.exists(os.path.join(project, 'excel', 'connection.xlsx'))
            assert os.path.exists(os.path.join(project, 'excel', 'ipaddress.xlsx'))
            assert os.path.exists(os.path.join(project, 'excel', 'parameter.xlsx'))

    def test_device_table_22(self):
        ctx = build_pilot64_context()
        gen = SingleProjectGenerator(ctx)
        df = gen.build_device_table()
        assert len(df) == 22
        assert set(df['角色']) == {'SPINE', 'LEAF', 'STO_SPINE', 'STO_LEAF',
                                   'BIZ_AGG', 'BIZ_ACCESS', 'OOB_AGG', 'OOB_ACCESS'}

    def test_multi_sheet_workbooks(self):
        ctx = build_pilot64_context()
        with tempfile.TemporaryDirectory() as tmp:
            project = os.path.join(tmp, 'aidc_pilot64')
            generate_single_pilot64_project(project, ctx)
            # H2：四网拆 sheet
            with pd.ExcelFile(os.path.join(project, 'excel', 'hostname.xlsx')) as h:
                assert {'设备表-参数网', '设备表-存储网', '设备表-业务网', '设备表-带外网'} <= set(h.sheet_names)
            with pd.ExcelFile(os.path.join(project, 'excel', 'connection.xlsx')) as conn:
                assert {'终端连接表-参数网', '终端连接表-存储网', '终端连接表-业务网', '终端连接表-带外网',
                        'VLAN网关表-参数网', 'VLAN网关表-存储网', 'VLAN网关表-业务网'} <= set(conn.sheet_names)
            with pd.ExcelFile(os.path.join(project, 'excel', 'ipaddress.xlsx')) as ip:
                assert {'IP规划地址表-参数网', 'IP规划地址表-存储网', 'IP规划地址表-业务网', 'IP规划地址表-带外网',
                        '环回地址表', '网段规划表'} <= set(ip.sheet_names)

class TestH2TableStructure:
    """H2（MC-1~5）：四网拆 sheet + 每接口/VLAN 一行 + 去对端AS + 对称表含对端AS。"""

    def test_device_table_no_peer_as(self):
        ctx = build_pilot64_context()
        gen = SingleProjectGenerator(ctx)
        for plane in ('参数网', '存储网', '业务网', '带外网'):
            df = gen.build_device_table(plane)
            assert '对端AS' not in df.columns, f'{plane} 设备表不应含对端AS'

    def test_terminal_long_format(self):
        ctx = build_pilot64_context()
        gen = SingleProjectGenerator(ctx)
        df = gen.build_terminal_table('参数网')
        assert len(df) == 512  # 8 Leaf × 64 GPU 口
        assert not df['己端接口'].astype(str).str.contains(',').any()  # 每接口一行
        assert not df['己端VLAN'].astype(str).str.contains(',').any()

    def test_vlan_gw_long_format(self):
        ctx = build_pilot64_context()
        gen = SingleProjectGenerator(ctx)
        df = gen.build_vlan_gw_table('参数网')
        assert len(df) == 16  # 8 Leaf × 2 VLAN
        assert not df['网关VLAN'].astype(str).str.contains(',').any()  # 每 VLAN 一行

    def test_conn_table_has_peer_as(self):
        ctx = build_pilot64_context()
        gen = SingleProjectGenerator(ctx)
        df = gen.build_conn_table('参数网')
        assert '对端AS' in df.columns and '己端AS' in df.columns
        assert len(df) == 256  # 8 Leaf × 32 上联
        # 对端 AS = Spine AS（65111/65112）
        assert df['对端AS'].iloc[0] in (65111, 65112)


    @pytest.mark.skipif(not sys_path_ok, reason='MC pre_processing 不可用')
    def test_mc_renders_single_project(self, monkeypatch):
        ctx = build_pilot64_context()
        with tempfile.TemporaryDirectory() as tmp:
            project = os.path.join(tmp, 'aidc_pilot64')
            generate_single_pilot64_project(project, ctx)
            pd.DataFrame({'项目名称': ['aidc_pilot64']}).to_excel(
                os.path.join(tmp, 'MC_Para.xlsx'), sheet_name='项目名称', index=False)
            monkeypatch.setattr(mc_config, 'WORKSPACE_DIR', tmp)
            pp = PreProcessing()
            pp.workspace = tmp
            pp.read_MC_para('MC_Para.xlsx')
            pp.execute_render('1', 'device_name')
            # 一个项目渲染全部 22 台
            out = os.path.join(tmp, 'aidc_pilot64', 'output')
            time_dirs = os.listdir(out)
            assert len(time_dirs) >= 1
            total_txt = 0
            joined = ''
            batch = os.path.join(out, time_dirs[0])
            for entry in os.listdir(batch):
                role_dir = os.path.join(batch, entry)
                if not os.path.isdir(role_dir):
                    continue  # 跳过 manifest.json 等批次内文件
                for f in os.listdir(role_dir):
                    if f.endswith('.txt'):
                        total_txt += 1
                        with open(os.path.join(role_dir, f), encoding='utf-8') as fh:
                            joined += fh.read()
            assert total_txt == 22
            # 抽查：EBGP/MLAG/PFC
            assert 'router bgp' in joined
            assert 'priority-flow-control no-drop dot1p 3' in joined
            assert 'mlag system-mac' in joined
            assert 'port s-mlag group' in joined
            assert 'port link-type trunk' in joined
            assert 'description GPU-' in joined

class TestRenderSplit:
    """V5.3.0-640-m（W4.1 / FR-M1）：渲染按协议分流——IB 跳过 fabric j2，RoCE 全部产出。"""

    def test_ib_skips_fabric_j2(self):
        ctx = build_pilot64_context()
        ctx.globals['fabric'] = 'ib'
        with tempfile.TemporaryDirectory() as tmp:
            project = os.path.join(tmp, 'aidc_pilot64')
            generate_single_pilot64_project(project, ctx)
            templates = os.path.join(project, 'templates')
            for role in ('SPINE', 'LEAF', 'STO_SPINE', 'STO_LEAF'):
                assert not os.path.exists(os.path.join(templates, f'{role}.j2')), f'{role}.j2 不应产出（IB）'
            for role in ('BIZ_AGG', 'BIZ_ACCESS', 'OOB_AGG', 'OOB_ACCESS'):
                assert os.path.exists(os.path.join(templates, f'{role}.j2')), f'{role}.j2 应产出（非 fabric）'
            # 清单/连接表仍出
            assert os.path.exists(os.path.join(project, 'excel', 'hostname.xlsx'))
            assert os.path.exists(os.path.join(project, 'excel', 'connection.xlsx'))
            # meta 标注渲染分流（对外可见行为变化，Release Notes 知会 O-7）
            import json
            with open(os.path.join(project, 'template.meta.json'), encoding='utf-8') as mf:
                meta = json.load(mf)
            assert meta['fabric'] == 'ib'
            assert meta['renderSplit']['skippedFabricRoles'] == ['LEAF', 'SPINE', 'STO_LEAF', 'STO_SPINE']

    def test_roce_produces_all_j2(self):
        ctx = build_pilot64_context()
        ctx.globals['fabric'] = 'roce'
        with tempfile.TemporaryDirectory() as tmp:
            project = os.path.join(tmp, 'aidc_pilot64')
            generate_single_pilot64_project(project, ctx)
            templates = os.path.join(project, 'templates')
            for role in ('SPINE', 'LEAF', 'STO_SPINE', 'STO_LEAF', 'BIZ_AGG', 'BIZ_ACCESS', 'OOB_AGG', 'OOB_ACCESS'):
                assert os.path.exists(os.path.join(templates, f'{role}.j2')), f'{role}.j2 应产出（RoCE）'

    def test_fabric_default_roce(self):
        ctx = build_pilot64_context()
        assert 'fabric' not in ctx.globals
        assert ctx.globals.get('fabric', 'roce') == 'roce'
class TestSonicTemplates:
    """V5.3.0-640-m（W4.2 / FR-M2）：SONiC/UXOS 命令族基准（X400 RoCE 渲染产物）。"""

    def test_sonic_five_families_present(self):
        from intent import sonic_templates as st
        assert 'PFC' in st._UPLINK_BLOCK or 'pfc' in st._UPLINK_BLOCK
        assert 'ecn' in st._UPLINK_BLOCK or 'ECN' in st._UPLINK_BLOCK
        assert 'l2vpn evpn' in st._BGP_BLOCK
        assert 'maximum-paths' in st._BGP_BLOCK
        assert 'headroom' in st._HEAD_TEMPLATE
        assert 'Ethernet' in st._UPLINK_BLOCK or 'gpu_port' in st._GPU_DOWNLINK_BLOCK

    def test_sonic_spine_leaf_built(self):
        from intent import sonic_templates as st
        assert 'X400' in st.SPINE_TEMPLATE
        assert 'breakout 1:2' in st.LEAF_TEMPLATE
        assert '待现网校准' in st.SPINE_TEMPLATE + st.LEAF_TEMPLATE + st._HEAD_TEMPLATE