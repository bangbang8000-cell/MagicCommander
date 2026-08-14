"""
VLAN / 网关规划引擎（FR-B.3）。

- 各平面 VLAN 段（F14）：计算 100-199 / 存储 200-299 / 业务 300-399 / 带外 400-499；
- **按组分配**：同组 ACC 同 VLAN，组间可复用或更换；
- 每 Leaf/ACC 生成 Vlan-interface 网关；
- OOB 下行口分配 access VLAN。
"""


class VlanPlanner:
    """VLAN 规划器：按组分配 VLAN + 网关。"""

    def __init__(self):
        self._counters = {'compute': 100, 'storage': 200, 'biz': 300, 'oob': 400}

    def group_vlans(self, plane: str, per_group: int = 1, reuse: bool = False) -> list:
        """分配一组 VLAN（按组，组间可复用/更换）。

        - per_group 个 VLAN/组；
        - reuse=False：每组新段（组间更换）；reuse=True：同段复用（需调用方按组缓存）。
        """
        start = self._counters[plane]
        vlans = list(range(start, start + per_group))
        if not reuse:
            self._counters[plane] += per_group
        return vlans

    def gateway_pool_base(self, plane: str) -> str:
        """各平面网关网段基址（10.1.x.0/24，由地址规划器按序分配）。"""
        # 实际网段由 AddressPlanner 分配，本方法仅为说明
        return {'compute': '10.1.16.0/20', 'storage': '10.1.32.0/20',
                'biz': '10.1.48.0/20', 'oob': '10.1.64.0/21'}[plane]
