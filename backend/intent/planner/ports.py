"""
端口规划引擎（FR-B.2）。

按华三端口编号生成各角色端口布局，全接口带 description：
- 参数 Leaf（S9827）：1-32 400G **1分2**→200G GPU（TwoHundredGigE1/0/1:1..32:2）；33-64 400G 上联 Spine
- 参数 Spine（S9827）：400G 上联 Leaf
- 存储 Leaf/Spine（S9825-128B）：200G（存储下联 + 上联）
- 业务 ACC：25G 业务下联（MLAG 接入口）+ **100G 上联 AGG**
- 业务 AGG：**100G 下联 ACC** + 上联
- 带外 ACC/AGG：1G 下联（access vlan）+ 上联（trunk）
"""


def _join(prefix, n):
    return f'{prefix}{n}'


class PortPlanner:
    """端口规划器：按角色生成端口清单 + 终端描述。"""

    # ---- 参数网 ----
    @staticmethod
    def leaf_gpu_ports(gpu_down: int = 64) -> list:
        """参数 Leaf 400G 1分2 → 200G GPU 口（从 1 口起）。"""
        # gpu_down 个 200G 口 = gpu_down//2 个 400G 分光口，每口 2 子口
        split = gpu_down // 2
        return [f'TwoHundredGigE1/0/{p}:{s}' for p in range(1, split + 1) for s in (1, 2)]

    @staticmethod
    def leaf_uplink_ports(uplink: int = 32) -> list:
        """参数 Leaf 上联 Spine：400G 从 33 口起（对齐华三 S9825）。"""
        return [f'FourHundredGigE1/0/{33 + i}' for i in range(uplink)]

    @staticmethod
    def spine_uplink_ports(count: int) -> list:
        """参数 Spine 上联 Leaf：400G 从 1 口起。"""
        return [f'FourHundredGigE1/0/{i + 1}' for i in range(count)]

    # ---- 存储网 ----
    @staticmethod
    def sto_leaf_down_ports(n: int) -> list:
        """存储 Leaf 200G 存储下联口（从 1 口起）。"""
        return [f'TwoHundredGigE1/0/{i}' for i in range(1, n + 1)]

    @staticmethod
    def sto_uplink_ports(count: int, start: int = 33) -> list:
        """存储上联 200G 口（从 33 起）。"""
        return [f'TwoHundredGigE1/0/{start + i}' for i in range(count)]

    # ---- 业务网 ----
    @staticmethod
    def biz_acc_down_ports(n: int) -> list:
        """业务 ACC 25G 业务下联口（从 1 口起）。"""
        return [f'Twenty-FiveGigE1/0/{i}' for i in range(1, n + 1)]

    @staticmethod
    def biz_uplink_ports(count: int) -> list:
        """业务 ACC/AGG 上联 **100G** 口。"""
        return [f'HundredGigE1/0/{i}' for i in range(1, count + 1)]

    @staticmethod
    def biz_agg_down_ports(count: int) -> list:
        """业务 AGG **100G 下联 ACC** 口。"""
        return [f'HundredGigE1/0/{i}' for i in range(1, count + 1)]

    # ---- 带外网 ----
    @staticmethod
    def oob_down_ports(n: int) -> list:
        """带外 1G 下联口（BMC/ILO）。"""
        return [f'GigabitEthernet1/0/{i}' for i in range(1, n + 1)]

    @staticmethod
    def oob_uplink_ports(count: int) -> list:
        """带外上联 1G 口（trunk 透传）。"""
        return [f'GigabitEthernet1/0/{24 + i}' for i in range(count)]

    # ---- 终端描述 ----
    @staticmethod
    def gpu_desc(rack: str, idx: int) -> str:
        return f'GPU-{rack}-{idx:02d}'

    @staticmethod
    def terminal_desc(role: str, rack: str, idx: int) -> str:
        return f'{role}-{rack}-{idx:02d}'
