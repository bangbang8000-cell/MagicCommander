# 二层最大-2048卡-QM9700-IB

二层最大 A：256 台 H200 / 2048 卡，NVIDIA QM9700 k=64 == 上限，IB 二层（PRD 场景④）

**状态**：已导入（W6.4，源 = AutoLink 交付包）。

- `plan.json`：AL 源文件保留（回导一致，含 planHash 溯源）。
- `para.xlsx` + `excel/`：四网工作表（设备表 / 终端连接表 / VLAN 网关表 / IP 规划地址表 / 环回 / 网段 / 参数表）。
- `templates/`：渲染产物。IB 场景参数/存储网（fabric）交换机不产出 j2（配置在 IB 子网管理器侧，S4 分流）；RoCE 场景 SPINE/LEAF 为 SONiC/UXOS 命令族（X400 基准，待现网校准）。
- 可调参数：PFC队列 / CNP队列（0-7）。
