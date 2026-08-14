"""
意图参数适配器 —— RoCE 计算网模板（P1 试点核心，自研）。

命令基准：华三 RoCE 参数网示例（S9825-64D，Comware v9）；设备 S9827（128×400G）。
拓扑：8 轨（每 GPU 接 8 Leaf）、2 层 CLOS；Leaf 400G 1分2 → 200G 下联 GPU。

可调变量（意图全局参数，默认见 ROCE_DEFAULTS）：
- pfc_queue：PFC 无损队列 dot1p，默认 3，范围 0-7
- cnp_queue：CNP 拥塞通知队列（wfq/gts），默认 6，范围 0-7

列表按设备命名（uplink_port[[ID]] 等，对齐参考模板 iter_obj_func 惯例），
经 normalizer 按设备展开为具体配置。
"""

from .resolver import IntentContext

ROCE_DEFAULTS = {
    # 无损队列（可调，0-7，默认 PFC=3 / CNP=6）
    'pfc_queue': 3,
    'cnp_queue': 6,
    # Underlay：EBGP + ECMP（2026-08-13，Leaf-Spine /30|/31 互联）
    'bgp_max_paths': 16,
    'roce_pfc_headroom': 80000,
}

_SCN_SPINE = 'SPINE'
_SCN_LEAF = 'LEAF'

# 公共头（普通字符串，避免 f-string 把 {{ }} 转义掉；__SCN__ 为场景占位）
_HEAD_TEMPLATE = """#
ip vpn-instance Mgnt
#
priority-flow-control poolid 0 headroom {{roce_pfc_headroom}}
#
ip ttl-expires enable
#
lldp global enable
#
buffer egress cell queue {{cnp_queue}} shared ratio 100
buffer egress cell queue {{pfc_queue}} shared ratio 100
buffer apply
#
priority-flow-control deadlock cos {{pfc_queue}} interval 10
priority-flow-control deadlock precision high
priority-flow-control deadlock auto-recover cos {{pfc_queue}} delay 10
password-recovery enable
#
vlan 1
#
qos map-table dot1p-lp
 import 0 export 0
 import 1 export 1
 import 2 export 2
 import 3 export 3
 import 4 export 4
 import 5 export 5
 import 6 export 6
 import 7 export 7
#
interface NULL0
#
interface LoopBack0
 ip address {{ipv4_LoopBack_P___SCN__[[ID]]}} 255.255.255.255
#
interface M-GigabitEthernet0/0/0
 ip binding vpn-instance Mgnt
 ip address {{ipv4_M-ILO_P___SCN__[[ID]]}} 255.255.255.0
#
"""


def _head(scn: str) -> str:
    return _HEAD_TEMPLATE.replace('__SCN__', scn)

# 上联/互联口（400G 路由口，/31 点对点，EBGP 邻居接口，带 description）
_UPLINK_BLOCK = """{%- for item in iter_obj_func("uplink_port[[ID]]", "uplink_ip[[ID]]", "uplink_desc[[ID]]") %}
interface {{item.uplink_port[[ID]]}}
 port link-mode route
 description {{item.uplink_desc[[ID]]}}
 link-delay up 2
 priority-flow-control enable
 priority-flow-control no-drop dot1p {{pfc_queue}}
 priority-flow-control deadlock enable
 ip address {{item.uplink_ip[[ID]]}} 255.255.255.254
 qos trust dscp
 qos wfq byte-count
 qos wfq cs{{cnp_queue}} group sp
 qos wfq cs7 group sp
 qos wred apply 400G-WRED-Template
#
{%- endfor %}
"""

# EBGP + ECMP（Leaf-Spine，/31 互联；AS 号来自 hostname_hostname_E_*）
_BGP_BLOCK = """#
router bgp {{hostname_hostname_E___SCN__[[ID]]}}
 bgp router-id {{ipv4_LoopBack_P___SCN__[[ID]]|to_ip}}
 bgp log-neighbor-changes
 bgp graceful-restart
 bgp bestpath as-path multipath-relax
 bgp always-compare-med
 maximum-paths ebgp {{bgp_max_paths}}
{%- for item in iter_obj_func("bgp_peer_ip[[ID]]", "bgp_peer_as[[ID]]") %}
 neighbor {{item.bgp_peer_ip[[ID]]}} as-number {{item.bgp_peer_as[[ID]]}}
{%- endfor %}
 address-family ipv4
  network {{ipv4_LoopBack_P___SCN__[[ID]]|to_ip}} mask 255.255.255.255
{%- for item in iter_obj_func("gw_net[[ID]]", "gw_mask[[ID]]") %}
  network {{item.gw_net[[ID]]}} mask {{item.gw_mask[[ID]]}}
{%- endfor %}
{%- for item in iter_obj_func("bgp_peer_ip[[ID]]") %}
  neighbor {{item.bgp_peer_ip[[ID]]}} activate
  neighbor {{item.bgp_peer_ip[[ID]]}} send-community both
{%- endfor %}
  exit-address-family
#
"""

# GPU 下联口（200G，1:2 分光子口，桥接 + 无损，带 description）
_GPU_DOWNLINK_BLOCK = """{%- for item in iter_obj_func("gpu_port[[ID]]", "gpu_vlan[[ID]]", "gpu_desc[[ID]]") %}
interface {{item.gpu_port[[ID]]}}
 port link-mode bridge
 description {{item.gpu_desc[[ID]]}}
 port access vlan {{item.gpu_vlan[[ID]]}}
 link-delay up 2
 priority-flow-control enable
 priority-flow-control no-drop dot1p {{pfc_queue}}
 priority-flow-control deadlock enable
 stp edged-port
 qos trust dscp
 qos wfq byte-count
 qos wfq cs{{cnp_queue}} group sp
 qos wfq cs7 group sp
 qos wred apply 200G-WRED-Template
 qos gts queue {{cnp_queue}} cir 200000000 cbs 16000000
#
{%- endfor %}
"""

# VLAN 网关接口（Leaf）
_VLAN_GW_BLOCK = """{%- for item in iter_obj_func("vlan_id[[ID]]", "vlan_gw[[ID]]") %}
interface Vlan-interface{{item.vlan_id[[ID]]}}
 ip address {{item.vlan_gw[[ID]]}} 255.255.255.0
#
{%- endfor %}
"""


def _bgp(scn):
    return _BGP_BLOCK.replace('__SCN__', scn)


SPINE_TEMPLATE = (
    "# 参数网 Spine（S9827）\n"
    "sysname {{hostname_hostname_B_SPINE[[ID]]}}\n"
    + _head(_SCN_SPINE)
    + _UPLINK_BLOCK
    + _bgp(_SCN_SPINE)
)

LEAF_TEMPLATE = (
    "# 参数网 Leaf（S9827，400G 1分2 → 200G GPU）\n"
    "sysname {{hostname_hostname_B_LEAF[[ID]]}}\n"
    + _head(_SCN_LEAF)
    + _UPLINK_BLOCK
    + _GPU_DOWNLINK_BLOCK
    + _VLAN_GW_BLOCK
    + _bgp(_SCN_LEAF)
)


def build_roce_context(spine_count=2, leaf_count=8, pfc_queue=3, cnp_queue=6,
                       gpu_down_per_leaf=8, uplink_per_leaf=4) -> IntentContext:
    """构造 RoCE 计算网意图上下文（演示用，端口数量可参数化）。

    - spine_count 台 Spine（S9827）；leaf_count 台 Leaf（S9827）
    - 每 Leaf：uplink_per_leaf 个 400G 上联 + gpu_down_per_leaf 个 200G GPU 口
    """
    ctx = IntentContext()
    ctx.globals = dict(ROCE_DEFAULTS)
    ctx.globals['pfc_queue'] = pfc_queue
    ctx.globals['cnp_queue'] = cnp_queue
    ctx.scenario = 'ROCE'
    ctx.device_params = {}
    ctx.lists = {}

    import ipaddress

    def _adj(ip_str):
        try:
            return str(ipaddress.ip_address(ip_str) + 1)
        except Exception:  # noqa: BLE001
            return ''

    # Spine 设备（AS 65201..，对端=Leaf 65101..）
    for n in range(1, spine_count + 1):
        scn = _SCN_SPINE
        ctx.device_params.setdefault(scn, {})[n] = {
            f'hostname_hostname_B_{scn}{n}': f'BJ01-R01-AIDC-H3C-P-Spine-{n:02d}',
            f'hostname_hostname_E_{scn}{n}': 65200 + n,
            f'ipv4_LoopBack_P_{scn}{n}': f'10.1.0.{n}/32',
            f'ipv4_M-ILO_P_{scn}{n}': f'10.1.64.{n}/24',
        }
        ports = [f'FourHundredGigE1/0/{lf}' for lf in range(1, leaf_count + 1)]
        ips = [f'10.1.16.{n * 64 + lf * 4 - 2}' for lf in range(1, leaf_count + 1)]
        ctx.lists[f'{scn}_uplink_port{n}'] = ports
        ctx.lists[f'{scn}_uplink_ip{n}'] = ips
        ctx.lists[f'{scn}_uplink_desc{n}'] = [f'to-P-Leaf-{lf + 1}' for lf in range(1, leaf_count + 1)]
        ctx.lists[f'{scn}_bgp_peer_ip{n}'] = [_adj(ip) for ip in ips]
        ctx.lists[f'{scn}_bgp_peer_as{n}'] = [65100 + lf + 1 for lf in range(1, leaf_count + 1)]
        ctx.lists[f'{scn}_gw_net{n}'] = []
        ctx.lists[f'{scn}_gw_mask{n}'] = []

    # Leaf 设备（AS 65101..，对端=Spine 65201/65202，ECMP 多路径）
    for n in range(1, leaf_count + 1):
        scn = _SCN_LEAF
        ctx.device_params.setdefault(scn, {})[n] = {
            f'hostname_hostname_B_{scn}{n}': f'BJ01-R{1 + n:02d}-AIDC-H3C-P-Leaf-{n:02d}',
            f'hostname_hostname_E_{scn}{n}': 65100 + n,
            f'ipv4_LoopBack_P_{scn}{n}': f'10.1.0.{100 + n}/32',
            f'ipv4_M-ILO_P_{scn}{n}': f'10.1.64.{100 + n}/24',
        }
        ips = [f'10.1.16.{n * 64 + i * 4 - 2}' for i in range(1, uplink_per_leaf + 1)]
        ctx.lists[f'{scn}_uplink_port{n}'] = [f'FourHundredGigE1/0/{33 + i}' for i in range(uplink_per_leaf)]
        ctx.lists[f'{scn}_uplink_ip{n}'] = ips
        ctx.lists[f'{scn}_uplink_desc{n}'] = [f'to-P-Spine-{(i % 2) + 1}' for i in range(1, uplink_per_leaf + 1)]
        ctx.lists[f'{scn}_bgp_peer_ip{n}'] = [_adj(ip) for ip in ips]
        ctx.lists[f'{scn}_bgp_peer_as{n}'] = [65200 + (i % 2) + 1 for i in range(1, uplink_per_leaf + 1)]
        gpu_ports = [f'TwoHundredGigE1/0/{i}:{sub}' for i in range(1, gpu_down_per_leaf // 2 + 1) for sub in (1, 2)]
        ctx.lists[f'{scn}_gpu_port{n}'] = gpu_ports
        ctx.lists[f'{scn}_gpu_vlan{n}'] = [171 + (i % 8) for i in range(len(gpu_ports))]
        ctx.lists[f'{scn}_gpu_desc{n}'] = [f'GPU-R{n}-{i + 1}' for i in range(len(gpu_ports))]
        ctx.lists[f'{scn}_vlan_id{n}'] = [171, 172]
        ctx.lists[f'{scn}_vlan_gw{n}'] = [f'10.1.32.{n}', f'10.1.33.{n}']
        # 网关网段（/24 -> network + mask）供 BGP 通告
        nets, masks = [], []
        for gw in ctx.lists[f'{scn}_vlan_gw{n}']:
            net = ipaddress.ip_network(f'{gw}/24', strict=False)
            nets.append(str(net.network_address))
            masks.append(str(net.netmask))
        ctx.lists[f'{scn}_gw_net{n}'] = nets
        ctx.lists[f'{scn}_gw_mask{n}'] = masks

    ctx.keys = set(ctx.globals)
    for scn, by_id in ctx.device_params.items():
        for _id, params in by_id.items():
            ctx.keys |= set(params)
    return ctx
