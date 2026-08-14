"""
P0.5 规范化器演示：对华三 MA 模板（带外接入蓝本）按设备展开为具体配置。

用法：
    python -m intent.demo_ma <MA模板路径> [输出目录]

输出为参考资产派生内容，仅写入参数指定目录（默认写系统临时目录），不进入仓库。
"""

import os
import sys
import tempfile

from .resolver import IntentContext
from .normalizer import normalize_template


def build_ma_context():
    """构造 MA 场景的意图上下文（示例值，演示用）。"""
    ctx = IntentContext()
    ctx.scenario = 'MA'

    ctx.globals = {
        # AAA / 认证
        'para_para_C_AAA1': '10.10.10.10',
        'para_para_C_AAA2': '10.10.10.11',
        'para_para_C_AAA-PASSWORD': 'Aa@12345',
        'para_para_C_TACACS-NAME': 'tac_ma',
        'para_para_C_TACACS-DOMAIN': 'bj01.corp',
        # 本地/NMS
        'para_para_C_LOCAL-USER': 'admin',
        'para_para_C_LOCAL-PASSWORD': 'Aa@12345',
        'para_para_C_NMS-USER': 'nms',
        'para_para_C_NMS-PASSWORD': 'Aa@12345',
        'para_para_C_NMS-TGW-VIP': '10.10.10.100',
        'para_para_C_COMMUNITY': 'mc-public',
        # 网络参数
        'para_para_C_IPV4': '10.1.0.0/16',
        'para_para_C_IPV6': 'false',
        'para_para_C_NTP': '10.200.0.1,10.200.0.2',
        'para_para_C_BGP-PASSWORD': 'Aa@12345',
        'para_para_C_OSPF-PASSWORD': 'Aa@12345',
        'para_para_C_LOGIN-NETWORK': '10.1.0.0/16',
        'para_para_C_NETCONF-USER': 'netconf',
        'para_para_C_NETCONF-PASSWORD': 'Aa@12345',
        # 外部参数（TCE 特有，置空以走 else 分支）
        'para_external_C_PEER-BD-AS': None,
        'para_external_C_DCISW-AS': None,
    }

    ctx.device_params = {
        'MA': {
            1: {
                'hostname_hostname_B_MA1': 'BJ01-R01-AIDC-H3C-MA-01',
                'hostname_hostname_E_MA1': '65001',
                'ipv4_LoopBack_P_MA1': '10.1.0.1/32',
                'ipv4_M-ILO_P_MA1': '10.1.64.1/26',
                'ipv4_M-ILO_P_MA1-VLAN402': '10.1.64.65/26',
                'ipv6_LoopBack_T_MA1': 'fc00::1/128',
                'ipv6_M-ILO_T_MA1': 'fc00:1::1/64',
                'ipv6_M-ILO_T_MA1-VLAN402': 'fc00:1::65/64',
            },
            2: {
                'hostname_hostname_B_MA2': 'BJ01-R01-AIDC-H3C-MA-02',
                'hostname_hostname_E_MA2': '65001',
                'ipv4_LoopBack_P_MA2': '10.1.0.2/32',
                'ipv4_M-ILO_P_MA2': '10.1.64.2/26',
                'ipv4_M-ILO_P_MA2-VLAN402': '10.1.64.66/26',
                'ipv6_LoopBack_T_MA2': 'fc00::2/128',
                'ipv6_M-ILO_T_MA2': 'fc00:1::2/64',
                'ipv6_M-ILO_T_MA2-VLAN402': 'fc00:1::66/64',
            },
        },
    }

    # 共享 VIP（MA1/MA2 共用）
    ctx.globals['ipv4_M-ILO_P_MA1-MA2-VIP'] = '10.1.64.126/26'
    ctx.globals['ipv6_M-ILO_T_MA1-MA2-VIP'] = 'fc00:1::7e/64'
    # 引用 MC 场景主机名（按 (ID-1)/24+1）
    ctx.device_params.setdefault('MC', {1: {'hostname_hostname_E_MC1': '65010'}})

    # 收集全部已知键
    ctx.keys = set(ctx.globals)
    for sc, by_id in ctx.device_params.items():
        for _id, params in by_id.items():
            ctx.keys |= set(params)

    ctx.lists = {
        'MA_conn_MGMT_F+C_MA1': ['GigabitEthernet1/0/1'],
        'MA_conn_MGMT_F+D_MA1': ['10.1.72.1'],
        'MA_conn_MGMT_F+H_MA1': ['MA-02'],
        'MA_ipv4_M-CONN_L+P_MA1': ['10.1.72.1'],
        'MA_ipv4_M-CONN_M+P_MA1': ['10.1.72.2'],
        'MA_conn_MGMT_F+C_MA2': ['GigabitEthernet1/0/1'],
        'MA_conn_MGMT_F+D_MA2': ['10.1.72.5'],
        'MA_conn_MGMT_F+H_MA2': ['MA-01'],
        'MA_ipv4_M-CONN_L+P_MA2': ['10.1.72.5'],
        'MA_ipv4_M-CONN_M+P_MA2': ['10.1.72.6'],
    }
    ctx.peer_map = {'MA': {1: 2, 2: 1}}
    return ctx


def main():
    if len(sys.argv) < 2:
        print('用法: python -m intent.demo_ma <MA模板路径> [输出目录]')
        sys.exit(1)
    template_path = sys.argv[1]
    out_dir = sys.argv[2] if len(sys.argv) > 2 else os.path.join(tempfile.gettempdir(), 'mc-intent-demo')
    os.makedirs(out_dir, exist_ok=True)

    with open(template_path, encoding='utf-8', errors='replace') as f:
        text = f.read()

    ctx = build_ma_context()
    for dev_id in (1, 2):
        rendered = normalize_template(text, ctx, dev_id)
        out_file = os.path.join(out_dir, f'MA{dev_id}.cfg')
        with open(out_file, 'w', encoding='utf-8') as f:
            f.write(rendered)
        print(f'== MA{dev_id} -> {out_file} ({len(rendered)} 字符, {rendered.count(chr(10))} 行) ==')
        # 预览前 30 行
        preview = '\n'.join(rendered.splitlines()[:30])
        print(preview)
        print('...')
        print()


if __name__ == '__main__':
    main()
