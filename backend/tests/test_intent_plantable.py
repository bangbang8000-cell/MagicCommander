"""AL→MC 管道测试（plan:table 生成 / 转换 / 渲染）。"""
import os
import tempfile

import pandas as pd
import pytest

from intent.pilot64 import build_pilot64_context
from intent.planner.plantable import generate_plantable
from intent.planner.plantable_importer import plantable_to_context, plantable_to_project

sys_path_ok = True
try:
    from pre_processing import PreProcessing
    import config as mc_config
except Exception:  # noqa: BLE001
    sys_path_ok = False


class TestPlantable:
    def test_generate_plantable_structure(self):
        ctx = build_pilot64_context()
        plan = generate_plantable(ctx)
        assert plan['meta']['project'] == 'aidc_pilot64'
        assert plan['macro']['pfc_queue'] == 3
        assert plan['macro']['cnp_queue'] == 6
        # 设备清单：22 台
        total = sum(d['count'] for d in plan['deviceList'])
        assert total == 22
        # 接线/终端
        assert plan['connections']
        assert plan['terminals']
        # 角色覆盖
        roles = {d['role'] for d in plan['deviceList']}
        assert roles == {'SPINE', 'LEAF', 'STO_SPINE', 'STO_LEAF',
                         'BIZ_AGG', 'BIZ_ACCESS', 'OOB_AGG', 'OOB_ACCESS'}

    def test_plantable_to_context_tunables(self):
        ctx = build_pilot64_context()
        plan = generate_plantable(ctx)
        plan['macro']['pfc_queue'] = 5
        plan['macro']['cnp_queue'] = 7
        ctx2 = plantable_to_context(plan)
        assert ctx2.globals['pfc_queue'] == 5
        assert ctx2.globals['cnp_queue'] == 7

    def test_plantable_to_project(self):
        ctx = build_pilot64_context()
        plan = generate_plantable(ctx)
        with tempfile.TemporaryDirectory() as tmp:
            project = os.path.join(tmp, 'aidc_pilot64')
            plantable_to_project(plan, project)
            assert os.path.exists(os.path.join(project, 'para.xlsx'))
            assert os.path.exists(os.path.join(project, 'excel', 'hostname.xlsx'))

    @pytest.mark.skipif(not sys_path_ok, reason='MC pre_processing 不可用')
    def test_end_to_end_plan_render(self, monkeypatch):
        ctx = build_pilot64_context()
        plan = generate_plantable(ctx)
        with tempfile.TemporaryDirectory() as tmp:
            project = os.path.join(tmp, 'aidc_pilot64')
            plantable_to_project(plan, project)
            pd.DataFrame({'项目名称': ['aidc_pilot64']}).to_excel(
                os.path.join(tmp, 'MC_Para.xlsx'), sheet_name='项目名称', index=False)
            monkeypatch.setattr(mc_config, 'WORKSPACE_DIR', tmp)
            pp = PreProcessing()
            pp.workspace = tmp
            pp.read_MC_para('MC_Para.xlsx')
            pp.execute_render('1', 'device_name')
            out = os.path.join(tmp, 'aidc_pilot64', 'output')
            td = os.listdir(out)[0]
            total = sum(
                len([f for f in os.listdir(os.path.join(out, td, r)) if f.endswith('.txt')])
                for r in os.listdir(os.path.join(out, td)))
            assert total == 22
