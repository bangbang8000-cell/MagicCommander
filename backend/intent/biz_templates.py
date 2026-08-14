"""
意图参数适配器 —— 业务&管理网模板（P1 试点，自研改造）。

命令风格借参考2（LA→BIZ_ACCESS 接入、LC→BIZ_AGG 汇聚），华三 Comware 语法，
排除 TCE 特有角色；业务&管理网合 1（F15）：
- BIZ_ACCESS（接入层，2×25G 业务口）：聚合上联 BIZ_AGG + 业务接入 VLAN + 网关
- BIZ_AGG（汇聚层）：承载带内管理（mgt_vrf / AAA / NTP / SNMP / SSH）

意图风格（[[ID]] / iter_obj_func / para 全局参数），经 normalizer 展开。
"""

from .resolver import IntentContext

# 业务&管理网（合1）默认参数（EBGP + ECMP，2026-08-13）
BIZ_DEFAULTS = {
    'biz_bgp_max_paths': 16,
}


# ---------------------------------------------------------------------------
# BIZ_ACCESS（接入层，借 LA 改造；同组 ACC 间 MLAG，上联 EBGP+ECMP）
# ---------------------------------------------------------------------------
BIZ_ACCESS_TEMPLATE = """# 业务&管理网 接入层（BIZ_ACCESS，2×25G 业务口）
sysname {{hostname_hostname_B_BIZACC[[ID]]}}
#
clock timezone Beijing add 08:00:00
#
lldp global enable
#
# 同组 ACC 间 MLAG（H3C 直接 MLAG 配置，参考 LA 模板；2026-08-13 DRNI→MLAG）
{%- if mlag_pair %}
ip vpn-instance keepalive
#
stp global enable
stp bpdu-protection
#
mlag system-mac 0001-0001-000{{mlag_pair}}
mlag system-number {{mlag_system_number}}
mlag keepalive ip destination {{mlag_peer_keepalive}} source {{mlag_keepalive}} vpn-instance keepalive
#
{%- endif %}
# 业务接入口（2×25G，access vlan，MLAG 接入口 + description）
{%- for item in iter_obj_func("biz_port[[ID]]", "biz_vlan[[ID]]", "biz_desc[[ID]]") %}
interface {{item.biz_port[[ID]]}}
 port link-mode bridge
 description {{item.biz_desc[[ID]]}}
 port access vlan {{item.biz_vlan[[ID]]}}
 stp edged-port
{%- if mlag_pair %}
 port s-mlag group {{mlag_pair}}
{%- endif %}
#
{%- endfor %}
# 业务网关
{%- for item in iter_obj_func("vlan_id[[ID]]", "vlan_gw[[ID]]") %}
interface Vlan-interface{{item.vlan_id[[ID]]}}
 ip address {{item.vlan_gw[[ID]]}} 255.255.255.0
#
{%- endfor %}
# 上联互联（100G，到 BIZ_AGG，/31，EBGP 邻居）
{%- for item in iter_obj_func("uplink_port[[ID]]", "uplink_ip[[ID]]", "uplink_desc[[ID]]") %}
interface {{item.uplink_port[[ID]]}}
 port link-mode route
 description {{item.uplink_desc[[ID]]}}
 ip address {{item.uplink_ip[[ID]]}} 255.255.255.254
#
{%- endfor %}
#
router bgp {{hostname_hostname_E_BIZACC[[ID]]}}
 bgp router-id {{ipv4_LoopBack_P_BIZACC[[ID]]|to_ip}}
 bgp log-neighbor-changes
 maximum-paths ebgp {{biz_bgp_max_paths}}
{%- for item in iter_obj_func("bgp_peer_ip[[ID]]", "bgp_peer_as[[ID]]") %}
 neighbor {{item.bgp_peer_ip[[ID]]}} as-number {{item.bgp_peer_as[[ID]]}}
{%- endfor %}
 address-family ipv4
  network {{ipv4_LoopBack_P_BIZACC[[ID]]|to_ip}} mask 255.255.255.255
{%- for item in iter_obj_func("gw_net[[ID]]", "gw_mask[[ID]]") %}
  network {{item.gw_net[[ID]]}} mask {{item.gw_mask[[ID]]}}
{%- endfor %}
{%- for item in iter_obj_func("bgp_peer_ip[[ID]]") %}
  neighbor {{item.bgp_peer_ip[[ID]]}} activate
{%- endfor %}
  exit-address-family
#
# 接入管理面（最小）：SNMP read / 本地账号 / SSH
snmp-agent
snmp-agent community read {{para_para_C_COMMUNITY}}
#
local-user {{para_para_C_LOCAL-USER}} class manage
 password simple {{para_para_C_LOCAL-PASSWORD}}
 service-type ssh terminal
#
ssh server enable
"""


# ---------------------------------------------------------------------------
# BIZ_AGG（汇聚层，借 LC 简化，承载带内管理；下联 EBGP+ECMP）
# ---------------------------------------------------------------------------
BIZ_AGG_TEMPLATE = """# 业务&管理网 汇聚层（BIZ_AGG，承载带内管理）
sysname {{hostname_hostname_B_BIZAGG[[ID]]}}
#
clock timezone Beijing add 08:00:00
#
ip vpn-instance mgt_vrf
 route-distinguisher 2:1
#
lldp global enable
#
# 100G 下联 ACC（description）
{%- for item in iter_obj_func("downlink_port[[ID]]", "downlink_desc[[ID]]") %}
interface {{item.downlink_port[[ID]]}}
 port link-mode route
 description {{item.downlink_desc[[ID]]}}
#
{%- endfor %}
# 上联互联（到 BIZ_ACC/上联，/31，EBGP 邻居）
{%- for item in iter_obj_func("uplink_port[[ID]]", "uplink_ip[[ID]]", "uplink_desc[[ID]]") %}
interface {{item.uplink_port[[ID]]}}
 port link-mode route
 link-delay up 2
 description {{item.uplink_desc[[ID]]}}
 ip address {{item.uplink_ip[[ID]]}} 255.255.255.254
#
{%- endfor %}
#
router bgp {{hostname_hostname_E_BIZAGG[[ID]]}}
 bgp router-id {{ipv4_LoopBack_P_BIZAGG[[ID]]|to_ip}}
 bgp log-neighbor-changes
 maximum-paths ebgp {{biz_bgp_max_paths}}
{%- for item in iter_obj_func("bgp_peer_ip[[ID]]", "bgp_peer_as[[ID]]") %}
 neighbor {{item.bgp_peer_ip[[ID]]}} as-number {{item.bgp_peer_as[[ID]]}}
{%- endfor %}
 address-family ipv4
  network {{ipv4_LoopBack_P_BIZAGG[[ID]]|to_ip}} mask 255.255.255.255
{%- for item in iter_obj_func("bgp_peer_ip[[ID]]") %}
  neighbor {{item.bgp_peer_ip[[ID]]}} activate
{%- endfor %}
  exit-address-family
#
# 管理口（带内 mgt_vrf）
interface M-GigabitEthernet0/0/0
 ip binding vpn-instance mgt_vrf
 ip address {{ipv4_M-ILO_P_BIZAGG[[ID]]}} 255.255.255.0
#
# AAA（带内管理，TACACS）
{%- if para_para_C_AAA1 %}
hwtacacs scheme {{para_para_C_TACACS-NAME}}
 primary authentication {{para_para_C_AAA1}}
 primary authorization {{para_para_C_AAA1}}
 primary accounting {{para_para_C_AAA1}}
 key authentication simple {{para_para_C_AAA-PASSWORD}}
 user-name-format without-domain
#
domain {{para_para_C_TACACS-DOMAIN}}
 authentication login hwtacacs-scheme {{para_para_C_TACACS-NAME}} local
 authorization login hwtacacs-scheme {{para_para_C_TACACS-NAME}} local
#
{%- endif %}
# 本地账号
local-user {{para_para_C_LOCAL-USER}} class manage
 password simple {{para_para_C_LOCAL-PASSWORD}}
 service-type ssh terminal
#
# NTP / SNMP / 日志（带内管理）
{%- for item in iter_list_func("para_para_C_NTP") %}
ntp-service unicast-server {{item}}
{%- endfor %}
#
snmp-agent
snmp-agent community read {{para_para_C_COMMUNITY}}
{%- if para_para_C_NMS-TGW-VIP %}
snmp-agent target-host trap address udp-domain {{para_para_C_NMS-TGW-VIP}} params securityname {{para_para_C_COMMUNITY}}
{%- endif %}
#
info-center enable
{%- if para_para_C_NMS-TGW-VIP %}
info-center loghost {{para_para_C_NMS-TGW-VIP}}
{%- endif %}
#
ssh server enable
"""


# ---------------------------------------------------------------------------
# 上下文
# ---------------------------------------------------------------------------
def build_biz_context(agg_count=2, acc_count=4, biz_ports_per_acc=4,
                      uplink_per_acc=2, uplink_per_agg=2) -> IntentContext:
    """构造业务&管理网意图上下文。

    - agg_count 台 BIZ_AGG（汇聚）；acc_count 台 BIZ_ACCESS（接入）
    - 每 ACC：biz_ports_per_acc 个业务口 + uplink_per_acc 个上联
    - 每 AGG：uplink_per_agg 个上联 + downlink 到各 ACC
    """
    ctx = IntentContext()
    ctx.globals = dict(BIZ_DEFAULTS)
    ctx.globals.update({
        'para_para_C_AAA1': '10.10.10.10',
        'para_para_C_AAA-PASSWORD': 'Aa@12345',
        'para_para_C_TACACS-NAME': 'tac_biz',
        'para_para_C_TACACS-DOMAIN': 'bj01.corp',
        'para_para_C_LOCAL-USER': 'admin',
        'para_para_C_LOCAL-PASSWORD': 'Aa@12345',
        'para_para_C_NTP': '10.200.0.1,10.200.0.2',
        'para_para_C_COMMUNITY': 'mc-biz',
        'para_para_C_NMS-TGW-VIP': '10.10.10.100',
    })
    ctx.scenario = 'BIZ'
    ctx.device_params = {}
    ctx.lists = {}

    import ipaddress

    def _adj(ip_str):
        try:
            return str(ipaddress.ip_address(ip_str) + 1)
        except Exception:  # noqa: BLE001
            return ''

    def _gw_netmask(gw):
        net = ipaddress.ip_network(f'{gw}/24', strict=False)
        return str(net.network_address), str(net.netmask)

    # BIZ_AGG（汇聚，AS 65601..，对端=ACC 65501..；100G 下行）
    for n in range(1, agg_count + 1):
        scn = 'BIZAGG'
        ctx.device_params.setdefault(scn, {})[n] = {
            f'hostname_hostname_B_{scn}{n}': f'BJ01-R01-AIDC-H3C-BIZ-AGG-{n:02d}',
            f'hostname_hostname_E_{scn}{n}': 65600 + n,
            f'ipv4_LoopBack_P_{scn}{n}': f'10.1.0.{200 + n}/32',
            f'ipv4_M-ILO_P_{scn}{n}': f'10.1.48.{n}/24',
        }
        ips = [f'10.1.56.{n * 4 + i * 4 - 3}' for i in range(1, uplink_per_agg + 1)]
        ctx.lists[f'{scn}_downlink_port{n}'] = [f'HundredGigE1/0/{i}' for i in range(1, acc_count + 1)]
        ctx.lists[f'{scn}_downlink_desc{n}'] = [f'to-BIZ-ACC-{i}' for i in range(1, acc_count + 1)]
        ctx.lists[f'{scn}_uplink_port{n}'] = [f'HundredGigE1/0/{i}' for i in range(1, uplink_per_agg + 1)]
        ctx.lists[f'{scn}_uplink_ip{n}'] = ips
        ctx.lists[f'{scn}_uplink_desc{n}'] = [f'to-AGG' for _ in range(uplink_per_agg)]
        ctx.lists[f'{scn}_bgp_peer_ip{n}'] = [_adj(ip) for ip in ips]
        ctx.lists[f'{scn}_bgp_peer_as{n}'] = [65500 + (i % acc_count) + 1 for i in range(1, uplink_per_agg + 1)]
        ctx.lists[f'{scn}_gw_net{n}'] = []
        ctx.lists[f'{scn}_gw_mask{n}'] = []

    # BIZ_ACCESS（接入，AS 65501..；同组 ACC 两两 MLAG；100G 上联）
    for n in range(1, acc_count + 1):
        scn = 'BIZACC'
        ctx.device_params.setdefault(scn, {})[n] = {
            f'hostname_hostname_B_{scn}{n}': f'BJ01-R{14 + n:02d}-AIDC-H3C-BIZ-ACC-{n:02d}',
            f'hostname_hostname_E_{scn}{n}': 65500 + n,
            f'ipv4_LoopBack_P_{scn}{n}': f'10.1.0.{300 + n}/32',
            f'ipv4_M-ILO_P_{scn}{n}': f'10.1.48.{20 + n}/24',
        }
        ctx.lists[f'{scn}_biz_port{n}'] = [f'Twenty-FiveGigE1/0/{i}' for i in range(1, biz_ports_per_acc + 1)]
        ctx.lists[f'{scn}_biz_vlan{n}'] = [300 + (i % 10) for i in range(biz_ports_per_acc)]
        ctx.lists[f'{scn}_biz_desc{n}'] = [f'BIZ-ACC-{n}-{i}' for i in range(1, biz_ports_per_acc + 1)]
        ips = [f'10.1.56.{n * 4 + i * 4 - 1}' for i in range(1, uplink_per_acc + 1)]
        ctx.lists[f'{scn}_uplink_port{n}'] = [f'HundredGigE1/0/{i}' for i in range(uplink_per_acc)]
        ctx.lists[f'{scn}_uplink_ip{n}'] = ips
        ctx.lists[f'{scn}_uplink_desc{n}'] = [f'to-BIZ-AGG-{(i % agg_count) + 1}' for i in range(1, uplink_per_acc + 1)]
        ctx.lists[f'{scn}_bgp_peer_ip{n}'] = [_adj(ip) for ip in ips]
        ctx.lists[f'{scn}_bgp_peer_as{n}'] = [65600 + (i % agg_count) + 1 for i in range(1, uplink_per_acc + 1)]
        ctx.lists[f'{scn}_vlan_id{n}'] = [300, 301]
        ctx.lists[f'{scn}_vlan_gw{n}'] = [f'10.1.40.{n}', f'10.1.41.{n}']
        nets, masks = [], []
        for gw in ctx.lists[f'{scn}_vlan_gw{n}']:
            net, mask = _gw_netmask(gw)
            nets.append(net)
            masks.append(mask)
        ctx.lists[f'{scn}_gw_net{n}'] = nets
        ctx.lists[f'{scn}_gw_mask{n}'] = masks
        # MLAG 成对（1↔2、3↔4…），keepalive 走专用 vpn（199.0.0.1/2）
        pair = (n - 1) // 2 + 1
        member = (n - 1) % 2
        keep = '199.0.0.1' if member == 0 else '199.0.0.2'
        peer_keep = '199.0.0.2' if member == 0 else '199.0.0.1'
        ctx.device_params[scn][n]['mlag_pair'] = pair
        ctx.device_params[scn][n]['mlag_system_number'] = member + 1
        ctx.device_params[scn][n]['mlag_keepalive'] = keep
        ctx.device_params[scn][n]['mlag_peer_keepalive'] = peer_keep

    ctx.keys = set(ctx.globals)
    for scn, by_id in ctx.device_params.items():
        for _id, params in by_id.items():
            ctx.keys |= set(params)
    return ctx
