# 接入交换机配置示例

这是一个 MagicCommander 示例项目，用于演示如何通过 Excel + Jinja2 模板生成一台接入交换机的开局配置。

## 后端渲染规则

MagicCommander 当前按设备的“角色”字段选择模板：

- `excel/hostname.xlsx` 的 `角色` 字段为 `ASW`
- 渲染时会加载 `templates/ASW.j2`
- 模板中通过 `info['字段名']` 读取 Excel 汇总后的设备数据

因此，如果你把角色改成 `CORE`，就需要同步创建 `templates/CORE.j2`。

## 文件说明

- `para.xlsx`：声明后端要读取哪些 Excel、Sheet，以及读取类型。
- `excel/hostname.xlsx`：设备基础信息，包括设备名、角色、管理接口、管理 IP、SN。
- `excel/connection.xlsx`：示例接入口信息，包括接口名、终端名称、接入 VLAN。
- `excel/ipaddress.xlsx`：管理三层接口和管理 VLAN 信息。
- `excel/parameter.xlsx`：全局参数，如本地账号、SSH、NTP、Syslog、默认路由。
- `templates/ASW.j2`：接入交换机配置模板。

## 使用步骤

1. 在软件中选择该项目。
2. 查看或修改 `excel/*.xlsx` 中的示例参数。
3. 点击“渲染配置”，或在命令行执行：`python main.py render project <项目ID>`。
4. 到 `output/时间戳/ASW/` 查看生成的配置文件。
5. 到 `yaml/时间戳/ASW/` 查看中间 YAML 数据。

## 字段设计说明

当前后端会把同一台设备的多张表数据合并到一个 `info` 字典中。不同表里如果出现同名字段，后读取的值可能覆盖先读取的值。

所以本示例特意区分了：

- `接入VLAN`：用于接入口 `port access vlan`
- `管理VLAN`：用于管理 VLAN 和管理接口

请尽量避免在不同 Excel 表中重复使用含义不同的同名字段。

## 示例配置包含

- 设备名称
- 管理 VLAN
- 接入 VLAN
- 管理 IP
- 接入口描述
- 本地用户账号和密码
- SSH 服务
- NTP
- Syslog
- SNMP 简单示例
- 默认路由

## 安全提示

本示例账号和密码仅用于演示：

- 示例账号：`netadmin`
- 示例密码：`ChangeMe_123`

请勿在生产网络中直接使用示例密码。实际部署时，请按设备厂商要求使用加密口令、强密码策略、AAA/RADIUS/TACACS+ 等安全机制。

## 当前限制

第一版示例只放一条典型接入口。当前 `赋值表` 对同一台设备的多行普通字段不天然形成接口列表，后续如需批量生成多个接入口，建议进一步增强后端数据结构或使用可嵌套的表结构。
