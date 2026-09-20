"""
V5.3.0-640-m（W4.2 / FR-M2）：SONiC/UXOS 命令族基准模板。

覆盖 X400（Spectrum-4 / UXOS / RoCE）渲染产物的五组命令族：
  1) 接口与 IP（Ethernet + /31 点对点 + 环回/管理）
  2) PFC（priority-flow-control，无损队列）
  3) ECN（WRED / ECN 标记，无损拥塞反馈）
  4) BGP-EVPN（frr / BGP 多路径 + EVPN 地址族）
  5) RoCE 参数（PFC 队列 / CNP 队列 / Headroom）

与 `roce_templates.py`（H3C Comware 族）同构：Jinja 块 + SPINE/LEAF 拼接，
变量名沿用 MC 赋值表口径（hostname_*_B_、ipv4_LoopBack_P_、uplink_*、gpu_* 等），
保证同一赋值表可同时渲染两族（H3C 族现状 / SONiC 族 X400）。

⚠ 基准标注（JR-2）：本族为**模板基准**，无现网 SONiC/UXOS 样本校准；
渲染产物必须标注「待现网校准」，发布前命令族评审点（W4.2 验收）。
"""

_SCN_SPINE = 'SPINE'
_SCN_LEAF = 'LEAF'

# 1) 接口与 IP：环回 / 管理 / 上联路由口 / GPU 下联口（SONiC 端口命名 EthernetN）
_HEAD_TEMPLATE = """#
# SONiC/UXOS 基准（待现网校准）—— 全局
# PFC 无损队列（可调，0-7，默认 PFC=3 / CNP=6）
# BUFFER: egress lossless profile（headroom {{roce_pfc_headroom}} bytes）
config buffer profile add BUFFER_LOSSLESS_HEADROOM --size {{roce_pfc_headroom}} --pool ingress_lossless
#
# ECN: 无损队列 WRED 阈值（Kbytes）
config ecn set 200000 100000 --queue {{cnp_queue}}
#
# 环回（/32）与带内管理
ip address add {{ipv4_LoopBack_P___SCN__[[ID]]}}/32 dev Loopback0
ip address add {{ipv4_M-ILO_P___SCN__[[ID]]}}/24 dev Management0
#
"""

# 2) PFC 与 3) ECN：上联路由口（/31 点对点，BGP 邻居接口）
_UPLINK_BLOCK = """{%- for item in iter_obj_func("uplink_port[[ID]]", "uplink_ip[[ID]]", "uplink_desc[[ID]]") %}
# 上联 {{item.uplink_desc[[ID]]}}（{{item.uplink_port[[ID]]}}，/31 点对点）
config interface ip add {{item.uplink_port[[ID]]}} {{item.uplink_ip[[ID]]}}/31
config interface pfc set {{item.uplink_port[[ID]]}} --queue {{pfc_queue}} --enable on
config interface pfc set {{item.uplink_port[[ID]]}} --queue {{pfc_queue}} --deadlock-detect on --deadlock-recover on
config interface ecn set {{item.uplink_port[[ID]]}} --wred 400G-WRED-Profile --queue {{cnp_queue}}
{%- endfor %}
"""

# 4) BGP-EVPN（frr：EBGP 多路径 + EVPN 地址族，AS 号来自赋值表）
_BGP_BLOCK = """#
router bgp {{hostname_hostname_E___SCN__[[ID]]}}
 bgp router-id {{ipv4_LoopBack_P___SCN__[[ID]]|to_ip}}
 maximum-paths 16
{%- for item in iter_obj_func("bgp_peer_ip[[ID]]", "bgp_peer_as[[ID]]") %}
 neighbor {{item.bgp_peer_ip[[ID]]}} remote-as {{item.bgp_peer_as[[ID]]}}
{%- endfor %}
 address-family ipv4 unicast
  network {{ipv4_LoopBack_P___SCN__[[ID]]|to_ip}}/32
{%- for item in iter_obj_func("gw_net[[ID]]", "gw_mask[[ID]]") %}
  network {{item.gw_net[[ID]]}}/{{item.gw_mask[[ID]]}}
{%- endfor %}
 exit-address-family
 address-family l2vpn evpn
{%- for item in iter_obj_func("bgp_peer_ip[[ID]]") %}
  neighbor {{item.bgp_peer_ip[[ID]]}} activate
{%- endfor %}
 exit-address-family
#
"""

# 5) RoCE 参数 + GPU 下联（200G，breakout 1:2 子口，带 description）
_GPU_DOWNLINK_BLOCK = """{%- for item in iter_obj_func("gpu_port[[ID]]", "gpu_vlan[[ID]]", "gpu_desc[[ID]]") %}
# GPU 下联 {{item.gpu_desc[[ID]]}}（{{item.gpu_port[[ID]]}}，breakout 1:2 → 200G）
config interface ip add {{item.gpu_port[[ID]]}} --vlan {{item.gpu_vlan[[ID]]}}
config interface pfc set {{item.gpu_port[[ID]]}} --queue {{pfc_queue}} --enable on
config interface pfc set {{item.gpu_port[[ID]]}} --queue {{pfc_queue}} --deadlock-detect on --deadlock-recover on
config interface ecn set {{item.gpu_port[[ID]]}} --wred 200G-WRED-Profile --queue {{cnp_queue}}
{%- endfor %}
"""


def _head(scn: str) -> str:
    return _HEAD_TEMPLATE.replace('__SCN__', scn)


def _bgp(scn: str) -> str:
    return _BGP_BLOCK.replace('__SCN__', scn)


SPINE_TEMPLATE = (
    "# 参数网 Spine（X400 / UXOS / SONiC 基准，待现网校准）\n"
    "# hostname {{hostname_hostname_B_SPINE[[ID]]}}\n"
    + _head(_SCN_SPINE)
    + _UPLINK_BLOCK
    + _bgp(_SCN_SPINE)
)

LEAF_TEMPLATE = (
    "# 参数网 Leaf（X400 / UXOS / SONiC 基准，400G breakout 1:2 → 200G GPU，待现网校准）\n"
    "# hostname {{hostname_hostname_B_LEAF[[ID]]}}\n"
    + _head(_SCN_LEAF)
    + _UPLINK_BLOCK
    + _GPU_DOWNLINK_BLOCK
    + _bgp(_SCN_LEAF)
)


def render_sonic_spine(ctx, device_id: int) -> str:
    """V5.3.0-640-m（W6.4 / FR-M2）：按赋值表渲染 X400 Spine 命令族。

    与 H3C 族（roce_templates）同构：normalize_template 按设备展开
    [[ID]] / iter_obj_func / to_ip 等占位语义，产出逐设备 SONiC/UXOS 配置。
    """
    from .normalizer import normalize_template
    return normalize_template(SPINE_TEMPLATE, ctx, device_id, _SCN_SPINE)


def render_sonic_leaf(ctx, device_id: int) -> str:
    """V5.3.0-640-m（W6.4 / FR-M2）：按赋值表渲染 X400 Leaf 命令族（SONiC/UXOS 基准）。"""
    from .normalizer import normalize_template
    return normalize_template(LEAF_TEMPLATE, ctx, device_id, _SCN_LEAF)
