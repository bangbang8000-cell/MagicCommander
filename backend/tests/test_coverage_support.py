"""覆盖率恢复补充测试（棘轮门禁只升不降）

覆盖 4.7.0 之前未触达的纯函数分支，环境无关、无网络/文件依赖：
- analyzer._walk_ast：动态 Getitem（info[key]）、嵌套 Getitem、Getattr、For/If/CondExpr/Filter 复杂度累加
- base.deep_dict：叶子 list 键 zip 写入、多级嵌套、叶子非 list 时的 warning 分支
"""
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from jinja2 import Environment

from analyzer import _walk_ast
from base import deep_dict


def test_walk_ast_covers_dynamic_getitem_getattr_and_control_nodes():
    env = Environment()
    ast = env.parse(
        "{% for item in items %}"
        "{% if item.ok %}yes{% else %}no{% endif %}"
        "{{ item.value if item.ok else 0 }}"
        "{{ info[key] }}"
        "{{ info[key]['x'] }}"
        "{{ info['设备名'] }}"
        "{{ obj.attr }}"
        "{{ x | upper }}"
        "{% endfor %}"
    )
    variables, complexity = _walk_ast(ast)
    assert any("[dynamic]" in v for v in variables)          # info[key] 动态键
    assert any("?['x']" in v for v in variables)             # 嵌套 Getitem（非 Name 前缀）
    assert any("设备名" in v for v in variables)             # 常量键
    assert any("obj.attr" in v for v in variables)           # Getattr
    assert complexity >= 3                                   # For/If/CondExpr/Filter 累加


def test_deep_dict_nested_leaf_list_keys_and_warning_branch():
    d = {}
    deep_dict(d, ['info', ['设备名', '角色']], ['SW-1', 'ASW'], 0)
    assert d['info'] == {'设备名': 'SW-1', '角色': 'ASW'}

    nested = {}
    deep_dict(nested, ['a', 'b', ['c']], ['v'], 0)
    assert nested['a']['b'] == {'c': 'v'}

    warn = {}
    deep_dict(warn, ['a', 'b'], 'not-a-list', 0)  # 叶子 keys 非 list → warning 分支
    assert warn['a'] == {}
