"""意图参数适配器 —— AIDC 项目生成器测试（参数网 / 存储网）。"""
import os
import tempfile

import pandas as pd
import pytest

from intent.project_aidc import (
    generate_roce_project, generate_storage_project, build_storage_context,
)
from intent.roce_templates import build_roce_context

sys_path_ok = True
try:
    from pre_processing import PreProcessing
    import config as mc_config
except Exception:  # noqa: BLE001
    sys_path_ok = False


def _write_and_render(project_dir, workspace):
    """注册项目并渲染，返回渲染产物目录。"""
    project_name = os.path.basename(project_dir)
    pd.DataFrame({'项目名称': [project_name]}).to_excel(
        os.path.join(workspace, 'MC_Para.xlsx'), sheet_name='项目名称', index=False)
    pp = PreProcessing()
    pp.workspace = workspace
    pp.read_MC_para('MC_Para.xlsx')
    pp.execute_render('1', 'device_name')
    return os.path.join(workspace, project_name, 'output')


def _read_output(output_dir):
    """读取输出目录下的全部渲染文本。"""
    texts = []
    for time_dir in os.listdir(output_dir):
        batch = os.path.join(output_dir, time_dir)
        for entry in os.listdir(batch):
            role_dir = os.path.join(batch, entry)
            if not os.path.isdir(role_dir):
                continue  # 跳过 manifest.json 等批次内文件
            for f in os.listdir(role_dir):
                if f.endswith('.txt'):
                    with open(os.path.join(role_dir, f), encoding='utf-8') as fh:
                        texts.append(fh.read())
    return texts


class TestAidcProjectGen:
    def test_generate_roce_files(self):
        ctx = build_roce_context(spine_count=2, leaf_count=4)
        with tempfile.TemporaryDirectory() as tmp:
            project_dir = os.path.join(tmp, 'aidc_roce')
            generate_roce_project(project_dir, ctx, spine_count=2, leaf_count=4)
            assert os.path.exists(os.path.join(project_dir, 'excel', 'hostname.xlsx'))
            assert os.path.exists(os.path.join(project_dir, 'excel', 'parameter.xlsx'))
            assert os.path.exists(os.path.join(project_dir, 'excel', 'ipaddress.xlsx'))
            assert os.path.exists(os.path.join(project_dir, 'excel', 'connection.xlsx'))
            assert os.path.exists(os.path.join(project_dir, 'templates', 'SPINE.j2'))
            assert os.path.exists(os.path.join(project_dir, 'templates', 'LEAF.j2'))

    def test_generate_storage_files(self):
        ctx = build_storage_context(spine_count=1, leaf_count=2)
        with tempfile.TemporaryDirectory() as tmp:
            project_dir = os.path.join(tmp, 'aidc_storage')
            generate_storage_project(project_dir, ctx)
            assert os.path.exists(os.path.join(project_dir, 'templates', 'STO_SPINE.j2'))
            assert os.path.exists(os.path.join(project_dir, 'templates', 'STO_LEAF.j2'))

    def test_param_table_has_queue_tunables(self):
        ctx = build_roce_context(pfc_queue=3, cnp_queue=6)
        with tempfile.TemporaryDirectory() as tmp:
            project_dir = os.path.join(tmp, 'aidc_roce')
            generate_roce_project(project_dir, ctx, spine_count=2, leaf_count=4)
            df = pd.read_excel(os.path.join(project_dir, 'excel', 'parameter.xlsx'),
                               sheet_name='参数表', keep_default_na=False)
            mapping = dict(zip(df['全局参数名'], df['参数值']))
            assert str(mapping['PFC队列']) == '3'
            assert str(mapping['CNP队列']) == '6'
            assert str(mapping['PFCHeadroom']) == '80000'

    @pytest.mark.skipif(not sys_path_ok, reason='MC pre_processing 不可用')
    def test_mc_renders_roce_project(self, monkeypatch):
        ctx = build_roce_context(spine_count=2, leaf_count=4, pfc_queue=3, cnp_queue=6)
        with tempfile.TemporaryDirectory() as tmp:
            project_dir = os.path.join(tmp, 'aidc_roce')
            generate_roce_project(project_dir, ctx, spine_count=2, leaf_count=4)
            monkeypatch.setattr(mc_config, 'WORKSPACE_DIR', tmp)
            output_dir = _write_and_render(project_dir, tmp)
            texts = _read_output(output_dir)
            assert len(texts) >= 6  # 2 SPINE + 4 LEAF
            joined = '\n'.join(texts)
            # PFC/CNP 队列从参数表进入渲染（默认 3/6）
            assert 'priority-flow-control no-drop dot1p 3' in joined
            assert 'qos wfq cs6 group sp' in joined
            assert 'qos gts queue 6 cir 200000000 cbs 16000000' in joined
            assert 'priority-flow-control poolid 0 headroom 80000' in joined
            # sysname 渲染
            assert 'BJ01-R01-AIDC-H3C-P-Spine-01' in joined
            assert 'BJ01-R02-AIDC-H3C-P-Leaf-01' in joined
