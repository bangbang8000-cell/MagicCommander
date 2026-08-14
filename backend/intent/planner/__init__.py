"""
AIDC 规划引擎（P1.1，AIDC 程序优化 PRD FR-B）。

用程序正确计算 地址 / 端口 / VLAN / 接线 规划，杜绝硬编码溢出。
- address.py  地址规划（ipaddress 正规分配，0-255 合法、跨 /24 自动进位）
- ports.py    端口规划（对齐华三端口编号 + 全接口 description）
- vlans.py    VLAN/网关规划（按组分配、同组同 VLAN、每 Leaf/ACC 网关）
- pilot_builder.py 用本引擎重建 64 台试点参数集

说明：本包为通用规划能力，不包含参考资产内容。
"""
