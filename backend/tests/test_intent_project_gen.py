"""意图参数适配器 —— MC 项目生成器测试。"""
import os
import tempfile

import pandas as pd
import pytest

from intent.resolver import IntentContext
from intent.project_gen import McProjectGenerator, generate_oob_project

sys_path_ok = True
try:
    from pre_processing import PreProcessing
except Exception:  # noqa: BLE001
    sys_path_ok = False


def _ctx():
    ctx = IntentContext()
    ctx.scenario = 'MA'
    ctx.globals = {
        'para_para_C_AAA1': '10.10.10.10',
        'para_para_C_AAA2': '10.10.10.11',
        'para_para_C_AAA-PASSWORD': 'Aa@12345',
        'para_para_C_TACACS-NAME': 'tac_ma',
        'para_para_C_TACACS-DOMAIN': 'bj01.corp',
        'para_para_C_LOCAL-USER': 'admin',
        'para_para_C_LOCAL-PASSWORD': 'Aa@12345',
        'para_para_C_NTP': '10.200.0.1,10.200.0.2',
        'para_para_C_COMMUNITY': 'mc-public',
        'para_para_C_NMS-TGW-VIP': '10.10.10.100',
        'ipv4_M-ILO_P_MA1-MA2-VIP': '10.1.64.126/26',
    }
    ctx.device_params = {
        'MA': {
            1: {'hostname_hostname_B_MA1': 'BJ01-R01-AIDC-H3C-MA-01',
                'ipv4_LoopBack_P_MA1': '10.1.0.1/32',
                'ipv4_M-ILO_P_MA1': '10.1.64.1/26'},
            2: {'hostname_hostname_B_MA2': 'BJ01-R01-AIDC-H3C-MA-02',
                'ipv4_LoopBack_P_MA2': '10.1.0.2/32',
                'ipv4_M-ILO_P_MA2': '10.1.64.2/26'},
        }
    }
    ctx.lists = {
        'MA_conn_MGMT_F+C_MA1': ['GigabitEthernet1/0/47'],
        'MA_conn_MGMT_F+C_MA2': ['GigabitEthernet1/0/47'],
    }
    ctx.peer_map = {'MA': {1: 2, 2: 1}}
    return ctx


class TestProjectGen:
    def test_generate_project_files(self):
        ctx = _ctx()
        with tempfile.TemporaryDirectory() as tmp:
            gen = McProjectGenerator(ctx, 'MA', {1: 'OOB_ACCESS', 2: 'OOB_ACCESS'})
            gen.write(tmp)

            assert os.path.exists(os.path.join(tmp, 'excel', 'hostname.xlsx'))
            assert os.path.exists(os.path.join(tmp, 'excel', 'parameter.xlsx'))
            assert os.path.exists(os.path.join(tmp, 'excel', 'connection.xlsx'))
            assert os.path.exists(os.path.join(tmp, 'para.xlsx'))
            assert os.path.exists(os.path.join(tmp, 'templates', 'OOB_ACCESS.j2'))
            assert os.path.exists(os.path.join(tmp, 'template.meta.json'))

    def test_device_table_content(self):
        ctx = _ctx()
        gen = McProjectGenerator(ctx, 'MA', {1: 'OOB_ACCESS', 2: 'OOB_ACCESS'})
        df = gen.build_device_table()
        assert len(df) == 2
        assert df.iloc[0]['设备名'] == 'BJ01-R01-AIDC-H3C-MA-01'
        assert df.iloc[0]['角色'] == 'OOB_ACCESS'
        assert df.iloc[0]['环回IP'] == '10.1.0.1'
        assert df.iloc[0]['管理IP'] == '10.1.64.1'
        assert df.iloc[0]['管理掩码'] == '255.255.255.192'
        assert df.iloc[0]['VRRP虚拟IP'] == '10.1.64.126'
        assert df.iloc[0]['VRRP优先级'] == 200
        assert df.iloc[1]['VRRP优先级'] == 150
        assert df.iloc[0]['对端设备'] == 'BJ01-R01-AIDC-H3C-MA-02'

    def test_param_table_content(self):
        ctx = _ctx()
        gen = McProjectGenerator(ctx, 'MA', {1: 'OOB_ACCESS'})
        df = gen.build_param_table()
        mapping = dict(zip(df['全局参数名'], df['参数值']))
        assert mapping['AAA地址'] == '10.10.10.10,10.10.10.11'
        assert mapping['NTP地址'] == '10.200.0.1,10.200.0.2'
        assert mapping['SNMP团体名'] == 'mc-public'
        assert mapping['AAA认证密钥'] == 'Aa@12345'

    @pytest.mark.skipif(not sys_path_ok, reason='MC pre_processing 不可用')
    def test_mc_can_consume_project(self, monkeypatch):
        import config as mc_config
        ctx = _ctx()
        with tempfile.TemporaryDirectory() as tmp:
            project_name = 'aidc_oob_test'
            project_dir = os.path.join(tmp, project_name)
            gen = McProjectGenerator(ctx, 'MA', {1: 'OOB_ACCESS', 2: 'OOB_ACCESS'})
            gen.write(project_dir)
            # 注册项目到 MC_Para.xlsx
            pd.DataFrame({'项目名称': [project_name]}).to_excel(
                os.path.join(tmp, 'MC_Para.xlsx'), sheet_name='项目名称', index=False)
            monkeypatch.setattr(mc_config, 'WORKSPACE_DIR', tmp)
            pp = PreProcessing()
            pp.workspace = tmp
            pp.read_MC_para('MC_Para.xlsx')
            assert project_name in pp.project_name
            pp.execute_render('1', 'device_name')
            # 渲染产物存在且内容正确
            output_dir = os.path.join(tmp, project_name, 'output')
            assert os.path.isdir(output_dir)
            time_dirs = os.listdir(output_dir)
            assert len(time_dirs) >= 1
            oob_dir = os.path.join(output_dir, time_dirs[0], 'OOB_ACCESS')
            assert os.path.isdir(oob_dir)
            txt_files = sorted(f for f in os.listdir(oob_dir) if f.endswith('.txt'))
            assert len(txt_files) == 2
            content_ma1 = open(os.path.join(oob_dir, txt_files[0]), encoding='utf-8').read()
            assert 'BJ01-R01-AIDC-H3C-MA-01' in content_ma1
            assert '10.1.0.1' in content_ma1
            assert '10.1.64.1' in content_ma1
            assert '10.1.64.126' in content_ma1  # VRRP 虚拟 IP
            assert 'ntp-service unicast-server 10.200.0.1' in content_ma1
