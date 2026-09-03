# 多角色交换机配置示例（example2）

这是一个 MagicCommander 示例项目，演示如何通过 Excel + Jinja2 模板为**三种角色**的交换机生成开局配置：
接入交换机（ASW）、核心交换机（PSW）、汇聚交换机（DOA）。

与 example1（单角色 ASW）不同，本示例覆盖多角色 + 对称表（互联关系/聚合接口/IP 互联地址），
用于验证「一张表两端配置」与聚合链路的渲染。

## 后端渲染规则

MagicCommander 按设备的「角色」字段选择模板：

- `excel/hostname.xlsx` 的 `角色` 字段为 `ASW` / `PSW` / `DOA`
- 渲染时会加载 `templates/ASW.j2` / `templates/PSW.j2` / `templates/DOA.j2`
- 模板中通过 `info['字段名']` 读取 Excel 汇总后的设备数据

因此，如果你把角色改成 `CORE`，就需要同步创建 `templates/CORE.j2`。

## 文件说明

- `para.xlsx`：声明后端要读取哪些 Excel、Sheet，以及读取类型（赋值表 / 对称表 / 参数表）。
- `excel/hostname.xlsx`：设备基础信息，包括设备名、型号、角色、管理接口、管理 IP。
- `excel/connection.xlsx`：互联关系表（对称表）、聚合接口表（对称表）、终端连接表。
- `excel/ipaddress.xlsx`：IP 互联地址表（对称表，/31 对端）、网关地址表。
- `excel/parameter.xlsx`：全局参数，如 AAA、SSH、NTP、Syslog、SNMP。
- `templates/ASW.j2`：接入交换机配置模板。
- `templates/PSW.j2`：核心交换机配置模板。
- `templates/DOA.j2`：汇聚交换机配置模板。

## 使用步骤

1. 在软件中选择该项目。
2. 查看或修改 `excel/*.xlsx` 中的示例参数。
3. 点击“渲染配置”，或在命令行执行：`python main.py render project <项目ID>`。
4. 到 `output/时间戳/<角色>/` 查看生成的配置文件。
5. 到 `yaml/时间戳/<角色>/` 查看中间 YAML 数据。

## 字段设计说明

本示例使用对称表表达两端成对配置：

- `互联关系表`：一对接口两端各占一行（对称列 4），描述对端设备/接口/接口类型/线缆类型。
- `聚合接口表`：聚合口（如 Route-Aggregation 20）两端成对，含聚合口号与成员口。
- `IP互联地址表`：/31 互联地址两端成对（对称列 4），用于 L3 链路。

不同表里如果出现同名字段，后读取的值可能覆盖先读取的值，请避免跨表复用同名字段。

## 为什么本示例没有 plan.json

`plan.json`（plan:table v1.2）是 AIDC 单项目四表格示例（`64H100-IB` / `64H100-RoCE` /
`128H100-IB` / `128H100-RoCE`）的溯源/回灌契约，其 `deviceList/connections/terminals`
建模面向 AIDC 四网合一拓扑（SPINE/LEAF/STO_*/BIZ_*/OOB_* 八角色、F14 VLAN 段、收敛比等）。

本示例为**老式 MC 原生模板项目**，存在以下不适配点，故**不附加 plan.json**：

- 角色集合为 `ASW/PSW/DOA`，不在 AIDC 八角色（`SPINE/LEAF/STO_SPINE/STO_LEAF/BIZ_AGG/
  BIZ_ACCESS/OOB_AGG/OOB_ACCESS`）之列，plan:table 契约不识别；
- 数据模型为「对称表」（互联关系/聚合接口/IP 互联地址两端成对），而 plan:table 的
  connections/terminals 为有向单侧建模，无法无损往返；
- 无 AIDC 桥接标识（source/projectType/bridgeVersion）与 macro（pfcQueue/收敛比等）语义。

如需 plan.json 溯源/回灌能力，请使用 AIDC 四表格示例作为起点。

## 安全提示

本示例账号和密码仅用于演示，请勿在生产网络中直接使用示例密码。
