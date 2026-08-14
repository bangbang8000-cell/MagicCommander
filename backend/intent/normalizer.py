"""
意图参数适配器 —— 模板级展开器（规范化器最小形态）。

把一份参考模板（含 [[ID]]、{{ }}、{% %}、{# #}）在给定意图上下文下，
逐设备展开为**不含 Jinja2 语法的具体配置文本**（P0.5 验证「意图 -> 配置」链路）。

支持构造：
- {{ expr }}           经 resolver.resolve_expr 解析（含 [[ID]]、过滤器链、函数调用）
- {% if/elif/else/endif %}  条件分支（truthiness + ==/!= + and/or/not）
- {% for x in expr %}/{% endfor %} 迭代（iter_list_func / iter_obj_func，item.xxx）
- forloop.First / forloop.Count
- {# comment #} 注释丢弃
- {{- -}} / {%- -%} 空白控制

说明：本模块为通用渲染能力，不包含参考资产内容。
"""

import re

from . import resolver
from .resolver import IntentContext, resolve_expr

# 切分标签；注意非贪婪 + DOTALL 以覆盖多行
_TAG_RE = re.compile(r'(\{\{.*?\}\}|\{%-?.*?-?%\}|\{#.*?#\})', re.S)


class TemplateError(ValueError):
    pass


def _classify(tag: str):
    """返回 (kind, content, trim_left, trim_right)。content 不含边界括号与空白控制符。"""
    if tag.startswith('{#'):
        return 'comment', None, False, False
    if tag.startswith('{{'):
        body = tag[2:-2]
    elif tag.startswith('{%'):
        body = tag[2:-2]
    else:
        return 'text', tag, False, False
    trim_left = body.startswith('-')
    trim_right = body.endswith('-')
    body = body[1:-1] if trim_left else body
    if trim_right:
        body = body[:-1]
    kind = 'var' if tag.startswith('{{') else 'ctrl'
    return kind, body.strip(), trim_left, trim_right


def _tokenize(text: str):
    """文本 -> token 列表 [(kind, content)]，并应用空白控制。"""
    parts = _TAG_RE.split(text)
    tokens = []
    for i, p in enumerate(parts):
        if not p:
            continue
        if _TAG_RE.fullmatch(p):
            kind, content, tl, tr = _classify(p)
            if tl and tokens and tokens[-1][0] == 'text':
                tokens[-1] = ('text', tokens[-1][1].rstrip(' \t\n'))
            tokens.append((kind, content))
            # 右空白控制作用于下一个 text
            if tr and i + 1 < len(parts) and parts[i + 1]:
                parts[i + 1] = parts[i + 1].lstrip(' \t\n')
        else:
            tokens.append(('text', p))
    return tokens


class Normalizer:
    """把模板按设备展开为具体配置文本。"""

    def __init__(self, ctx: IntentContext):
        self.ctx = ctx

    def render(self, text: str, device_id: int, scenario: str | None = None) -> str:
        self.ctx.device_id = device_id
        if scenario is not None:
            self.ctx.scenario = scenario
        tokens = _tokenize(text)
        return ''.join(self._render(tokens, 0, len(tokens)))

    # ------------------------------------------------------------------ #
    # 渲染循环
    # ------------------------------------------------------------------ #
    def _render(self, tokens, start, stop):
        out = []
        i = start
        while i < stop:
            kind, content = tokens[i]
            if kind == 'text':
                out.append(content)
                i += 1
            elif kind == 'comment':
                i += 1
            elif kind == 'var':
                out.append(self._fmt(self._eval_var(content)))
                i += 1
            elif kind == 'ctrl':
                stmt = content
                if stmt.startswith('if '):
                    end_i, branches = self._scan_if(tokens, i + 1, stmt[3:])
                    for cond, bs, be in branches:
                        if cond is None or self._eval_cond(cond):
                            out.append(''.join(self._render(tokens, bs, be)))
                            break
                    i = end_i + 1
                elif stmt.startswith('for '):
                    end_i = self._scan_for_end(tokens, i + 1)
                    m = re.match(r'for\s+(\w+)\s+in\s+(.+)', stmt)
                    if not m:
                        raise TemplateError(f'无法解析 for 语句: {stmt}')
                    var, expr = m.group(1), m.group(2)
                    items = self._eval_var(expr) or []
                    for idx, item in enumerate(items):
                        self.ctx.item = item
                        self.ctx.forloop = {'First': idx == 0, 'Count': idx + 1}
                        out.append(''.join(self._render(tokens, i + 1, end_i)))
                    self.ctx.item = None
                    self.ctx.forloop = {}
                    i = end_i + 1
                else:
                    # end/else/elif 由 if/for 扫描消费，单独出现视为忽略
                    i += 1
        return out

    # ------------------------------------------------------------------ #
    # if / for 扫描
    # ------------------------------------------------------------------ #
    def _scan_if(self, tokens, body_start, first_cond):
        """扫描 if...elif...else...endif，返回 (endif_index, [(cond|None, start, end)])。"""
        branches = []
        cond = first_cond
        start = body_start
        i = body_start
        depth = 0
        while i < len(tokens):
            kind, content = tokens[i]
            if kind == 'ctrl':
                s = content
                if s.startswith('if '):
                    depth += 1
                elif s.startswith('endif'):
                    if depth == 0:
                        branches.append((cond, start, i))
                        return i, branches
                    depth -= 1
                elif depth == 0 and (s.startswith('elif') or s.startswith('else')):
                    branches.append((cond, start, i))
                    start = i + 1
                    cond = s[len('elif'):].strip() if s.startswith('elif') else None
            i += 1
        raise TemplateError('if 未闭合: 缺少 endif')

    def _scan_for_end(self, tokens, body_start):
        """返回匹配的 endfor 索引。"""
        depth = 0
        i = body_start
        while i < len(tokens):
            kind, content = tokens[i]
            if kind == 'ctrl':
                if content.startswith('for '):
                    depth += 1
                elif content.startswith('endfor'):
                    if depth == 0:
                        return i
                    depth -= 1
            i += 1
        raise TemplateError('for 未闭合: 缺少 endfor')

    # ------------------------------------------------------------------ #
    # 表达式 / 条件
    # ------------------------------------------------------------------ #
    def _eval_var(self, content):
        content = content.strip()
        if content == 'forloop.First':
            return self.ctx.forloop.get('First', False)
        if content == 'forloop.Count':
            return self.ctx.forloop.get('Count', 1)
        return resolve_expr(content, self.ctx)

    def _eval_cond(self, cond_text: str) -> bool:
        cond_text = cond_text.strip()
        if cond_text.startswith('not '):
            return not self._eval_cond(cond_text[4:])
        # 顶层 or / and 切分（考虑括号/引号/[[..]] 深度）
        parts = _split_top_ops(cond_text)
        if len(parts) > 1:
            op = None
            for p in parts:
                if p in ('and', 'or'):
                    op = p
            # 按 op 重组（这里简化：只处理一层 and/or 混合，按 or 优先）
            if ' or ' in cond_text and _depth_safe_find(cond_text, ' or ') >= 0:
                ors = _split_top(cond_text, 'or')
                return any(self._eval_cond(o) for o in ors)
            ands = _split_top(cond_text, 'and')
            return all(self._eval_cond(o) for o in ands)
        return bool(self._eval_operand(cond_text))

    def _eval_operand(self, op_text: str):
        op_text = op_text.strip()
        for sep in ('==', '!='):
            if sep in op_text:
                a, _, b = op_text.partition(sep)
                va = self._eval_var(a)
                vb = _coerce_literal(b.strip())
                return va == vb if sep == '==' else va != vb
        return _truthy(self._eval_var(op_text))

    @staticmethod
    def _fmt(value):
        if value is None:
            return ''
        if isinstance(value, bool):
            return 'true' if value else 'false'
        return str(value)


# --------------------------------------------------------------------------- #
# 条件切分辅助
# --------------------------------------------------------------------------- #

def _depth_safe_find(text, token):
    depth = 0
    for i, ch in enumerate(text):
        if ch in '[(':
            depth += 1
        elif ch in '])':
            depth = max(0, depth - 1)
        if ch == token[0] and depth == 0 and text.startswith(token, i):
            return i
    return -1


def _split_top(text, op):
    """按 'op'（or/and）在顶层切分。"""
    parts = []
    cur = []
    depth = 0
    in_quote = None
    i = 0
    while i < len(text):
        ch = text[i]
        if in_quote:
            cur.append(ch)
            if ch == in_quote:
                in_quote = None
            i += 1
            continue
        if ch in ('"', "'"):
            in_quote = ch
            cur.append(ch)
            i += 1
            continue
        if ch in '[(':
            depth += 1
        elif ch in '])':
            depth = max(0, depth - 1)
        if depth == 0 and text.startswith(op, i):
            # 确保前后是空白边界（避免 ID-1 之类被 'or' 误吞）
            if (i == 0 or text[i - 1].isspace()) and \
               (i + len(op) == len(text) or text[i + len(op)].isspace()):
                parts.append(''.join(cur).strip())
                cur = []
                i += len(op)
                continue
        cur.append(ch)
        i += 1
    if cur:
        parts.append(''.join(cur).strip())
    return [p for p in parts if p != '']


def _split_top_ops(text):
    """拆出 and/or 词元（仅用于判断是否含逻辑运算符）。"""
    return [p for p in _split_top(text, 'or')]


def _coerce_literal(s):
    """RHS 字面量：数字 / 去引号字符串。"""
    s = s.strip()
    try:
        return int(s)
    except ValueError:
        pass
    if len(s) >= 2 and s[0] in ('"', "'") and s[-1] == s[0]:
        return s[1:-1]
    return s


def _truthy(val):
    if val is None:
        return False
    if isinstance(val, str):
        return val.strip() != ''
    return bool(val)


def normalize_template(text: str, ctx: IntentContext, device_id: int,
                       scenario: str | None = None) -> str:
    """便捷入口：把模板按设备展开为配置文本。

    scenario 为模板所属场景（SPINE/LEAF/BIZACC/BIZAGG 等），用于列表命名空间解析。
    """
    return Normalizer(ctx).render(text, device_id, scenario)
