"""
参考模板语法扫描器（P0.5 原型验证用）。

作用：分析一份参考模板（业务网和管理网-参考2 的 .cfg/.txt），报告其
- {{ }} 表达式中的变量/过滤器/函数清单
- {% %} 控制流统计
- [[ID]] 表达式模式
- 是否仅使用适配器已支持的构造（覆盖率）

用法：
    python intent/scanner.py <模板文件路径>

说明：本脚本不包含参考资产内容，仅按运行时传入路径读取分析。
"""

import re
import sys
from collections import Counter

from . import filters
from . import id_expr

_VAR_RE = re.compile(r'\{\{-?\s*(.*?)\s*-?\}\}')
_CTRL_RE = re.compile(r'\{%-?\s*(.*?)\s*-?%\}')
# 简单括号匹配：{{ xxx }} 内可能含 }} 出现在字符串里（极少），此处按非贪婪处理


def scan_template(text: str) -> dict:
    """扫描模板文本，返回统计信息。"""
    result = {
        'variables': Counter(),     # 变量引用（含过滤器）
        'filters': Counter(),       # 过滤器名
        'functions': Counter(),     # 函数名
        'id_exprs': Counter(),      # [[ID]] 表达式
        'control': Counter(),       # {% %} 控制流
        'unknown_filters': set(),   # 适配器未实现的过滤器
        'unknown_functions': set(), # 适配器未实现的函数
        'var_count': 0,
        'ctrl_count': 0,
        'id_count': 0,
    }

    for m in _VAR_RE.finditer(text):
        inner = m.group(1).strip()
        result['var_count'] += 1
        # 统计顶层过滤器
        parts = _top_level_split(inner, '|')
        base = parts[0]
        for p in parts[1:]:
            fname = p.split(':')[0].strip()
            result['filters'][fname] += 1
            if fname not in filters.FILTERS:
                result['unknown_filters'].add(fname)
        # 统计函数调用
        for fn in _FUNCS:
            if fn in inner:
                result['functions'][fn] += 1
                if fn not in filters.FUNCTIONS:
                    result['unknown_functions'].add(fn)
        # 变量引用去 [[ID]] 后的模板形态
        result['variables'][base] += 1

    for m in _CTRL_RE.finditer(text):
        inner = m.group(1).strip()
        result['ctrl_count'] += 1
        kw = inner.split()[0] if inner else ''
        result['control'][kw] += 1
        # 控制流内的函数
        for fn in _FUNCS:
            if fn in inner:
                result['functions'][fn] += 1
                if fn not in filters.FUNCTIONS:
                    result['unknown_functions'].add(fn)

    for _expr, _m in id_expr.iter_id_exprs(text):
        result['id_count'] += 1
        result['id_exprs'][_expr] += 1

    return result


_FUNCS = ('modify_ip', 'add_int', 'sub_int', 'key_exist',
          'iter_list_func', 'iter_obj_func')


def _top_level_split(text: str, sep: str):
    """按顶层分隔符切分（忽略 [[...]] 内部）。"""
    out, cur, depth = [], [], 0
    for ch in text:
        if ch == '[':
            depth += 1
        elif ch == ']':
            depth = max(0, depth - 1)
        if ch == sep and depth == 0:
            out.append(''.join(cur).strip())
            cur = []
        else:
            cur.append(ch)
    out.append(''.join(cur).strip())
    return out


def report(template_path: str) -> str:
    """生成可读报告。"""
    with open(template_path, encoding='utf-8', errors='replace') as f:
        text = f.read()
    s = scan_template(text)

    var_tag = '{{ }}'
    ctrl_tag = '{% %}'
    lines = [f'=== {template_path} ===']
    lines.append(f'文件行数: {text.count(chr(10))}, {var_tag}: {s["var_count"]}, '
                 f'{ctrl_tag}: {s["ctrl_count"]}, [[ID]]: {s["id_count"]}')
    lines.append(f'控制流: {dict(s["control"].most_common())}')
    lines.append(f'过滤器: {dict(s["filters"].most_common())}')
    if s['unknown_filters']:
        lines.append(f'!! 未实现过滤器: {sorted(s["unknown_filters"])}')
    if s['unknown_functions']:
        lines.append(f'!! 未实现函数: {sorted(s["unknown_functions"])}')
    lines.append(f'ID 表达式(去重): {dict(s["id_exprs"].most_common(10))}')
    lines.append('')
    return '\n'.join(lines)


if __name__ == '__main__':
    if len(sys.argv) < 2:
        print('用法: python intent/scanner.py <模板文件路径>')
        sys.exit(1)
    print(report(sys.argv[1]))
