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
            with pd.ExcelFile(os.path.join(project, 'excel', 'connection.xlsx')) as conn:
                assert {'终端连接表', 'VLAN网关表'} <= set(conn.sheet_names)
            with pd.ExcelFile(os.path.join(project, 'excel', 'ipaddress.xlsx')) as ip:
                assert {'IP规划地址表', '环回地址表', '网段规划表'} <= set(ip.sheet_names)

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
            for role_dir in os.listdir(os.path.join(out, time_dirs[0])):
                for f in os.listdir(os.path.join(out, time_dirs[0], role_dir)):
                    if f.endswith('.txt'):
                        total_txt += 1
                        with open(os.path.join(out, time_dirs[0], role_dir, f), encoding='utf-8') as fh:
                            joined += fh.read()
            assert total_txt == 22
            # 抽查：EBGP/MLAG/PFC
            assert 'router bgp' in joined
            assert 'priority-flow-control no-drop dot1p 3' in joined
            assert 'mlag system-mac' in joined
            assert 'port s-mlag group' in joined
            assert 'port link-type trunk' in joined
            assert 'description GPU-' in joined
