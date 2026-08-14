"""
意图参数适配器 —— MC 项目生成器（P1 准备 / P2 生成器前置）。

把意图上下文（IntentContext）映射为 MagicCommander 可消费的项目：
- excel/hostname.xlsx   设备表（赋值表）
- excel/parameter.xlsx  参数表（key-value）
- excel/connection.xlsx 互联关系表（对称表）
- para.xlsx            project_para 声明
- templates/{role}.j2  MC info 风格模板
- template.meta.json + README.md

当前实现聚焦 MA/OOB_ACCESS 场景（带外接入蓝本），映射表可扩展。
"""

import os

import pandas as pd

from .resolver import IntentContext

# ---------------------------------------------------------------------------
# 意图变量 -> MC 参数表列名（可按场景/厂商扩展）
# ---------------------------------------------------------------------------
PARAM_MAP = {
    # intent 全局参数名（para_para_C_*） -> MC 参数表列名
    'para_para_C_AAA1': 'AAA地址',
    'para_para_C_AAA-PASSWORD': 'AAA认证密钥',
    'para_para_C_TACACS-NAME': 'AAA名称',
    'para_para_C_TACACS-DOMAIN': 'domain名称',
    'para_para_C_LOCAL-USER': '本地用户名',
    'para_para_C_LOCAL-PASSWORD': '本地用户密钥',
    'para_para_C_NMS-USER': 'NMS用户名',
    'para_para_C_NMS-PASSWORD': 'NMS用户密钥',
    'para_para_C_NTP': 'NTP地址',
    'para_para_C_COMMUNITY': 'SNMP团体名',
    'para_para_C_NMS-TGW-VIP': 'LOGHOST地址',
    'para_para_C_BGP-PASSWORD': 'BGP认证密钥',
    'para_para_C_OSPF-PASSWORD': 'OSPF认证密钥',
    'para_para_C_LOGIN-NETWORK': '登录网段',
}


def _strip_prefix(val):
    """'10.1.0.1/32' -> '10.1.0.1'；非 CIDR 原样。"""
    s = str(val)
    return s.split('/')[0]


def _prefix_to_mask(prefix):
    from . import filters
    return filters.to_mask(f'0.0.0.0/{prefix}')


class McProjectGenerator:
    """从意图上下文生成 MC 项目。"""

    def __init__(self, ctx: IntentContext, scenario: str,
                 role_by_id: dict, model_by_id: dict | None = None):
        self.ctx = ctx
        self.scenario = scenario
        self.role_by_id = role_by_id            # {device_id: role} 如 {1:'OOB_ACCESS',2:'OOB_ACCESS'}
        self.model_by_id = model_by_id or {}    # {device_id: model} 缺省用 'H3C S5560X-54C-EI'
        self.param_map = dict(PARAM_MAP)

    # ------------------------------------------------------------------ #
    # 表构造
    # ------------------------------------------------------------------ #
    def _device_ids(self):
        return sorted(self.role_by_id)

    def _dev(self, device_id, var_tail):
        """取意图设备参数：ipv4_M-ILO_P_MA1 等（var_tail 如 'ipv4_M-ILO_P_MA'）。"""
        sc = self.ctx.device_params.get(self.scenario, {})
        params = sc.get(device_id, {})
        return params.get(f'{var_tail}{device_id}')

    def build_device_table(self):
        """hostname.xlsx / 设备表（赋值表）。"""
        ids = self._device_ids()
        rows = []
        for did in ids:
            hostname = self._dev(did, 'hostname_hostname_B_MA')
            loopback = self._dev(did, 'ipv4_LoopBack_P_MA')
            milo = self._dev(did, 'ipv4_M-ILO_P_MA')
            prefix = str(loopback).split('/')[1] if loopback and '/' in str(loopback) else '32'
            mprefix = str(milo).split('/')[1] if milo and '/' in str(milo) else '26'
            peer = ids[(ids.index(did) + 1) % len(ids)] if len(ids) > 1 else None
            vip = self.ctx.globals.get('ipv4_M-ILO_P_MA1-MA2-VIP')
            rows.append({
                '设备名': hostname,
                '型号': self.model_by_id.get(did, 'H3C S5560X-54C-EI'),
                '角色': self.role_by_id[did],
                '环回接口': 'LoopBack0',
                '环回IP': _strip_prefix(loopback),
                '环回长度': int(prefix),
                '管理接口': 'M-GigabitEthernet0/0/0',
                '管理IP': _strip_prefix(milo),
                '管理掩码': _prefix_to_mask(int(mprefix)),
                '对端设备': self._dev(peer, 'hostname_hostname_B_MA') if peer else '',
                'VRRP虚拟IP': _strip_prefix(vip) if vip else '',
                'VRRP优先级': 200 if did == 1 else 150,
                'SN': f'AIDC{self.scenario}{did:03d}',
            })
        return pd.DataFrame(rows)

    def build_param_table(self):
        """parameter.xlsx / 参数表（key-value）。"""
        # 组合参数：AAA地址 = AAA1 + AAA2（对齐 MC 多地址惯例）
        combined = {
            'AAA地址': [v for v in (
                self.ctx.globals.get('para_para_C_AAA1'),
                self.ctx.globals.get('para_para_C_AAA2')) if v],
        }
        rows = []
        for mc_name, vals in combined.items():
            if vals:
                rows.append({'全局参数名': mc_name, '参数值': ','.join(str(v) for v in vals)})
        for intent_name, mc_name in self.param_map.items():
            if mc_name in combined:
                continue
            val = self.ctx.globals.get(intent_name)
            if val is None:
                continue
            if isinstance(val, (list, tuple)):
                val = ','.join(str(v) for v in val)
            rows.append({'全局参数名': mc_name, '参数值': val})
        return pd.DataFrame(rows)

    def build_connection_table(self):
        """connection.xlsx / 互联关系表（对称表）：MA 对端 + 上联。"""
        rows = []
        ids = self._device_ids()
        for idx, did in enumerate(ids):
            peer = ids[(idx + 1) % len(ids)] if len(ids) > 1 else None
            if peer is None:
                continue
            port = self._peer_port(did)
            rows.append({
                '本端设备': self._dev(did, 'hostname_hostname_B_MA'),
                '本端接口': port,
                '本端接口类型': 'OOB',
                '本端互联信息': f'peer-{self._dev(peer, "hostname_hostname_B_MA")}',
                '对端设备': self._dev(peer, 'hostname_hostname_B_MA'),
                '对端接口': self._peer_port(peer),
                '对端接口类型': 'OOB',
                '对端互联信息': f'peer-{self._dev(did, "hostname_hostname_B_MA")}',
                '备注信息': '带外 VRRP 对端',
            })
        return pd.DataFrame(rows)

    def _peer_port(self, did):
        """取 {scenario}_conn_MGMT_F+C_MA{did} 列表首端口；缺省 GigabitEthernet1/0/47。"""
        lists = self.ctx.lists.get(f'{self.scenario}_conn_MGMT_F+C_MA{did}')
        if lists:
            return str(lists[0])
        return 'GigabitEthernet1/0/47'

    # ------------------------------------------------------------------ #
    # 模板
    # ------------------------------------------------------------------ #
    def build_oob_template(self) -> str:
        """OOB_ACCESS 的 MC info 风格模板（关键段：sysname/环回/管理/VRRP/AAA/NTP/SNMP）。"""
        return '''sysname {{ info['设备名']}}
#
clock timezone Beijing add 08:00:00
#
ip unreachables enable
 ip ttl-expires enable
#
 lldp global enable
#
interface {{ info['环回接口'] }}
 ip address {{ info['环回IP'] }} {{ info['环回长度'] }}
#
interface {{ info['管理接口'] }}
 description Out-Of-Band-Management
 ip address {{ info['管理IP'] }} {{ info['管理掩码'] }}
#
{%- if info['对端设备'] %}
vrrp vrid 1 virtual-ip {{ info['VRRP虚拟IP'] }}
vrrp vrid 1 priority {{ info['VRRP优先级'] }}
undo vrrp vrid 1 preempt-mode
{%- endif %}
#
hwtacacs scheme {{ info['AAA名称'] }}
 primary authentication {{ info['AAA地址'][1] if info['AAA地址'][0] == 'list' else info['AAA地址'] }}
 key authentication simple {{ info['AAA认证密钥'] }}
 user-name-format without-domain
#
domain {{ info['domain名称'] }}
 authentication login hwtacacs-scheme {{ info['AAA名称'] }} local
 authorization login hwtacacs-scheme {{ info['AAA名称'] }} local
#
local-user {{ info['本地用户名'] }} class manage
 password simple {{ info['本地用户密钥'] }}
 service-type ssh terminal
#
ntp-service enable
ntp-service unicast-server {{ info['NTP地址'][1] if info['NTP地址'][0] == 'list' else info['NTP地址'] }}
{%- if info['NTP地址'][0] == 'list' and info['NTP地址'][2] %}
ntp-service unicast-server {{ info['NTP地址'][2] }}
{%- endif %}
#
snmp-agent
snmp-agent community read {{ info['SNMP团体名'] }}
#
info-center enable
info-center loghost {{ info['LOGHOST地址'] }}
#
ssh server enable
'''

    # ------------------------------------------------------------------ #
    # 写项目
    # ------------------------------------------------------------------ #
    def write(self, project_dir: str, template_name: str | None = None):
        os.makedirs(os.path.join(project_dir, 'excel'), exist_ok=True)
        os.makedirs(os.path.join(project_dir, 'templates'), exist_ok=True)

        # Excel 表
        device_df = self.build_device_table()
        param_df = self.build_param_table()
        conn_df = self.build_connection_table()
        device_df.to_excel(os.path.join(project_dir, 'excel', 'hostname.xlsx'),
                           index=False, sheet_name='设备表')
        param_df.to_excel(os.path.join(project_dir, 'excel', 'parameter.xlsx'),
                          index=False, sheet_name='参数表')
        conn_df.to_excel(os.path.join(project_dir, 'excel', 'connection.xlsx'),
                         index=False, sheet_name='互联关系表')

        # para.xlsx 声明
        proj_para = pd.DataFrame({
            '工作簿名称': ['hostname.xlsx', 'parameter.xlsx', 'connection.xlsx'],
            '工作表名称': ['设备表', '参数表', '互联关系表'],
            '工作表类型': ['赋值表', '参数表', '对称表'],
            '对称列数': [0, 0, 4],
            'key列数': [1, 1, 2],
        })
        proj_para.to_excel(os.path.join(project_dir, 'para.xlsx'),
                           index=False, sheet_name='project_para')

        # 模板（按角色）
        role = self.role_by_id.get(1, 'OOB_ACCESS')
        tpl = template_name or f'{role}.j2'
        with open(os.path.join(project_dir, 'templates', tpl), 'w', encoding='utf-8') as f:
            f.write(self.build_oob_template())

        # meta + README
        meta = {
            'name': os.path.basename(project_dir.rstrip('/')),
            'source': 'intent-adapter-project-gen',
            'license': 'private',
            'scenario': self.scenario,
            'roles': sorted(set(self.role_by_id.values())),
            'planes': ['oob'],
            'generator': 'intent.project_gen.McProjectGenerator',
            'version': '0.1',
        }
        import json
        with open(os.path.join(project_dir, 'template.meta.json'), 'w', encoding='utf-8') as f:
            json.dump(meta, f, ensure_ascii=False, indent=2)
        with open(os.path.join(project_dir, 'README.md'), 'w', encoding='utf-8') as f:
            f.write(f'# {meta["name"]}\n\nAIDC 带外网络（OOB_ACCESS）示例项目，'
                    f'由意图适配器项目生成器产出。\n')
        return project_dir


def generate_oob_project(project_dir: str, ctx: IntentContext,
                         device_count: int = 2, model: str = 'H3C S5560X-54C-EI'):
    """便捷入口：生成 MA/OOB_ACCESS 场景 MC 项目。"""
    role_by_id = {i: 'OOB_ACCESS' for i in range(1, device_count + 1)}
    model_by_id = {i: model for i in range(1, device_count + 1)}
    return McProjectGenerator(ctx, 'MA', role_by_id, model_by_id).write(project_dir)
