"""渲染集成端到端测试"""
import os
import sys
import tempfile
import shutil

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

import pandas as pd
import config
from pre_processing import PreProcessing


def _build_minimal_project(workspace: str, project_name: str):
    """构造最小可渲染项目"""
    project_dir = os.path.join(workspace, project_name)
    excel_dir = os.path.join(project_dir, 'excel')
    templates_dir = os.path.join(project_dir, 'templates')
    os.makedirs(excel_dir, exist_ok=True)
    os.makedirs(templates_dir, exist_ok=True)

    pd.DataFrame({
        '工作簿名称': ['hostname.xlsx'],
        '工作表名称': ['主机表'],
        '工作表类型': ['赋值表'],
        '对称列数': [0],
        'key列数': [1],
    }).to_excel(
        os.path.join(project_dir, 'para.xlsx'),
        sheet_name='project_para',
        index=False,
    )

    pd.DataFrame({
        '设备名': ['SW-01'],
        '型号': ['H3C S5560X'],
        '角色': ['ASW'],
        '管理IP': ['192.168.1.1'],
        'SN': ['SN-001'],
    }).to_excel(
        os.path.join(excel_dir, 'hostname.xlsx'),
        sheet_name='主机表',
        index=False,
    )

    template = 'hostname {{ info["设备名"] }}\nip {{ info["管理IP"] }}\n'
    with open(os.path.join(templates_dir, 'ASW.j2'), 'w', encoding='utf-8') as f:
        f.write(template)

    pd.DataFrame({'项目名称': [project_name]}).to_excel(
        os.path.join(workspace, 'MC_Para.xlsx'),
        sheet_name='项目名称',
        index=False,
    )


class TestRenderIntegration:
    """测试完整渲染流程"""

    def test_render_project_creates_output(self, monkeypatch):
        with tempfile.TemporaryDirectory() as tmpdir:
            monkeypatch.setattr(config, 'WORKSPACE_DIR', tmpdir)

            project_name = 'render_test'
            _build_minimal_project(tmpdir, project_name)

            pp = PreProcessing()
            pp.workspace = tmpdir
            pp.read_MC_para('MC_Para.xlsx')

            assert project_name in pp.project_name

            pp.execute_render('1', 'device_name')

            output_dir = os.path.join(tmpdir, project_name, 'output')
            assert os.path.isdir(output_dir)

            time_dirs = os.listdir(output_dir)
            assert len(time_dirs) >= 1

            asw_dir = os.path.join(output_dir, time_dirs[0], 'ASW')
            assert os.path.isdir(asw_dir)

            txt_files = [f for f in os.listdir(asw_dir) if f.endswith('.txt')]
            assert len(txt_files) >= 1

    def test_render_output_content(self, monkeypatch):
        with tempfile.TemporaryDirectory() as tmpdir:
            monkeypatch.setattr(config, 'WORKSPACE_DIR', tmpdir)

            project_name = 'render_test2'
            _build_minimal_project(tmpdir, project_name)

            pp = PreProcessing()
            pp.workspace = tmpdir
            pp.read_MC_para('MC_Para.xlsx')

            pp.execute_render('1', 'device_name')

            output_dir = os.path.join(tmpdir, project_name, 'output')
            time_dirs = os.listdir(output_dir)
            asw_dir = os.path.join(output_dir, time_dirs[0], 'ASW')
            txt_files = [f for f in os.listdir(asw_dir) if f.endswith('.txt')]

            with open(os.path.join(asw_dir, txt_files[0]), 'r', encoding='utf-8') as f:
                content = f.read()

            assert 'hostname SW-01' in content
            assert 'ip 192.168.1.1' in content

    def test_render_creates_yaml(self, monkeypatch):
        with tempfile.TemporaryDirectory() as tmpdir:
            monkeypatch.setattr(config, 'WORKSPACE_DIR', tmpdir)

            project_name = 'render_test3'
            _build_minimal_project(tmpdir, project_name)

            pp = PreProcessing()
            pp.workspace = tmpdir
            pp.read_MC_para('MC_Para.xlsx')

            pp.execute_render('1', 'device_name')

            yaml_dir = os.path.join(tmpdir, project_name, 'yaml')
            assert os.path.isdir(yaml_dir)

            time_dirs = os.listdir(yaml_dir)
            assert len(time_dirs) >= 1

            asw_yaml_dir = os.path.join(yaml_dir, time_dirs[0], 'ASW')
            assert os.path.isdir(asw_yaml_dir)

            yaml_files = [f for f in os.listdir(asw_yaml_dir) if f.endswith('.yaml')]
            assert len(yaml_files) >= 1

    def test_render_sn_mode(self, monkeypatch):
        with tempfile.TemporaryDirectory() as tmpdir:
            monkeypatch.setattr(config, 'WORKSPACE_DIR', tmpdir)

            project_name = 'render_sn_test'
            _build_minimal_project(tmpdir, project_name)

            pp = PreProcessing()
            pp.workspace = tmpdir
            pp.read_MC_para('MC_Para.xlsx')

            pp.execute_render('1', 'device_sn')

            output_dir = os.path.join(tmpdir, project_name, 'output-sn')
            assert os.path.isdir(output_dir)

            time_dirs = os.listdir(output_dir)
            asw_dir = os.path.join(output_dir, time_dirs[0], 'ASW')
            cfg_files = [f for f in os.listdir(asw_dir) if f.endswith('.cfg')]
            assert len(cfg_files) >= 1
            assert cfg_files[0].startswith('conf_')

    def test_render_yaml_only(self, monkeypatch):
        with tempfile.TemporaryDirectory() as tmpdir:
            monkeypatch.setattr(config, 'WORKSPACE_DIR', tmpdir)

            project_name = 'render_yaml_test'
            _build_minimal_project(tmpdir, project_name)

            pp = PreProcessing()
            pp.workspace = tmpdir
            pp.read_MC_para('MC_Para.xlsx')

            pp.execute_yaml('1')

            yaml_dir = os.path.join(tmpdir, project_name, 'yaml')
            assert os.path.isdir(yaml_dir)

            time_dirs = os.listdir(yaml_dir)
            asw_yaml_dir = os.path.join(yaml_dir, time_dirs[0], 'ASW')
            yaml_files = [f for f in os.listdir(asw_yaml_dir) if f.endswith('.yaml')]
            assert len(yaml_files) >= 1

    def test_render_multiple_devices(self, monkeypatch):
        with tempfile.TemporaryDirectory() as tmpdir:
            monkeypatch.setattr(config, 'WORKSPACE_DIR', tmpdir)

            project_name = 'multi_dev_test'
            project_dir = os.path.join(tmpdir, project_name)
            excel_dir = os.path.join(project_dir, 'excel')
            templates_dir = os.path.join(project_dir, 'templates')
            os.makedirs(excel_dir, exist_ok=True)
            os.makedirs(templates_dir, exist_ok=True)

            pd.DataFrame({
                '工作簿名称': ['hostname.xlsx'],
                '工作表名称': ['主机表'],
                '工作表类型': ['赋值表'],
                '对称列数': [0],
                'key列数': [1],
            }).to_excel(
                os.path.join(project_dir, 'para.xlsx'),
                sheet_name='project_para',
                index=False,
            )

            pd.DataFrame({
                '设备名': ['SW-01', 'SW-02'],
                '型号': ['H3C S5560X', 'H3C S5560X'],
                '角色': ['ASW', 'ASW'],
                '管理IP': ['192.168.1.1', '192.168.1.2'],
                'SN': ['SN-001', 'SN-002'],
            }).to_excel(
                os.path.join(excel_dir, 'hostname.xlsx'),
                sheet_name='主机表',
                index=False,
            )

            template = 'hostname {{ info["设备名"] }}\n'
            with open(os.path.join(templates_dir, 'ASW.j2'), 'w', encoding='utf-8') as f:
                f.write(template)

            pd.DataFrame({'项目名称': [project_name]}).to_excel(
                os.path.join(tmpdir, 'MC_Para.xlsx'),
                sheet_name='项目名称',
                index=False,
            )

            pp = PreProcessing()
            pp.workspace = tmpdir
            pp.read_MC_para('MC_Para.xlsx')

            pp.execute_render('1', 'device_name')

            output_dir = os.path.join(tmpdir, project_name, 'output')
            time_dirs = os.listdir(output_dir)
            asw_dir = os.path.join(output_dir, time_dirs[0], 'ASW')
            txt_files = sorted([f for f in os.listdir(asw_dir) if f.endswith('.txt')])
            assert len(txt_files) == 2

    def test_render_backup_created(self, monkeypatch):
        with tempfile.TemporaryDirectory() as tmpdir:
            monkeypatch.setattr(config, 'WORKSPACE_DIR', tmpdir)

            project_name = 'backup_test'
            _build_minimal_project(tmpdir, project_name)

            pp = PreProcessing()
            pp.workspace = tmpdir
            pp.read_MC_para('MC_Para.xlsx')

            pp.execute_render('1', 'device_name')

            pp.execute_render('1', 'device_name')

            backup_dir = os.path.join(tmpdir, project_name, '.output_backups')
            assert os.path.isdir(backup_dir)
            backups = os.listdir(backup_dir)
            assert len(backups) >= 1

    def test_render_undo_restores_backup(self, monkeypatch):
        with tempfile.TemporaryDirectory() as tmpdir:
            monkeypatch.setattr(config, 'WORKSPACE_DIR', tmpdir)

            project_name = 'undo_test'
            _build_minimal_project(tmpdir, project_name)

            pp = PreProcessing()
            pp.workspace = tmpdir
            pp.read_MC_para('MC_Para.xlsx')

            pp.execute_render('1', 'device_name')

            output_dir = os.path.join(tmpdir, project_name, 'output')
            time_dirs_before = os.listdir(output_dir)

            pp.execute_render('1', 'device_name')

            time_dirs_after = os.listdir(output_dir)
            assert len(time_dirs_after) >= len(time_dirs_before)

            restored = pp._restore_backup(os.path.join(tmpdir, project_name))
            assert restored is True