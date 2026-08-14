"""
AIDC 单项目四表格生成器（P1.2，AIDC 程序优化 PRD FR-A）。

一个 64 台试点 = **一个 MC 项目**，含 4 个工作簿（多 sheet），覆盖四网全部设备：

```
{项目}/
├── para.xlsx               project_para 声明
├── excel/
│   ├── hostname.xlsx       ① 设备表（22 台）
│   ├── connection.xlsx     ② 互联关系表 / 终端连接表 / MLAG表 / VLAN网关表
│   ├── ipaddress.xlsx      ③ 环回地址表 / 互联地址表 / 网段规划表
│   └── parameter.xlsx      ④ 全局参数表
├── templates/{角色}.j2
└── template.meta.json
```

角色 → 模板：SPINE/LEAF/STO_SPINE/STO_LEAF/BIZ_AGG/BIZ_ACCESS/OOB_AGG/OOB_ACCESS。
"""

import os
import json

import pandas as pd

from .resolver import IntentContext
from .project_aidc import _info_template, _PEER_AS, ROLE_SCENARIO
from .planner.validate import validate_context


def _write_sheet(df: pd.DataFrame, filepath: str, sheet_name: str, index: bool = False,
                 append: bool = False):
    """专业表格写入（FR-E）：表头加粗 + 冻结首行 + 自适应列宽 + 浅色表头。

    append=True 时追加到已存在工作簿（多 sheet 场景）。
    """
    if append:
        with pd.ExcelWriter(filepath, mode='a', engine='openpyxl') as writer:
            df.to_excel(writer, sheet_name=sheet_name, index=index)
        _format_workbook(filepath, sheet_name)
        return
    df.to_excel(filepath, sheet_name=sheet_name, index=index, engine='openpyxl')
    _format_workbook(filepath, sheet_name)


def _format_workbook(filepath: str, sheet_name: str):
    """对指定 sheet 应用表头/冻结/列宽格式。"""
    from openpyxl import load_workbook
    from openpyxl.styles import Font, PatternFill, Alignment
    wb = load_workbook(filepath)
    ws = wb[sheet_name]
    fill = PatternFill('solid', fgColor='DDEBF7')
    for cell in ws[1]:
        cell.font = Font(bold=True)
        cell.fill = fill
        cell.alignment = Alignment(horizontal='center')
    ws.freeze_panes = 'A2'
    for col in ws.columns:
        max_len = max((len(str(c.value)) for c in col if c.value is not None), default=8)
        ws.column_dimensions[col[0].column_letter].width = min(max_len + 2, 60)
    wb.save(filepath)
    ws = wb[sheet_name]
    # 表头样式
    from openpyxl.styles import Font, PatternFill, Alignment
    fill = PatternFill('solid', fgColor='DDEBF7')
    for cell in ws[1]:
        cell.font = Font(bold=True)
        cell.fill = fill
        cell.alignment = Alignment(horizontal='center')
    # 冻结首行 + 自适应列宽
    ws.freeze_panes = 'A2'
    for col in ws.columns:
        max_len = max((len(str(c.value)) for c in col if c.value is not None), default=8)
        ws.column_dimensions[col[0].column_letter].width = min(max_len + 2, 60)
    wb.save(filepath)


# 场景 -> 模板角色
_SCN_TO_ROLE = {
    'SPINE': 'SPINE', 'LEAF': 'LEAF', 'STO_SPINE': 'STO_SPINE', 'STO_LEAF': 'STO_LEAF',
    'BIZAGG': 'BIZ_AGG', 'BIZACC': 'BIZ_ACCESS', 'OOBAGG': 'OOB_AGG', 'OOBACC': 'OOB_ACCESS',
}
_SCN_PLANE = {
    'SPINE': '参数网', 'LEAF': '参数网', 'STO_SPINE': '存储网', 'STO_LEAF': '存储网',
    'BIZAGG': '业务&管理网', 'BIZACC': '业务&管理网', 'OOBAGG': '带外网', 'OOBACC': '带外网',
}


def _strip(val):
    return str(val).split('/')[0]


def _mask(prefix):
    from . import filters
    return filters.to_mask(f'0.0.0.0/{prefix}')


def _model_of(scn):
    role = _SCN_TO_ROLE[scn]
    return ROLE_SCENARIO[role][1]


class SingleProjectGenerator:
    """单项目四表格生成器（覆盖全部场景）。"""

    def __init__(self, ctx: IntentContext):
        self.ctx = ctx
        self.roles = set(_SCN_TO_ROLE[s] for s in ctx.device_params)  # 模板角色集合

    def _scenarios(self):
        return sorted(ctx for ctx in self.ctx.device_params)

    def _dev(self, scn, local, var_tail):
        return self.ctx.device_params.get(scn, {}).get(local, {}).get(f'{var_tail}{scn}{local}')

    def _list(self, scn, local, name):
        return self.ctx.lists.get(f'{scn}_{name}{local}', [])

    # ---- ① 设备表 ----
    def build_device_table(self):
        rows = []
        for scn in self._scenarios():
            for local, params in sorted(self.ctx.device_params[scn].items()):
                loopback = self._dev(scn, local, 'ipv4_LoopBack_P_')
                milo = self._dev(scn, local, 'ipv4_M-ILO_P_')
                asn = self._dev(scn, local, 'hostname_hostname_E_')
                lpre = str(loopback).split('/')[1] if loopback and '/' in str(loopback) else '32'
                mpre = str(milo).split('/')[1] if milo and '/' in str(milo) else '24'
                role = _SCN_TO_ROLE[scn]
                rows.append({
                    '设备名': self._dev(scn, local, 'hostname_hostname_B_'),
                    '型号': _model_of(scn),
                    '角色': role,
                    '环回接口': 'LoopBack0',
                    '环回IP': _strip(loopback),
                    '环回长度': int(lpre),
                    '管理接口': 'M-GigabitEthernet0/0/0',
                    '管理IP': _strip(milo),
                    '管理掩码': _mask(int(mpre)),
                    'BGP AS': asn if asn is not None else 65000,
                    '对端AS': _PEER_AS.get(role, 65000),
                    'BGP多路径': self.ctx.globals.get('bgp_max_paths', 16),
                    'MLAG对': params.get('mlag_pair', ''),
                    'MLAG序号': params.get('mlag_system_number', ''),
                    'MLAG本端': params.get('mlag_keepalive', ''),
                    'MLAG对端': params.get('mlag_peer_keepalive', ''),
                    'SN': f'AIDC{scn}{local:03d}',
                })
        return pd.DataFrame(rows)

    # ---- ② connection.xlsx ----
    # 下联场景 -> 上联对端场景
    _PEER_SCN = {'LEAF': 'SPINE', 'STO_LEAF': 'STO_SPINE', 'BIZACC': 'BIZAGG', 'OOBACC': 'OOBAGG'}

    def _peer_hosts(self, scn):
        """取上联对端真实主机名列表（对端场景全部设备）。"""
        peer_scn = self._PEER_SCN[scn]
        hosts = []
        for local in sorted(self.ctx.device_params.get(peer_scn, {})):
            h = self._dev(peer_scn, local, 'hostname_hostname_B_')
            if h:
                hosts.append(h)
        return hosts

    def build_conn_table(self):
        """IP规划地址表（对称表，sheet 名=IP规划地址表，供模板 info['IP规划地址表 己端接口']）。

        LEAF/STO_LEAF/BIZ_ACCESS/OOBACC 方向生成（对端=真实 SPINE/AGG 主机名，避免伪设备）。
        """
        rows = []
        for scn in self._scenarios():
            if not _is_leaf_direction(scn):
                continue
            peer_hosts = self._peer_hosts(scn)
            if not peer_hosts:
                continue
            for local, params in sorted(self.ctx.device_params[scn].items()):
                ips = self._list(scn, local, 'uplink_ip')
                peers = self._list(scn, local, 'bgp_peer_ip')
                for idx, ip in enumerate(ips):
                    rows.append({
                        '己端设备': self._dev(scn, local, 'hostname_hostname_B_'),
                        '己端接口': self._list(scn, local, 'uplink_port')[idx],
                        '己端IP地址': ip,
                        '己端IP长度': 31,
                        '对端设备': peer_hosts[idx % len(peer_hosts)],
                        '对端接口': self._list(scn, local, 'uplink_port')[idx],
                        '对端IP地址': peers[idx] if idx < len(peers) else '',
                        '对端IP长度': 31,
                        '备注信息': f'{_SCN_PLANE[scn]}上联',
                    })
        return pd.DataFrame(rows)

    def build_terminal_table(self):
        """终端连接表（赋值表，1 行/设备 + 列表值）：GPU/存储/业务/带外 下联口。"""
        rows = []
        for scn in self._scenarios():
            if scn in ('SPINE', 'STO_SPINE', 'BIZAGG', 'OOBAGG'):
                continue
            for local in sorted(self.ctx.device_params[scn]):
                ports = self._list(scn, local, _terminal_port_key(scn))
                vlans = self._list(scn, local, _terminal_vlan_key(scn))
                descs = self._list(scn, local, _terminal_desc_key(scn))
                if not ports:
                    continue
                rows.append({
                    '己端设备': self._dev(scn, local, 'hostname_hostname_B_'),
                    '己端接口': ','.join(ports),
                    '己端VLAN': ','.join(str(v) for v in vlans),
                    '己端描述': ','.join(descs) if descs else '',
                    '备注信息': f'{_SCN_PLANE[scn]}下联',
                })
        return pd.DataFrame(rows)

    def build_mlag_table(self):
        """MLAG 表（赋值表）：BIZ_ACCESS 成对。"""
        rows = []
        for local in sorted(self.ctx.device_params.get('BIZACC', {})):
            p = self.ctx.device_params['BIZACC'][local]
            if 'mlag_pair' not in p:
                continue
            rows.append({
                '己端设备': p.get('hostname_hostname_B_BIZACC%d' % local, ''),
                'MLAG对': p['mlag_pair'],
                'MLAG序号': p.get('mlag_system_number', ''),
                'MLAG本端': p.get('mlag_keepalive', ''),
                'MLAG对端': p.get('mlag_peer_keepalive', ''),
            })
        return pd.DataFrame(rows)

    def build_vlan_gw_table(self):
        """VLAN 网关表（赋值表）：LEAF/STO_LEAF/BIZ_ACCESS 网关。"""
        rows = []
        for scn in ('LEAF', 'STO_LEAF', 'BIZACC'):
            for local in sorted(self.ctx.device_params.get(scn, {})):
                vids = self._list(scn, local, 'vlan_id')
                gws = self._list(scn, local, 'vlan_gw')
                if not vids:
                    continue
                rows.append({
                    '己端设备': self._dev(scn, local, 'hostname_hostname_B_'),
                    '网关VLAN': ','.join(str(v) for v in vids),
                    '网关IP': ','.join(gws),
                    '备注信息': f'{_SCN_PLANE[scn]}网关',
                })
        return pd.DataFrame(rows)

    # ---- ③ ipaddress.xlsx ----
    def build_loopback_table(self):
        rows = []
        for scn in self._scenarios():
            for local in sorted(self.ctx.device_params[scn]):
                rows.append({
                    '己端设备': self._dev(scn, local, 'hostname_hostname_B_'),
                    '环回接口': 'LoopBack0',
                    '环回IP': _strip(self._dev(scn, local, 'ipv4_LoopBack_P_')),
                    '环回长度': 32,
                })
        return pd.DataFrame(rows)

    def build_subnet_table(self):
        """网段规划表（参数表）：各平面网段。"""
        return pd.DataFrame([
            {'网段用途': '环回', '网段': '10.1.0.0/20', '掩码': '255.255.0.0'},
            {'网段用途': '计算网关', '网段': '10.1.16.0/20', '掩码': '255.255.240.0'},
            {'网段用途': '存储网关', '网段': '10.1.32.0/20', '掩码': '255.255.240.0'},
            {'网段用途': '业务网关', '网段': '10.1.48.0/20', '掩码': '255.255.240.0'},
            {'网段用途': '带外/管理', '网段': '10.1.64.0/21', '掩码': '255.255.248.0'},
            {'网段用途': '互联', '网段': '10.1.72.0/21', '掩码': '255.255.248.0'},
        ])

    # ---- ④ parameter.xlsx ----
    def build_param_table(self):
        from .project_aidc import AidcProjectGenerator
        # 复用 project_aidc 的参数表构建（含 PFC/CNP/AAA/NTP 等）
        return AidcProjectGenerator(self.ctx, {}, '全部').build_param_table()

    # ---- 写项目 ----
    def write(self, project_dir: str):
        os.makedirs(os.path.join(project_dir, 'excel'), exist_ok=True)
        os.makedirs(os.path.join(project_dir, 'templates'), exist_ok=True)

        excel = os.path.join(project_dir, 'excel')
        _write_sheet(self.build_device_table(), os.path.join(excel, 'hostname.xlsx'), '设备表')
        _write_sheet(self.build_terminal_table(), os.path.join(excel, 'connection.xlsx'), '终端连接表')
        _write_sheet(self.build_vlan_gw_table(), os.path.join(excel, 'connection.xlsx'), 'VLAN网关表', append=True)
        _write_sheet(self.build_conn_table(), os.path.join(excel, 'ipaddress.xlsx'), 'IP规划地址表')
        _write_sheet(self.build_loopback_table(), os.path.join(excel, 'ipaddress.xlsx'), '环回地址表', append=True)
        _write_sheet(self.build_subnet_table(), os.path.join(excel, 'ipaddress.xlsx'), '网段规划表', append=True)
        _write_sheet(self.build_param_table(), os.path.join(excel, 'parameter.xlsx'), '参数表')

        # para.xlsx 声明
        proj_para = pd.DataFrame({
            '工作簿名称': ['hostname.xlsx', 'connection.xlsx', 'connection.xlsx',
                        'ipaddress.xlsx', 'ipaddress.xlsx', 'ipaddress.xlsx', 'parameter.xlsx'],
            '工作表名称': ['设备表', '终端连接表', 'VLAN网关表', 'IP规划地址表', '环回地址表', '网段规划表', '参数表'],
            '工作表类型': ['赋值表', '赋值表', '赋值表', '对称表', '赋值表', '参数表', '参数表'],
            '对称列数': [0, 0, 0, 4, 0, 0, 0],
            'key列数': [1, 2, 2, 2, 2, 1, 1],
        })
        proj_para.to_excel(os.path.join(project_dir, 'para.xlsx'), index=False, sheet_name='project_para')

        # 每角色模板
        for role in self.roles:
            plane = _SCN_PLANE[_role_to_scn(role)]
            with open(os.path.join(project_dir, 'templates', f'{role}.j2'), 'w', encoding='utf-8') as f:
                f.write(_info_template(role, plane))

        issues = validate_context(self.ctx)
        meta = {
            'name': os.path.basename(project_dir.rstrip('/')),
            'source': 'intent-project-single-gen',
            'license': 'private',
            'planes': sorted(set(_SCN_PLANE.values())),
            'roles': sorted(self.roles),
            'tunables': ['PFC队列', 'CNP队列'],
            'generator': 'intent.project_single.SingleProjectGenerator',
            'version': '0.2',
            'validation': {'ok': len(issues) == 0, 'issue_count': len(issues), 'issues': issues[:20]},
        }
        with open(os.path.join(project_dir, 'template.meta.json'), 'w', encoding='utf-8') as f:
            json.dump(meta, f, ensure_ascii=False, indent=2)
        with open(os.path.join(project_dir, 'README.md'), 'w', encoding='utf-8') as f:
            f.write(f'# {meta["name"]}\n\nAIDC 64 台试点单项目（四表格多 sheet，四网合一）。'
                    f'可调参数：PFC队列/CNP队列（0-7）。\n')
        return project_dir


def _is_leaf_direction(scn):
    return scn in ('LEAF', 'STO_LEAF', 'BIZACC', 'OOBACC')


def _terminal_port_key(scn):
    return {'LEAF': 'gpu_port', 'STO_LEAF': 'gpu_port',
            'BIZACC': 'biz_port', 'OOBACC': 'downlink_port'}[scn]


def _terminal_vlan_key(scn):
    return {'LEAF': 'gpu_vlan', 'STO_LEAF': 'gpu_vlan',
            'BIZACC': 'biz_vlan', 'OOBACC': 'downlink_vlan'}[scn]


def _terminal_desc_key(scn):
    return {'LEAF': 'gpu_desc', 'STO_LEAF': 'gpu_desc',
            'BIZACC': 'biz_desc', 'OOBACC': 'downlink_desc'}[scn]


def _role_to_scn(role):
    inv = {v: k for k, v in _SCN_TO_ROLE.items()}
    return inv.get(role, role)


def generate_single_pilot64_project(project_dir: str, ctx: IntentContext) -> str:
    """生成单项目（四表格多 sheet，四网合一）。"""
    return SingleProjectGenerator(ctx).write(project_dir)
