"""意图参数适配器 —— 模板级展开器（规范化器）单元测试。"""
import pytest
from intent.resolver import IntentContext
from intent.normalizer import normalize_template, TemplateError


def _ctx():
    ctx = IntentContext()
    ctx.scenario = 'MA'
    ctx.device_id = 1
    ctx.globals = {
        'para_para_C_IPV6': 'true',
        'para_para_C_NTP': '10.200.0.1,10.200.0.2',
        'para_para_C_AAA1': '10.10.10.10',
    }
    ctx.device_params = {
        'MA': {
            1: {'hostname_hostname_B_MA1': 'BJ01-R01-AIDC-H3C-MA-01',
                'ipv4_M-ILO_P_MA1': '10.1.64.1',
                'ipv4_LoopBack_P_MA1': '10.1.0.1'},
            2: {'hostname_hostname_B_MA2': 'BJ01-R01-AIDC-H3C-MA-02',
                'ipv4_M-ILO_P_MA2': '10.1.64.2',
                'ipv4_LoopBack_P_MA2': '10.1.0.2'},
        }
    }
    ctx.keys = set(ctx.globals) | set(ctx.device_params['MA'][1]) | set(ctx.device_params['MA'][2])
    ctx.lists = {'para_para_C_NTP': ['10.200.0.1', '10.200.0.2']}
    ctx.peer_map = {'MA': {1: 2, 2: 1}}
    return ctx


class TestNormalizer:
    def test_id_expansion_and_global(self):
        ctx = _ctx()
        out = normalize_template(
            'sysname {{hostname_hostname_B_MA[[ID]]}}\n'
            'ntp server {{para_para_C_NTP|split:"."|first}}\n',
            ctx, 1)
        assert out == 'sysname BJ01-R01-AIDC-H3C-MA-01\nntp server 10\n'

    def test_if_condition(self):
        ctx = _ctx()
        out = normalize_template(
            '{%- if para_para_C_IPV6 %}\nipv6 enabled\n{%- else %}\nipv6 off\n{%- endif %}',
            ctx, 1)
        assert 'ipv6 enabled' in out and 'ipv6 off' not in out

    def test_if_comparison(self):
        ctx = _ctx()
        out = normalize_template(
            '{%- if ID==1 or ID==2 %}pair ok{%- else %}no{%- endif %}', ctx, 1)
        assert out == 'pair ok'
        out2 = normalize_template(
            '{%- if ID==1 or ID==2 %}pair ok{%- else %}no{%- endif %}', ctx, 3)
        assert out2 == 'no'

    def test_for_loop_list(self):
        ctx = _ctx()
        out = normalize_template(
            '{%- for item in iter_list_func("para_para_C_NTP") %}\n'
            'ntp server {{item}}\n'
            '{%- endfor %}', ctx, 1)
        assert 'ntp server 10.200.0.1' in out and 'ntp server 10.200.0.2' in out

    def test_for_loop_obj(self):
        ctx = _ctx()
        ctx.lists['MA_conn_MGMT_F+C_MA1'] = ['GigabitEthernet1/0/1']
        ctx.lists['MA_ipv4_M-CONN_L+P_MA1'] = ['10.1.72.1']
        out = normalize_template(
            '{%- for item in iter_obj_func("conn_MGMT_F+C_MA[[ID]]","ipv4_M-CONN_L+P_MA[[ID]]") %}\n'
            'interface {{item.conn_MGMT_F+C_MA[[ID]]}}\n'
            ' ip address {{item.ipv4_M-CONN_L+P_MA[[ID]]}} 255.255.255.252\n'
            '{%- endfor %}', ctx, 1)
        assert 'interface GigabitEthernet1/0/1' in out
        assert 'ip address 10.1.72.1 255.255.255.252' in out

    def test_forloop_first(self):
        ctx = _ctx()
        out = normalize_template(
            '{%- for item in iter_list_func("para_para_C_NTP") %}\n'
            '{%- if forloop.First %}first\n{%- endif %}'
            '{%- endfor %}', ctx, 1)
        assert out.count('first') == 1

    def test_peer_hostname(self):
        ctx = _ctx()
        out = normalize_template(
            'peer {{hostname_hostname_B_MA[[ID|to_peer]]}}', ctx, 1)
        assert out == 'peer BJ01-R01-AIDC-H3C-MA-02'

    def test_unclosed_for_raises(self):
        ctx = _ctx()
        with pytest.raises(TemplateError):
            normalize_template('{%- for item in iter_list_func("para_para_C_NTP") %}x', ctx, 1)
