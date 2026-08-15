"""
地址规划引擎（FR-B.1）。

用 ipaddress 正规分配，保证：
- 子网内地址 0-255 合法（跨 /24 自动进位，如 10.1.0.301 -> 10.1.1.45 由 ipaddress 处理）；
- 按池（环回/管理/计算网关/存储网关/业务网关/带外/互联）分段分配；
- 幂等：同输入 -> 同输出。

各池默认段（F10 10.1.0.0/16 裂解）：
- 环回     10.1.0.0/20
- 计算网关 10.1.16.0/20
- 存储网关 10.1.32.0/20
- 业务网关 10.1.48.0/20
- 带外/管理 10.1.64.0/21
- 互联    10.1.72.0/21  （/31 点对点）
"""

import ipaddress


class AddressPool:
    """顺序地址池：从 network+1 开始取主机地址，跨 /24 自动进位。

    支持：
    - `reserved`：预留地址集合（分配器账本 allocator_state.json 的 reserved），分配时跳过；
    - `allocated`：本次运行已分配日志（供状态持久化）。
    """

    def __init__(self, base_net: str, start_offset: int = 0, reserved=()):
        self._net = ipaddress.ip_network(base_net)
        self._cursor = int(self._net.network_address) + 1 + start_offset
        self._end = int(self._net.broadcast_address)
        self._name = base_net
        self._reserved = {int(ipaddress.ip_address(x)) for x in reserved if x}
        self.allocated = []

    def take(self, count: int = 1):
        """取 count 个地址，返回 IP 字符串列表（跳过预留地址）。"""
        addrs = []
        while len(addrs) < count:
            if self._cursor >= self._end:
                raise ValueError(f'地址池 {self._name} 地址耗尽（已到 {self._cursor}）')
            if self._cursor in self._reserved:
                self._cursor += 1
                continue
            addrs.append(str(ipaddress.ip_address(self._cursor)))
            self._cursor += 1
        self.allocated.extend(addrs)
        return addrs

    def take_ip(self):
        return self.take(1)[0]

    def alloc_link(self, prefix: int = 31):
        """分配一个点对点链路：同一网段内两个地址（/31 = (2k, 2k+1)）。

        游标通过 `strict=False` 对齐到包含当前地址的网段边界（网络地址），
        返回 (network_address, broadcast_address)，随后跳过整个网段（步进 prefix 粒度）。
        若网段内任一端点在预留表中，跳过整个网段。

        天然保证两条不变量：
        - 链路两端同网段（修复跨 /31 对齐 bug：10.1.72.1/31 与 10.1.72.2/31 不在同一网段）；
        - 地址零冲突（每网段只分配一次，对端不再侵占下一条链路的己端）。
        """
        while True:
            net = ipaddress.ip_network(f'{ipaddress.ip_address(self._cursor)}/{prefix}', strict=False)
            if int(net.broadcast_address) >= self._end:
                raise ValueError(f'地址池 {self._name} 地址耗尽（{prefix} 点对点）')
            a, b = int(net.network_address), int(net.broadcast_address)
            self._cursor = b + 1
            if a in self._reserved or b in self._reserved:
                continue  # 该网段含预留地址，跳过
            out = (str(net.network_address), str(net.broadcast_address))
            self.allocated.append(out)
            return out


_DEFAULT_SEGMENTS = {
    'loopback': '10.1.0.0/20',
    'compute': '10.1.16.0/20',
    'storage': '10.1.32.0/20',
    'biz': '10.1.48.0/20',
    'oob': '10.1.64.0/21',
    'interconnect': '10.1.72.0/21',
}

# 池 → 地址段 key（网关池三段与 macro.ipSegments 键名对应）
_POOL_SEG_KEY = {
    'loopback': 'loopback', 'oob_mgmt': 'oob', 'interconnect': 'interconnect',
    'compute_gw': 'compute', 'storage_gw': 'storage', 'biz_gw': 'biz',
}


class AddressPlanner:
    """AIDC 地址规划器：按用途分配地址，产出设备级参数。

    支持从 allocator 状态覆盖地址段（segments）与预留（reserved），
    满足"换段改配置重跑 + 预留跳过"（D23）。
    """

    def __init__(self, segments=None, reserved=None):
        seg = {**_DEFAULT_SEGMENTS, **(segments or {})}
        res = reserved or {}
        # 各池（F10 默认段；可被 allocator 状态覆盖）
        self.loopback = AddressPool(seg['loopback'], reserved=res.get('loopback', ()))
        self.compute_gw = AddressPool(seg['compute'], reserved=res.get('compute', ()))
        self.storage_gw = AddressPool(seg['storage'], reserved=res.get('storage', ()))
        self.biz_gw = AddressPool(seg['biz'], reserved=res.get('biz', ()))
        self.oob_mgmt = AddressPool(seg['oob'], reserved=res.get('oob', ()))
        self.interconnect = AddressPool(seg['interconnect'], reserved=res.get('interconnect', ()))
        self._used = {}

    @property
    def segments(self):
        """当前生效的地址段（供状态持久化）。"""
        return {v: getattr(self, k)._name for k, v in _POOL_SEG_KEY.items()}

    def allocated(self):
        """本次分配日志（{seg_key: [...allocated]}，供状态持久化）。"""
        return {v: getattr(self, k).allocated for k, v in _POOL_SEG_KEY.items()}

    def alloc_loopback(self, n: int = 1):
        """分配 n 个环回地址。"""
        return self.loopback.take(n)

    def alloc_mgmt(self, n: int = 1):
        """分配 n 个管理地址。"""
        return self.oob_mgmt.take(n)

    def alloc_interconnect_pair(self):
        """分配一个 /31 点对点对，返回 (本地, 对端)。同网段（网段感知，地址分配引擎修复）。"""
        return self.interconnect.alloc_link(31)

    def alloc_gateway(self, pool_name: str, prefix: int = 24):
        """从指定网关池分配一个网关地址。"""
        pool = {'compute': self.compute_gw, 'storage': self.storage_gw,
                'biz': self.biz_gw}[pool_name]
        ip = pool.take_ip()
        net = ipaddress.ip_network(f'{ip}/{prefix}', strict=False)
        return str(net.network_address), str(net.netmask)

    def alloc_network(self, pool_name: str, prefix: int = 24):
        """从指定池分配一个子网（网关 + 网络），返回 (net_addr, mask)。"""
        return self.alloc_gateway(pool_name, prefix)


# 便捷单例
def default_planner() -> AddressPlanner:
    return AddressPlanner()
