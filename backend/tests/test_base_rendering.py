"""Rendering integration tests for MagicCommander Base class."""
import os, sys
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

import pytest
import tempfile
import numpy as np
from base import Base, json_safe_val, remove_empty_pair, deep_dict


class TestDeepDict:
    def test_single_key_list(self):
        """测试使用列表 key 的 deep_dict"""
        a_dict = {}
        deep_dict(a_dict, ['hostname', ['name', 'ip']], ['SW-01', '192.168.1.1'])
        assert a_dict['hostname']['name'] == 'SW-01'
        assert a_dict['hostname']['ip'] == '192.168.1.1'

    def test_numpy_conversion(self):
        """测试 numpy 类型自动转换"""
        a_dict = {}
        deep_dict(a_dict, ['count', ['val']], [np.int64(42)])
        assert a_dict['count']['val'] == 42
        assert isinstance(a_dict['count']['val'], int)


class TestBaseRendering:
    def test_device_data_structure(self):
        """测试设备数据字典结构"""
        base = Base()
        base.devices = {
            'SW-01': {
                'hostname': 'SW-01',
                'mgmt_ip': '192.168.1.1',
                'role': 'ASW',
                'vlans': ['10', '20', '30'],
            }
        }
        assert 'SW-01' in base.devices
        assert base.devices['SW-01']['hostname'] == 'SW-01'
        assert base.devices['SW-01']['role'] == 'ASW'

    def test_roles_collection(self):
        """测试角色列表收集"""
        base = Base()
        base.devices = {
            'SW-01': {'hostname': 'SW-01', 'role': 'ASW'},
            'SW-02': {'hostname': 'SW-02', 'role': 'ASW'},
            'CORE-01': {'hostname': 'CORE-01', 'role': 'CORE'},
        }
        roles = set()
        for dev in base.devices.values():
            roles.add(dev.get('role', ''))
        assert roles == {'ASW', 'CORE'}

    def test_json_safe_val_int(self):
        """测试 json_safe_val 正常值"""
        assert json_safe_val(42) == 42
        assert json_safe_val("hello") == "hello"

    def test_json_safe_val_numpy(self):
        """测试 json_safe_val numpy 转换"""
        result = json_safe_val(np.int64(42))
        assert result == 42
        assert isinstance(result, int)

    def test_json_safe_val_list_numpy(self):
        """测试 json_safe_val 列表中的 numpy"""
        result = json_safe_val([np.int64(1), np.int64(2), "str"])
        assert result == [1, 2, "str"]

    def test_remove_empty_pair_with_zero(self):
        """测试 remove_empty_pair 0 值处理"""
        d = {'a': 0, 'b': '', 'c': 1}
        remove_empty_pair(d)
        assert 'c' in d


class TestPreProcessingBackup:
    """测试渲染备份功能"""
    
    def test_backup_and_restore(self):
        """测试备份和恢复流程"""
        from pre_processing import PreProcessing
        import tempfile, os
        
        with tempfile.TemporaryDirectory() as tmpdir:
            # 创建测试项目结构
            project_dir = os.path.join(tmpdir, 'test_project')
            output_dir = os.path.join(project_dir, 'output')
            os.makedirs(output_dir)
            
            # 写入测试输出文件
            with open(os.path.join(output_dir, 'config.txt'), 'w') as f:
                f.write('hostname TEST-01\n')
            
            pp = PreProcessing()
            pp.target_project_name = []
            pp.target_project_num = []
            pp.project_name = ['test_project']
            pp.project_para = []
            # 临时覆盖 workspace 路径
            pp.workspace = tmpdir
            
            # 测试备份
            backup_path = pp._backup_output(project_dir)
            assert backup_path is not None
            assert os.path.exists(backup_path)
            
            # 修改原始 output
            with open(os.path.join(output_dir, 'config.txt'), 'w') as f:
                f.write('hostname CHANGED\n')
            
            # 恢复备份
            restored = pp._restore_backup(project_dir)
            assert restored is True
            
            # 验证恢复
            with open(os.path.join(output_dir, 'config.txt')) as f:
                content = f.read()
            assert 'TEST-01' in content

    def test_no_backup_for_empty_output(self):
        """测试空 output 目录不备份"""
        from pre_processing import PreProcessing
        import tempfile, os
        
        with tempfile.TemporaryDirectory() as tmpdir:
            project_dir = os.path.join(tmpdir, 'test_project')
            os.makedirs(os.path.join(project_dir, 'output'))  # 空目录
            
            pp = PreProcessing()
            pp.workspace = tmpdir
            
            backup_path = pp._backup_output(project_dir)
            assert backup_path is None


class TestCacheMechanism:
    """测试渲染缓存"""
    
    def test_cache_key_deterministic(self):
        """测试缓存键的确定性"""
        from pre_processing import PreProcessing
        import tempfile, os
        
        with tempfile.TemporaryDirectory() as tmpdir:
            project_dir = os.path.join(tmpdir, 'test_project')
            os.makedirs(os.path.join(project_dir, 'excel'))
            os.makedirs(os.path.join(project_dir, 'templates'))
            
            # 创建测试文件
            with open(os.path.join(project_dir, 'para.xlsx'), 'wb') as f:
                f.write(b'test data')
            with open(os.path.join(project_dir, 'excel', 'sheet1.xlsx'), 'wb') as f:
                f.write(b'sheet data')
            with open(os.path.join(project_dir, 'templates', 'test.j2'), 'w') as f:
                f.write('hostname {{ info["hostname"] }}')
            
            pp = PreProcessing()
            pp.workspace = tmpdir
            
            key1 = pp._compute_cache_key(project_dir, 'sheet1')
            key2 = pp._compute_cache_key(project_dir, 'sheet1')
            
            assert key1 == key2  # 相同输入应该产生相同 key
            assert isinstance(key1, str)
            assert len(key1) == 16  # hash hexdigest[:16]

    def test_cache_key_different_sheets(self):
        """测试不同 sheet 产生不同缓存键"""
        from pre_processing import PreProcessing
        import tempfile, os
        
        with tempfile.TemporaryDirectory() as tmpdir:
            project_dir = os.path.join(tmpdir, 'test_project')
            os.makedirs(os.path.join(project_dir, 'excel'))
            os.makedirs(os.path.join(project_dir, 'templates'))
            
            with open(os.path.join(project_dir, 'para.xlsx'), 'wb') as f:
                f.write(b'test data')
            with open(os.path.join(project_dir, 'excel', 'sheet1.xlsx'), 'wb') as f:
                f.write(b'data1')
            with open(os.path.join(project_dir, 'excel', 'sheet2.xlsx'), 'wb') as f:
                f.write(b'data2')
            
            pp = PreProcessing()
            pp.workspace = tmpdir
            
            key1 = pp._compute_cache_key(project_dir, 'sheet1')
            key2 = pp._compute_cache_key(project_dir, 'sheet2')
            
            assert key1 != key2  # 不同输入应该产生不同 key