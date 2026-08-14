"""
意图参数适配器 —— [[ID]] 设备索引表达式求值。

参考模板用 [[expr]] 表示「场景内第 N 台设备」的索引寻址，expr 支持：
- 算术：ID+1 / ID-1 / (ID-1)/2*48+1 / ID+ID%2-1 / 125+ID
- 过滤器后缀：[[ID|to_peer]]、[[ID|to_peer-1]]

本模块用 ast 白名单方式安全求值（仅允许算术运算与 ID/整数），
避免任意代码执行。结果自动规整为整数（浮点整数化）。
"""

import ast
import operator as _op

# 允许的二元运算符
# 注：参考模板为 Go 渲染引擎，[[(ID-1)/2*48+1]] 等采用整数除法（整除），
# 故 ast.Div 映射到 floor 整除以对齐原语义。
_BINOPS = {
    ast.Add: _op.add,
    ast.Sub: _op.sub,
    ast.Mult: _op.mul,
    ast.Div: _op.floordiv,
    ast.Mod: _op.mod,
}


class IdExprError(ValueError):
    """[[ID]] 表达式非法或越界"""


def _eval_node(node, id_value):
    if isinstance(node, ast.Constant):
        if isinstance(node.value, (int, float)):
            return node.value
        raise IdExprError(f'仅允许数值常量: {node.value!r}')
    if isinstance(node, ast.Name):
        if node.id == 'ID':
            return id_value
        raise IdExprError(f'仅允许变量 ID，出现: {node.id}')
    if isinstance(node, ast.BinOp):
        left = _eval_node(node.left, id_value)
        right = _eval_node(node.right, id_value)
        fn = _BINOPS.get(type(node.op))
        if fn is None:
            raise IdExprError(f'不支持的运算符: {type(node.op).__name__}')
        return fn(left, right)
    if isinstance(node, ast.UnaryOp):
        operand = _eval_node(node.operand, id_value)
        if isinstance(node.op, ast.USub):
            return -operand
        if isinstance(node.op, ast.UAdd):
            return +operand
        raise IdExprError(f'不支持的一元运算: {type(node.op).__name__}')
    raise IdExprError(f'不支持的表达式节点: {type(node).__name__}')


def _normalize_result(value, id_value):
    """把浮点整数值规整为 int，非法（负数/越界）抛错。"""
    if isinstance(value, float):
        if not value.is_integer():
            raise IdExprError(f'[[ID]] 表达式产生非整数: {value} (ID={id_value})')
        value = int(value)
    if isinstance(value, bool):  # bool 是 int 子类，排除
        value = int(value)
    if not isinstance(value, int):
        raise IdExprError(f'[[ID]] 表达式结果非整数: {value!r} (ID={id_value})')
    return value


def eval_id_expr(expr, id_value, peer_rule=None, peer_map=None):
    """求值一个 [[expr]] 内部表达式（不含方括号）。

    支持 |filter 后缀（目前 to_peer / to_peer-1 组合）。
    """
    text = str(expr).strip()
    if not text:
        raise IdExprError('空表达式')

    # 处理 |filter 后缀（仅一层，简单过滤链）
    filter_chain = []
    if '|' in text:
        parts = text.split('|')
        text = parts[0].strip()
        filter_chain = [p.strip() for p in parts[1:]]

    # 算术求值（把 -1 挂在 to_peer 上：'to_peer-1'）
    tree = ast.parse(text, mode='eval')
    value = _eval_node(tree.body, id_value)
    value = _normalize_result(value, id_value)

    for filt in filter_chain:
        offset = 0
        # 支持 'to_peer-1' / 'to_peer+2' 形式
        tail = None
        for marker in ('-', '+'):
            if marker in filt and not filt.startswith(marker):
                name, _, tail = filt.partition(marker)
                if tail:
                    offset = int(tail) if marker == '+' else -int(tail)
                filt = name
                break
        if filt == 'to_peer':
            from .filters import to_peer
            value = int(to_peer(value, context={'peer_map': peer_map or {}}))
            value += offset
        else:
            raise IdExprError(f'[[ID]] 不支持过滤器: {filt}')

    return _normalize_result(value, id_value)


# 匹配 [[...]] 的正则（非贪婪，排除嵌套方括号）
import re
ID_BRACKET_RE = re.compile(r'\[\[([^\]]+)\]\]')


def iter_id_exprs(text):
    """提取文本中所有 [[expr]]，返回 [(expr_str, match)]"""
    for m in ID_BRACKET_RE.finditer(text):
        yield m.group(1), m


def replace_id_exprs(text, id_value, peer_rule=None, peer_map=None):
    """把文本中所有 [[expr]] 替换为求值结果。"""
    def _repl(m):
        expr = m.group(1)
        return str(eval_id_expr(expr, id_value, peer_rule, peer_map))
    return ID_BRACKET_RE.sub(_repl, text)
