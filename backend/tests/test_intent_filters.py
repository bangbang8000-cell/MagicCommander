"""意图参数适配器 —— 过滤器/函数单元测试（纯函数，无参考资产内容）。"""
import pytest
from intent import filters
from intent import id_expr
from intent import resolver


# ---------------------------------------------------------------------------
# CIDR 计算过滤器（明确语义）
# ---------------------------------------------------------------------------

class TestCidrFilters:
    def test_to_ip(self):
        assert filters.to_ip('10.1.0.0/24') == '10.1.0.0'
        assert filters.to_ip('10.1.0.0') == '10.1.0.0'

    def test_to_mask(self):
        assert filters.to_mask('10.1.0.0/24') == '255.255.255.0'
        assert filters.to_mask('10.1.0.0/16') == '255.255.0.0'
        assert filters.to_mask('10.1.0.0/32') == '255.255.255.255'
        assert filters.to_mask('10.1.0.0/0') == '0.0.0.0'

    def test_to_wildcard(self):
        assert filters.to_wildcard('10.1.0.0/24') == '0.0.0.255'
        assert filters.to_wildcard('10.1.0.0/26') == '0.0.0.63'

    def test_to_network(self):
        assert filters.to_network('10.1.5.129/26') == '10.1.5.128'
        assert filters.to_network('10.10.171.254/24') == '10.10.171.0'
        # 显式前缀覆盖
        assert filters.to_network('10.1.5.129', prefix=26) == '10.1.5.128'

    def test_to_length(self):
        assert filters.to_length('10.1.0.0/24') == 24

    def test_to_gw(self):
        assert filters.to_gw('10.10.171.0/24') == '10.10.171.1'


class TestPeerAndArithmetic:
    def test_to_peer_odd_even(self):
        assert filters.to_peer(1) == 2
        assert filters.to_peer(2) == 1
        assert filters.to_peer(3) == 4

    def test_to_peer_with_map(self):
        assert filters.to_peer(1, context={'peer_map': {1: 3}}) == 3

    def test_modify_ip(self):
        assert filters.modify_ip('10.10.64.0', 1) == '10.10.64.1'
        assert filters.modify_ip('10.10.64.0', 4) == '10.10.64.4'

    def test_add_sub_int(self):
        assert filters.add_int(100, 1) == 101
        assert filters.sub_int(100, 1) == 99


# ---------------------------------------------------------------------------
# [[ID]] 表达式求值
# ---------------------------------------------------------------------------

class TestIdExpr:
    def test_plain(self):
        assert id_expr.eval_id_expr('ID', 3) == 3

    def test_plus_minus(self):
        assert id_expr.eval_id_expr('ID+1', 2) == 3
        assert id_expr.eval_id_expr('ID-1', 2) == 1
        assert id_expr.eval_id_expr('125+ID', 2) == 127

    def test_division_multiply(self):
        assert id_expr.eval_id_expr('(ID-1)/2*48+1', 3) == 49
        assert id_expr.eval_id_expr('(ID-1)/2', 4) == 1

    def test_mod(self):
        assert id_expr.eval_id_expr('ID+ID%2-1', 3) == 3
        assert id_expr.eval_id_expr('ID+ID%2-1', 4) == 3

    def test_peer_suffix(self):
        assert id_expr.eval_id_expr('ID|to_peer', 1) == 2
        assert id_expr.eval_id_expr('ID|to_peer-1', 1) == 1

    def test_invalid_expression(self):
        with pytest.raises(id_expr.IdExprError):
            id_expr.eval_id_expr('ID*evil()', 1)
        with pytest.raises(id_expr.IdExprError):
            id_expr.eval_id_expr('other+1', 1)

    def test_replace_in_text(self):
        text = 'hostname_hostname_B_BD[[ID]]'
        assert id_expr.replace_id_exprs(text, 1) == 'hostname_hostname_B_BD1'
        text2 = '[[ID|to_peer]]-[[ID]]'
        assert id_expr.replace_id_exprs(text2, 1) == '2-1'


# ---------------------------------------------------------------------------
# 意图变量引用解析（resolve_expr）
# ---------------------------------------------------------------------------

def _build_ctx():
    ctx = resolver.IntentContext()
    ctx.scenario = 'BD'
    ctx.device_id = 1
    ctx.globals = {
        'para_para_C_IPV4': '10.1.0.0/24',
        'para_external_C_PEER-BD-AS': 65010,
    }
    ctx.device_params = {
        'BD': {
            1: {'hostname_hostname_B_BD1': 'bd1',
                'ipv4_M-ILO_P_BD1': '10.1.64.1',
                'ipv4_LoopBack_P_BD1': '10.1.0.1'},
            2: {'hostname_hostname_B_BD2': 'bd2',
                'ipv4_M-ILO_P_BD2': '10.1.64.2',
                'ipv4_LoopBack_P_BD2': '10.1.0.2'},
        }
    }
    ctx.keys = set(ctx.globals) | set(ctx.device_params['BD'][1]) | set(ctx.device_params['BD'][2])
    ctx.lists = {'para_para_C_NTP': ['10.200.0.1', '10.200.0.2']}
    ctx.peer_map = {'BD': {1: 2, 2: 1}}
    return ctx


class TestResolver:
    def test_global_param(self):
        ctx = _build_ctx()
        assert resolver.resolve_expr('para_para_C_IPV4', ctx) == '10.1.0.0/24'

    def test_global_param_with_filter(self):
        ctx = _build_ctx()
        assert resolver.resolve_expr('para_para_C_IPV4|to_ip', ctx) == '10.1.0.0'
        assert resolver.resolve_expr('para_para_C_IPV4|to_mask', ctx) == '255.255.255.0'
        assert resolver.resolve_expr('para_para_C_IPV4|to_wildcard', ctx) == '0.0.0.255'

    def test_device_indexed_param(self):
        ctx = _build_ctx()
        # 简化：直接传已展开的变量名（原型演示 [[ID]] 需在模板层先展开）
        assert resolver.resolve_expr('hostname_hostname_B_BD1', ctx) == 'bd1'

    def test_peer_param(self):
        ctx = _build_ctx()
        ctx.device_id = 1
        # 对端主机名：hostname_hostname_B_BD[[ID|to_peer]] -> BD2
        assert resolver.resolve_expr('hostname_hostname_B_BD[[ID|to_peer]]', ctx) == 'bd2'

    def test_modify_ip_call(self):
        ctx = _build_ctx()
        ctx.device_id = 1
        # gateway {{ modify_ip(ipv4_M-ILO_P_BD[[ID]]|to_network:26,4,1) }}
        val = resolver.resolve_expr(
            'modify_ip(ipv4_M-ILO_P_BD[[ID]]|to_network:26,4,1)', ctx)
        # ipv4_M-ILO_P_BD1 = 10.1.64.1 -> /26 网络 10.1.64.0 -> +4 = 10.1.64.4
        assert val == '10.1.64.4'

    def test_key_exist(self):
        ctx = _build_ctx()
        assert resolver.resolve_expr('key_exist("hostname_hostname_B_BD2")', ctx) is True
        assert resolver.resolve_expr('key_exist("hostname_hostname_D_LC4")', ctx) is False

    def test_iter_list_func(self):
        ctx = _build_ctx()
        assert resolver.resolve_expr('iter_list_func("para_para_C_NTP")', ctx) == \
            ['10.200.0.1', '10.200.0.2']
