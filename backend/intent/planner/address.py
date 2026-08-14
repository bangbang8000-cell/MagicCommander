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
    """顺序地址池：从 network+1 开始取主机地址，跨 /24 自动进位。"""

    def __init__(self, base_net: str, start_offset: int = 0):
        self._net = ipaddress.ip_network(base_net)
        self._cursor = int(self._net.network_address) + 1 + start_offset
        self._end = int(self._net.broadcast_address)
        self._name = base_net

    def take(self, count: int = 1):
        """取 count 个地址，返回 IP 字符串列表。"""
        addrs = []
        for _ in range(count):
            if self._cursor >= self._end:
                raise ValueError(f'地址池 {self._name} 地址耗尽（已到 {self._cursor}）')
            addrs.append(str(ipaddress.ip_address(self._cursor)))
            self._cursor += 1
        return addrs

    def take_ip(self):
        return self.take(1)[0]


class AddressPlanner:
    """AIDC 地址规划器：按用途分配地址，产出设备级参数。"""

    def __init__(self):
        # 各池（F10 默认段）
        self.loopback = AddressPool('10.1.0.0/20')
        self.compute_gw = AddressPool('10.1.16.0/20')   # 计算网 VLAN 网关
        self.storage_gw = AddressPool('10.1.32.0/20')   # 存储网 VLAN 网关
        self.biz_gw = AddressPool('10.1.48.0/20')       # 业务网 VLAN 网关
        self.oob_mgmt = AddressPool('10.1.64.0/21')     # 带外/管理
        self.interconnect = AddressPool('10.1.72.0/21') # 互联 /31
        self._used = {}

    def alloc_loopback(self, n: int = 1):
        """分配 n 个环回地址。"""
        return self.loopback.take(n)

    def alloc_mgmt(self, n: int = 1):
        """分配 n 个管理地址。"""
        return self.oob_mgmt.take(n)

    def alloc_interconnect_pair(self):
        """分配一个 /31 点对点对，返回 (本地, 对端)。"""
        addrs = self.interconnect.take(2)
        return addrs[0], addrs[1]

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
