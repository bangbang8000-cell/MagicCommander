"""预置 Jinja2 模板库（按设备类型/厂商分类，供智能创建项目使用）"""
# ====== 预置模板 ======

_TPL_HUAWEI_SWITCH = """{# Huawei Switch Template - 自动生成 #}
sysname {{ info['设备名'] }}

{# 管理接口 #}
interface {{ info.get('管理接口', 'M-GigabitEthernet0/0/0') }}
 ip address {{ info['管理IP'] }} {{ info['掩码'] }}

{# VLAN 配置 #}
vlan {{ info.get('VLAN', '100') }}
 description Management_VLAN

interface {{ info.get('网关接口', 'Vlanif100') }}
 description gateway_ip_of_vlan_{{ info.get('VLAN', '100') }}
 ip address {{ info['网关IP'] }} {{ info['网关掩码'] }}

{# SNMP #}
snmp-agent
snmp-agent community read {{ info['SNMP团体名'] }}
snmp-agent sys-info version v2c
snmp-agent trap enable
snmp-agent target-host trap address udp-domain {{ info['SNMP地址'] }} params securityname {{ info['SNMP团体名'] }}

{# NTP #}
ntp-service enable
ntp-service unicast-server {{ info.get('NTP地址', 'ntp.example.com') }}

{# 日志 #}
info-center enable
info-center loghost {{ info['LOGHOST地址'] }}

{# AAA #}
hwtacacs scheme {{ info['AAA名称'] }}
 primary authentication {{ info['AAA地址'] }}
 primary authorization {{ info['AAA地址'] }}
 primary accounting {{ info['AAA地址'] }}
 key authentication simple {{ info['AAA认证密钥'] }}
 key authorization simple {{ info['AAA认证密钥'] }}
 key accounting simple {{ info['AAA认证密钥'] }}
 user-name-format without-domain
 nas-ip {{ info['NAS_IP'] }}

domain {{ info['domain名称'] }}
 authentication login hwtacacs-scheme {{ info['AAA名称'] }} local
 authorization login hwtacacs-scheme {{ info['AAA名称'] }} local
 accounting login hwtacacs-scheme {{ info['AAA名称'] }} local

domain default enable {{ info['domain名称'] }}

{# 本地用户 #}
local-user {{ info['本地用户名'] }} class manage
 password simple {{ info['本地用户密钥'] }}
 service-type ssh terminal
 authorization-attribute user-role network-admin

ssh server enable
line vty 0 63
 authentication-mode scheme
 user-role network-admin
"""

_TPL_CISCO_SWITCH = """{# Cisco Switch Template - 自动生成 #}
hostname {{ info['设备名'] }}

{# 管理接口 #}
interface {{ info.get('管理接口', 'GigabitEthernet0/0') }}
 ip address {{ info['管理IP'] }} {{ info['掩码'] }}
 no shutdown

{# VLAN 配置 #}
vlan {{ info.get('VLAN', '100') }}
 name Management_VLAN

interface Vlan{{ info.get('VLAN', '100') }}
 description gateway_ip_of_vlan_{{ info.get('VLAN', '100') }}
 ip address {{ info['网关IP'] }} {{ info['网关掩码'] }}

{# SNMP #}
snmp-server community {{ info['SNMP团体名'] }} RO
snmp-server host {{ info['SNMP地址'] }} version 2c {{ info['SNMP团体名'] }}

{# NTP #}
ntp server {{ info.get('NTP地址', 'ntp.example.com') }}

{# 日志 #}
logging host {{ info['LOGHOST地址'] }}

{# AAA #}
aaa new-model
tacacs-server host {{ info['AAA地址'] }} key {{ info['AAA认证密钥'] }}
aaa authentication login default group tacacs+ local
aaa authorization exec default group tacacs+ local
aaa accounting exec default start-stop group tacacs+

{# 本地用户 #}
username {{ info['本地用户名'] }} privilege 15 secret {{ info['本地用户密钥'] }}

line vty 0 15
 login authentication default
 transport input ssh
"""

_TPL_HUAWEI_ROUTER = """{# Huawei Router Template - 自动生成 #}
sysname {{ info['设备名'] }}

{# 管理接口 #}
interface {{ info.get('管理接口', 'GigabitEthernet0/0/0') }}
 ip address {{ info['管理IP'] }} {{ info['掩码'] }}

{# 路由协议 #}
{% if info.get('路由协议', 'OSPF') == 'OSPF' %}
ospf 1 router-id {{ info['管理IP'] }}
 area 0.0.0.0
{% elif info.get('路由协议') == 'BGP' %}
bgp {{ info.get('AS号', '65001') }}
 router-id {{ info['管理IP'] }}
{% endif %}

{# SNMP #}
snmp-agent
snmp-agent community read {{ info['SNMP团体名'] }}
snmp-agent sys-info version v2c

{# NTP #}
ntp-service enable
ntp-service unicast-server {{ info.get('NTP地址', 'ntp.example.com') }}

{# AAA #}
hwtacacs scheme {{ info['AAA名称'] }}
 primary authentication {{ info['AAA地址'] }}
 key authentication simple {{ info['AAA认证密钥'] }}
 nas-ip {{ info['NAS_IP'] }}

local-user {{ info['本地用户名'] }} class manage
 password simple {{ info['本地用户密钥'] }}
 service-type ssh terminal
 authorization-attribute user-role network-admin

ssh server enable
"""

_TPL_CISCO_ROUTER = """{# Cisco Router Template - 自动生成 #}
hostname {{ info['设备名'] }}

interface {{ info.get('管理接口', 'GigabitEthernet0/0') }}
 ip address {{ info['管理IP'] }} {{ info['掩码'] }}
 no shutdown

{% if info.get('路由协议', 'OSPF') == 'OSPF' %}
router ospf 1
 router-id {{ info['管理IP'] }}
{% elif info.get('路由协议') == 'BGP' %}
router bgp {{ info.get('AS号', '65001') }}
 bgp router-id {{ info['管理IP'] }}
{% endif %}

snmp-server community {{ info['SNMP团体字'] }} RO
ntp server {{ info.get('NTP地址', 'ntp.example.com') }}

aaa new-model
tacacs-server host {{ info['AAA地址'] }} key {{ info['AAA认证密钥'] }}
username {{ info['本地用户名'] }} privilege 15 secret {{ info['本地用户密钥'] }}

line vty 0 15
 transport input ssh
"""

_TPL_HUAWEI_FIREWALL = """{# Huawei Firewall Template - 自动生成 #}
sysname {{ info['设备名'] }}

interface {{ info.get('管理接口', 'GigabitEthernet0/0/0') }}
 ip address {{ info['管理IP'] }} {{ info['掩码'] }}

firewall zone {{ info.get('安全域', 'Trust') }}
 set priority 85
 add interface {{ info.get('管理接口', 'GigabitEthernet0/0/0') }}

security-policy
 rule name {{ info.get('策略名称', 'default-policy') }}

snmp-agent
snmp-agent community read {{ info['SNMP团体名'] }}

hwtacacs scheme {{ info['AAA名称'] }}
 primary authentication {{ info['AAA地址'] }}
 key authentication simple {{ info['AAA认证密钥'] }}

local-user {{ info['本地用户名'] }} class manage
 password simple {{ info['本地用户密钥'] }}
 service-type ssh terminal
"""

_TPL_H3C_SWITCH = """{# H3C Switch Template - 自动生成 #}
sysname {{ info['设备名'] }}

interface {{ info.get('管理接口', 'M-GigabitEthernet0/0/0') }}
 ip address {{ info['管理IP'] }} {{ info['掩码'] }}

vlan {{ info.get('VLAN', '100') }}
 description Management

interface Vlan-interface{{ info.get('VLAN', '100') }}
 ip address {{ info['网关IP'] }} {{ info['网关掩码'] }}

snmp-agent
snmp-agent community read {{ info['SNMP团体名'] }}
snmp-agent sys-info version v2c

ntp-service enable
ntp-service unicast-server {{ info.get('NTP地址', 'ntp.example.com') }}

info-center enable
info-center loghost {{ info['LOGHOST地址'] }}

hwtacacs scheme {{ info['AAA名称'] }}
 primary authentication {{ info['AAA地址'] }}
 key authentication simple {{ info['AAA认证密钥'] }}
 nas-ip {{ info['NAS_IP'] }}

local-user {{ info['本地用户名'] }} class manage
 password simple {{ info['本地用户密钥'] }}
 service-type ssh terminal
 authorization-attribute user-role network-admin

ssh server enable
line vty 0 63
 authentication-mode scheme
"""

_TPL_GENERIC = """{# {vendor} {device_type} Template - 自动生成 #}
{description}

sysname {{ info['设备名'] }}

interface {{ info.get('管理接口', 'GigabitEthernet0/0/0') }}
 ip address {{ info['管理IP'] }} {{ info['掩码'] }}

snmp-agent
snmp-agent community read {{ info['SNMP团体名'] }}

local-user {{ info['本地用户名'] }} class manage
 password simple {{ info['本地用户密钥'] }}
 service-type ssh terminal

ssh server enable
"""




TEMPLATE_MAP = {
    ("switch", "huawei"): _TPL_HUAWEI_SWITCH,
    ("switch", "cisco"): _TPL_CISCO_SWITCH,
    ("router", "huawei"): _TPL_HUAWEI_ROUTER,
    ("router", "cisco"): _TPL_CISCO_ROUTER,
    ("firewall", "huawei"): _TPL_HUAWEI_FIREWALL,
    ("switch", "h3c"): _TPL_H3C_SWITCH,
}
