# 完善模板

## 执行步骤
1. read_file 读取模板
2. 分析缺失的标准模块（VLAN/SNMP/NTP/日志/AAA/SSH）
3. write_text_file 补充缺失模块

## 标准模块检查清单
- VLAN 配置、管理接口、SNMP、NTP、日志服务器、AAA/TACACS、本地用户+SSH