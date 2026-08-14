"""
意图参数适配器 —— 意图变量引用解析。

把参考模板 {{ 表达式 }} 内部的「意图变量引用」解析为具体值：
- 设备索引变量：ipv4_M-ILO_P_BD[[ID]]  -> 设备参数表查值
- 全局参数：    para_para_C_IPV4       -> 全局参数表查值
- 函数调用：    modify_ip(...) / add_int(...) / key_exist(...) 等
- item 引用：   item.xxx                -> iter_obj_func 产出的行对象
- 过滤器链：    var|to_network:26,4,1   -> 查值后逐 filter 应用

P0.5 原型：验证「意图参数 -> 具体值」推导链路（评估报告 R2），
完整模板级规范化（控制流展开 + MC info dict 映射）为下一步增量。
"""

import re
from . import filters
from . import id_expr


class IntentContext:
    """意图参数上下文（由 AL plan:table 宏观参数 / MC 生成器填充）。"""

    def __init__(self):
        self.globals = {}          # para_para_C_* / para_external_C_* 等全局参数
        self.device_params = {}    # {场景: {序号: {变量名: 值}}}  设备级参数
        self.lists = {}            # {变量名: [..]}  列表参数（iter_list_func）
        self.keys = set()          # 已知变量名集合（key_exist 用）
        self.peer_map = {}         # {场景: {序号: 对端序号}}
        self.scenario = None       # 当前场景
        self.device_id = None      # 当前设备序号
        self.item = None           # iter_obj_func 当前行对象
        self.forloop = {}          # {'First': bool, 'Count': int} 循环元信息

    def get_device_param(self, var_name: str):
        """按 当前场景+序号 / 或 var_name 自含场景 解析设备参数。"""
        # 变量名可能已带场景后缀，如 hostname_hostname_B_BD1
        if self.device_params and self.scenario:
            dev = self.device_params.get(self.scenario, {}).get(self.device_id, {})
            if var_name in dev:
                return dev[var_name]
            # 尝试在任意场景中查找该具体变量名
            for sc, by_id in self.device_params.items():
                for _id, params in by_id.items():
                    if var_name in params:
                        return params[var_name]
        return None

    def get(self, var_name: str):
        """统一取值：设备参数 > 全局参数 > 列表参数。"""
        if var_name in self.device_params and not self._is_plain(var_name):
            pass
        if var_name in self.globals:
            return self.globals[var_name]
        v = self.get_device_param(var_name)
        if v is not None:
            return v
        if var_name in self.lists:
            return self.lists[var_name]
        return None

    @staticmethod
    def _is_plain(var_name):
        # 形如 para_para_C_* / para_external_C_* 视为全局
        return var_name.startswith('para_')


def _split_top_level_pipes(inner: str):
    """按顶层 | 切分（忽略 [[...]] 内部的 |，如 [[ID|to_peer]]）。"""
    parts = []
    cur = []
    depth = 0
    for ch in inner:
        if ch == '[':
            depth += 1
        elif ch == ']':
            depth = max(0, depth - 1)
        if ch == '|' and depth == 0:
            parts.append(''.join(cur).strip())
            cur = []
        else:
            cur.append(ch)
    parts.append(''.join(cur).strip())
    return parts


def _split_filter_chain(inner: str):
    """'var|f1:a,b|f2' -> ('var', [('f1',['a','b']), ('f2',[])])。

    [[...]] 内部的 |（如 [[ID|to_peer]]）不视为过滤器管道。
    """
    parts = _split_top_level_pipes(inner)
    base = parts[0]
    chain = []
    for p in parts[1:]:
        if ':' in p:
            name, _, args = p.partition(':')
            raw_args = [a.strip() for a in args.split(',') if a.strip() != '']
            chain.append((name.strip(), _coerce_args(raw_args)))
        else:
            chain.append((p.strip(), []))
    return base, chain


def _coerce_args(args):
    """参数字符串 -> int/float/str（去引号）。"""
    out = []
    for a in args:
        a = a.strip().strip('"').strip("'")
        try:
            out.append(int(a))
        except ValueError:
            try:
                out.append(float(a))
            except ValueError:
                out.append(a)
    return out


# 函数调用正则：modify_ip(...) / add_int(...) / sub_int(...) / key_exist("..")
_FUNC_CALL_RE = re.compile(r'^(modify_ip|add_int|sub_int|key_exist|iter_list_func|iter_obj_func)\s*\(')


def _resolve_ref(ref: str, ctx: IntentContext):
    """解析一个不含过滤器的裸引用（可能为变量名 / item.xxx）。

    变量名中的 [[ID]]（含 [[ID|to_peer]]）先按当前设备展开再查值。
    """
    ref = ref.strip()
    if ref.startswith('item.'):
        attr = _expand_id(ref[len('item.'):], ctx)
        if ctx.item is None:
            return None
        return ctx.item.get(attr)
    if ref == 'item':
        return ctx.item
    if ref in ('forloop.First', 'forloop.Count', 'forloop.Counter'):
        return ctx.forloop.get(ref.split('.')[1])
    if ref == 'ID':
        return ctx.device_id
    if '[[' in ref and ctx.device_id is not None:
        ref = id_expr.replace_id_exprs(
            ref, ctx.device_id,
            peer_map=ctx.peer_map.get(ctx.scenario, {}))
    return ctx.get(ref)


def resolve_expr(inner: str, ctx: IntentContext) -> object:
    """解析 {{ 内部表达式 }} 为具体值（P0.5 原型）。"""
    inner = inner.strip()

    # 函数调用
    m = _FUNC_CALL_RE.match(inner)
    if m:
        name = m.group(1)
        # 提取参数（简易：按逗号切分，注意字符串引号）
        args_text = inner[m.end():]
        if args_text.endswith(')'):
            args_text = args_text[:-1]
        args = _split_args(args_text)
        if name == 'modify_ip':
            resolved = [resolve_expr(a, ctx) for a in args]
            if not resolved:
                return None
            if len(resolved) == 1:
                # 单参形式：modify_ip(expr|to_network:26,4,1) -> 返回已推导值
                return filters.modify_ip(resolved[0])
            return filters.modify_ip(resolved[0], resolved[1],
                                     resolved[2] if len(resolved) > 2 else None)
        if name == 'add_int':
            resolved = [resolve_expr(a, ctx) for a in args]
            return filters.add_int(*resolved) if len(resolved) == 2 else None
        if name == 'sub_int':
            resolved = [resolve_expr(a, ctx) for a in args]
            return filters.sub_int(*resolved) if len(resolved) == 2 else None
        if name == 'key_exist':
            arg = _strip_quotes(args[0]) if args else ''
            arg = _expand_id(arg, ctx)
            return filters.key_exist(arg, {'keys': ctx.keys})
        if name == 'iter_list_func':
            arg = _strip_quotes(args[0]) if args else ''
            arg = _expand_id(arg, ctx)
            return filters.iter_list_func(arg, {'lists': ctx.lists, 'globals': ctx.globals,
                                                'scenario': ctx.scenario})
        if name == 'iter_obj_func':
            names = [_expand_id(_strip_quotes(a), ctx) for a in args]
            return filters.iter_obj_func(*names, context={'lists': ctx.lists, 'globals': ctx.globals,
                                                          'scenario': ctx.scenario})
        return None

    # 变量引用 + 过滤器链
    base, chain = _split_filter_chain(inner)
    value = _resolve_ref(base, ctx)

    for fname, fargs in chain:
        fn = filters.FILTERS.get(fname)
        if fn is None:
            raise ValueError(f'未知过滤器: {fname}')
        if fname == 'to_peer':
            value = fn(value, context={'peer_map': ctx.peer_map.get(ctx.scenario, {})})
        elif fname == 'to_role':
            value = fn(value)
        else:
            value = fn(value, *fargs)
    return value


def _strip_quotes(s):
    s = s.strip()
    if len(s) >= 2 and s[0] in ('"', "'") and s[-1] == s[0]:
        return s[1:-1]
    return s


def _expand_id(name, ctx):
    """展开变量名中的 [[ID]]（含 [[ID|to_peer]]）。"""
    if '[[' in name and ctx.device_id is not None:
        return id_expr.replace_id_exprs(
            name, ctx.device_id,
            peer_map=ctx.peer_map.get(ctx.scenario, {}))
    return name


def _has_top_level_pipe(text: str) -> bool:
    """是否存在不在 [[...]] 内的顶层 |（过滤器链）。"""
    depth = 0
    for ch in text:
        if ch == '[':
            depth += 1
        elif ch == ']':
            depth = max(0, depth - 1)
        elif ch == '|' and depth == 0:
            return True
    return False


def _split_args(args_text: str):
    """切分函数参数（考虑引号与 [[...]] 内的逗号）。

    若存在顶层 |（单参+过滤器链形式，如 modify_ip(expr|to_network:26,4,1)），
    整体作为一个参数，避免把过滤器参数 26,4,1 误切。
    """
    if _has_top_level_pipe(args_text):
        return [args_text.strip()]
    args = []
    cur = []
    depth = 0
    in_quote = None
    for ch in args_text:
        if in_quote:
            cur.append(ch)
            if ch == in_quote:
                in_quote = None
        elif ch in ('"', "'"):
            in_quote = ch
            cur.append(ch)
        elif ch == '[':
            depth += 1
            cur.append(ch)
        elif ch == ']':
            depth = max(0, depth - 1)
            cur.append(ch)
        elif ch == ',' and depth == 0:
            args.append(''.join(cur).strip())
            cur = []
        else:
            cur.append(ch)
    if cur:
        args.append(''.join(cur).strip())
    return [a for a in args if a != '']
