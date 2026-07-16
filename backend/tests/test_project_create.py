"""项目创建端到端测试"""
import os
import sys
import tempfile
import shutil

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from pre_processing import PreProcessing


class TestProjectCreateEmpty:
    """测试空白项目创建"""

    def test_create_empty_project(self):
        with tempfile.TemporaryDirectory() as tmpdir:
            pp = PreProcessing()
            pp.workspace = tmpdir

            project_name = 'empty_test_project'
            project_dir = os.path.join(tmpdir, project_name)

            pp.execute_create('project', project_name, empty=True)

            assert os.path.isdir(project_dir)
            assert not os.path.exists(os.path.join(project_dir, 'para.xlsx'))
            assert not os.path.exists(os.path.join(project_dir, 'excel'))
            assert not os.path.exists(os.path.join(project_dir, 'templates'))

            mc_para_path = os.path.join(tmpdir, 'MC_Para.xlsx')
            assert os.path.exists(mc_para_path)

            import pandas as pd
            df = pd.read_excel(mc_para_path)
            assert project_name in df['项目名称'].astype(str).tolist()

    def test_create_empty_project_registers_in_mc_para(self):
        with tempfile.TemporaryDirectory() as tmpdir:
            pp = PreProcessing()
            pp.workspace = tmpdir

            pp.execute_create('project', 'reg_test_project', empty=True)

            mc_para_path = os.path.join(tmpdir, 'MC_Para.xlsx')
            import pandas as pd
            df = pd.read_excel(mc_para_path)
            assert 'reg_test_project' in df['项目名称'].astype(str).tolist()
            assert len(df) == 1

    def test_create_empty_project_no_demo_files(self):
        with tempfile.TemporaryDirectory() as tmpdir:
            pp = PreProcessing()
            pp.workspace = tmpdir

            pp.execute_create('project', 'bare_project', empty=True)

            project_dir = os.path.join(tmpdir, 'bare_project')
            entries = os.listdir(project_dir)
            assert entries == []


class TestProjectCreateDemo:
    """测试带示例文件的默认项目创建"""

    def test_create_demo_project_has_excel(self):
        with tempfile.TemporaryDirectory() as tmpdir:
            pp = PreProcessing()
            pp.workspace = tmpdir

            pp.execute_create('project', 'demo_project', empty=False)

            project_dir = os.path.join(tmpdir, 'demo_project')
            assert os.path.isdir(os.path.join(project_dir, 'excel'))
            assert os.path.isdir(os.path.join(project_dir, 'templates'))

    def test_create_demo_project_has_para_xlsx(self):
        with tempfile.TemporaryDirectory() as tmpdir:
            pp = PreProcessing()
            pp.workspace = tmpdir

            pp.execute_create('project', 'demo_project2', empty=False)

            para_path = os.path.join(tmpdir, 'demo_project2', 'para.xlsx')
            assert os.path.exists(para_path)

    def test_create_demo_project_has_templates(self):
        with tempfile.TemporaryDirectory() as tmpdir:
            pp = PreProcessing()
            pp.workspace = tmpdir

            pp.execute_create('project', 'demo_project3', empty=False)

            templates_dir = os.path.join(tmpdir, 'demo_project3', 'templates')
            assert os.path.isdir(templates_dir)
            assert os.path.exists(os.path.join(templates_dir, 'ASW.j2'))


class TestProjectCreateFromTemplate:
    """测试从模板创建项目"""

    def test_create_from_template_example1(self):
        with tempfile.TemporaryDirectory() as tmpdir:
            pp = PreProcessing()
            pp.workspace = tmpdir

            pp.execute_create_from_template('template_project', 'example1')

            project_dir = os.path.join(tmpdir, 'template_project')
            assert os.path.isdir(project_dir)
            assert os.path.isdir(os.path.join(project_dir, 'excel'))
            assert os.path.isdir(os.path.join(project_dir, 'templates'))
            assert os.path.exists(os.path.join(project_dir, 'para.xlsx'))

    def test_create_from_template_example2(self):
        with tempfile.TemporaryDirectory() as tmpdir:
            pp = PreProcessing()
            pp.workspace = tmpdir

            pp.execute_create_from_template('template_project2', 'example2')

            project_dir = os.path.join(tmpdir, 'template_project2')
            assert os.path.isdir(project_dir)
            assert os.path.exists(os.path.join(project_dir, 'para.xlsx'))

    def test_create_from_template_registers_in_mc_para(self):
        with tempfile.TemporaryDirectory() as tmpdir:
            pp = PreProcessing()
            pp.workspace = tmpdir

            pp.execute_create_from_template('reg_template', 'example1')

            mc_para_path = os.path.join(tmpdir, 'MC_Para.xlsx')
            import pandas as pd
            df = pd.read_excel(mc_para_path)
            assert 'reg_template' in df['项目名称'].astype(str).tolist()

    def test_create_from_template_duplicate_raises(self):
        with tempfile.TemporaryDirectory() as tmpdir:
            pp = PreProcessing()
            pp.workspace = tmpdir

            pp.execute_create_from_template('dup_project', 'example1')

            import pytest
            with pytest.raises(FileExistsError, match='已存在'):
                pp.execute_create_from_template('dup_project', 'example1')

    def test_create_from_template_nonexistent_raises(self):
        with tempfile.TemporaryDirectory() as tmpdir:
            pp = PreProcessing()
            pp.workspace = tmpdir

            import pytest
            with pytest.raises(FileNotFoundError, match='不存在'):
                pp.execute_create_from_template('bad_project', 'nonexistent_template')