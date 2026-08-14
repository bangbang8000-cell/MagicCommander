"""
意图参数适配器 —— 网络计算过滤器与函数。

对应参考模板中 18 个自定义过滤器（to_ip/to_mask/to_network/to_wildcard/to_peer/
to_length/to_gw/to_link_local/to_role/renumber/get_port*/split/length_is/integer/
first/last/to_port）与 6 个函数（key_exist/iter_list_func/iter_obj_func/
modify_ip/add_int/sub_int）中与「IP/对端/端口推导」相关的部分。

语义约定（P0.5 原型）：
- 明确语义完整实现：to_ip / to_mask / to_wildcard / to_network / to_length / to_gw
- 推断语义实现 + 标注「待验证」：to_peer / modify_ip / to_link_local / renumber / get_port*
- 其余（split/first/last/integer/length_is/to_role/to_port）为简单映射或由 Jinja2 内建替代

均为纯函数，可单测，不依赖参考资产内容。
"""

import ipaddress

# ---------------------------------------------------------------------------
# CIDR 工具
# ---------------------------------------------------------------------------


def _parse_cidr(val):
    """'10.1.0.0/24' -> ('10.1.0.0', 24)；无前缀时 prefix=None"""
    s = str(val).strip()
    if '/' in s:
        ip_part, pre_part = s.rsplit('/', 1)
        try:
            prefix = int(pre_part)
        except ValueError:
            prefix = None
        return ip_part, prefix
    return s, None


def _to_int(ip_str: str) -> int:
    """IPv4/IPv6 字符串 -> 整数"""
    return int(ipaddress.ip_address(str(ip_str)))


def _to_ip(ip_int: int) -> str:
    """整数 -> IP 字符串"""
    return str(ipaddress.ip_address(ip_int))


def _mask_int(prefix: int) -> int:
    return (0xFFFFFFFF << (32 - prefix)) & 0xFFFFFFFF


# ---------------------------------------------------------------------------
# 过滤器（模板侧：{{ var|to_ip }} 等）
# ---------------------------------------------------------------------------


def to_ip(val):
    """'10.1.0.0/24' -> '10.1.0.0'（取 IP 部分）"""
    ip, _ = _parse_cidr(val)
    return ip


def to_mask(val):
    """'10.1.0.0/24' -> '255.255.255.0'（前缀 -> 掩码）"""
    _, prefix = _parse_cidr(val)
    if prefix is None:
        return str(val)
    return _to_ip(_mask_int(prefix))


def to_wildcard(val):
    """'10.1.0.0/24' -> '0.0.0.255'（前缀 -> 反掩码）"""
    _, prefix = _parse_cidr(val)
    if prefix is None:
        return str(val)
    wildcard = 0xFFFFFFFF ^ _mask_int(prefix)
    return _to_ip(wildcard & 0xFFFFFFFF)


def to_network(val, prefix=None, start=None, step=None):
    """'10.1.0.0/24' -> '10.1.0.0'（网络地址）；IPv6 亦支持（如 /64）。

    参考模板用法 to_network:26,4,1：prefix 为显式前缀，start 推断为
    「子网内偏移」→ 网络地址 + start（如网关计算 network+4）。step 暂不参与。
    """
    ip, _ = _parse_cidr(val)
    p = prefix if prefix is not None else _
    if p is None:
        return str(val)
    try:
        net = ipaddress.ip_network(f'{ip}/{p}', strict=False)
    except ValueError:
        return str(val)
    base = int(net.network_address)
    if start is not None:
        base += int(start)
    return str(ipaddress.ip_address(base))


def to_length(val):
    """'10.1.0.0/24' -> 24（前缀长度）；无前缀原样返回"""
    _, prefix = _parse_cidr(val)
    return prefix if prefix is not None else val


def to_gw(val):
    """'10.1.0.0/24' -> '10.1.0.1'（子网内第一个可用地址，推断语义）"""
    ip, prefix = _parse_cidr(val)
    base = _to_int(ip)
    if prefix is not None:
        base = base & _mask_int(prefix)
    return _to_ip(base + 1)


def to_peer(val, peer_rule=None, context=None):
    """设备序号 -> 对端设备序号。

    默认按奇偶配对：(1,2),(3,4)...（to_peer(1)=2, to_peer(2)=1）。
    可用 context['peer_map'] 显式覆盖（如 MLAG 配对）。
    """
    v = int(val)
    if context and context.get('peer_map') and v in context['peer_map']:
        return context['peer_map'][v]
    if peer_rule == 'identity':
        return v
    return v + 1 if v % 2 == 1 else v - 1


def to_link_local(val):
    """链路本地地址推导（推断语义，P0.5 占位返回原值）。"""
    return str(val)


def to_role(val, mapping=None):
    """角色名映射（如 'BD'->'LEAF'）；无映射原样返回。"""
    if mapping and str(val) in mapping:
        return mapping[str(val)]
    return str(val)


def renumber(val, start=1, step=1):
    """序号重排：val 为从 1 起的序号，映射到 start + (val-1)*step。"""
    try:
        v = int(val)
    except (TypeError, ValueError):
        return val
    return int(start) + (v - 1) * int(step)


def get_portname(val):
    """端口名（'Te0/1' -> 返回自身，推断语义占位）。"""
    return str(val)


def get_portnum(val):
    """端口号提取（推断语义占位，如 '1/0/1' -> '1'）。"""
    return str(val)


def get_port(val):
    """端口提取（推断语义占位）。"""
    return str(val)


def to_port(val):
    """端口（推断语义占位）。"""
    return str(val)


def split(val, sep=None):
    """按分隔符切分字符串（对应参考模板 |split:"." 用法）。"""
    s = str(val)
    return s.split(sep) if sep is not None else s.split()


# ---------------------------------------------------------------------------
# 函数（模板侧：modify_ip(...) / add_int(...) 等）
# ---------------------------------------------------------------------------


def modify_ip(ip_str, offset=None, count=None):
    """IP 偏移：ip + offset（推断语义，网关计算用）。

    - 单参形式 modify_ip(expr)（expr 已含过滤器推导）→ 返回原值；
    - 三参形式 modify_ip(network, 4, 1) -> network+4。count 暂不参与。
    """
    if offset is None:
        return str(ip_str)
    return _to_ip(_to_int(str(ip_str)) + int(offset))


def add_int(val, delta):
    return int(val) + int(delta)


def sub_int(val, delta):
    return int(val) - int(delta)


def key_exist(var_name, context=None):
    """键存在性判断：context['keys'] 为可用意图变量名集合。"""
    if not context:
        return False
    return str(var_name) in (context.get('keys') or set())


def _resolve_list(var_name, context):
    """取列表值：优先按「场景命名空间」取（{scenario}_{name}），
    其次扁平 lists，最后 globals（逗号串切分）。"""
    if not context:
        return []
    lists = context.get('lists', {})
    scenario = context.get('scenario') or ''
    if scenario:
        scoped = lists.get(f'{scenario}_{var_name}')
        if scoped is not None:
            return list(scoped)
    if var_name in lists:
        return list(lists[var_name])
    globals_ = context.get('globals', {})
    val = globals_.get(var_name)
    if isinstance(val, str) and (',' in val or '\n' in val):
        sep = '\n' if '\n' in val and ',' not in val else ','
        return [v.strip() for v in val.split(sep) if v.strip() != '']
    if isinstance(val, (list, tuple)):
        return list(val)
    if val is None or val == '':
        return []
    return [val]


def iter_list_func(var_name, context=None):
    """列表参数迭代：lists/globals（逗号切分）-> list。"""
    return _resolve_list(str(var_name), context)


def iter_obj_func(*var_names, context=None):
    """多参数关联迭代：zip 对齐各列表元素 -> dict 列表（item.xxx 取值）。"""
    rows = [_resolve_list(str(n), context) for n in var_names]
    if not rows or any(not r for r in rows):
        return []
    return [dict(zip(var_names, values)) for values in zip(*rows)]


# ---------------------------------------------------------------------------
# 注册到 Jinja2 环境
# ---------------------------------------------------------------------------

# 需要注册为 Jinja2 filter 的名字 -> 函数
FILTERS = {
    'to_ip': to_ip,
    'to_mask': to_mask,
    'to_wildcard': to_wildcard,
    'to_network': to_network,
    'to_length': to_length,
    'to_gw': to_gw,
    'to_peer': to_peer,
    'to_link_local': to_link_local,
    'to_role': to_role,
    'renumber': renumber,
    'get_portname': get_portname,
    'get_portnum': get_portnum,
    'get_port': get_port,
    'to_port': to_port,
    'split': split,
    'first': lambda seq: seq[0] if hasattr(seq, '__getitem__') and len(seq) else None,
    'last': lambda seq: seq[-1] if hasattr(seq, '__getitem__') and len(seq) else None,
    'integer': int,
    'length_is': lambda val, n: len(val) == int(n) if hasattr(val, '__len__') else False,
}

# 需要注册为 Jinja2 function（全局可调用）的名字 -> 函数
FUNCTIONS = {
    'modify_ip': modify_ip,
    'add_int': add_int,
    'sub_int': sub_int,
    'key_exist': key_exist,
    'iter_list_func': iter_list_func,
    'iter_obj_func': iter_obj_func,
}


def register(env):
    """把过滤器与函数注册到 Jinja2 Environment/SandboxedEnvironment。

    to_peer / key_exist 等需要 context 的函数通过闭包绑定 context。
    """
    # 简单过滤器直接注册
    for name, fn in FILTERS.items():
        env.filters[name] = fn
    # 需要 context 的函数/过滤器用闭包包裹
    from .resolver import IntentContext

    ctx_holder = {}

    def _with_ctx(fn):
        def wrapper(*args, **kwargs):
            kwargs['context'] = ctx_holder.get('context')
            return fn(*args, **kwargs)
        return wrapper

    for name, fn in FUNCTIONS.items():
        env.globals[name] = _with_ctx(fn)

    return ctx_holder
