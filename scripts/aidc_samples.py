"""4.9.0（49-b / 49-d）：AIDC 示例资产（plan:table v1.2）构建与注册共享模块。

提供 4 份示例的定义、plan:table 构建与示例注册逻辑，供：
  - scripts/gen_aidc_samples.py（CLI 生成 + 注册到 example/）
  - scripts/validate_samples.py（自动化验收）
  - backend/tests/test_aidc_samples.py（pytest 断言）

示例矩阵：
  - 64H100-IB / 64H100-RoCE：22 台设备（2 SPINE + 8 LEAF + 1 STO_SPINE + 2 STO_LEAF
    + 2 BIZ_AGG + 4 BIZ_ACCESS + 1 OOB_AGG + 2 OOB_ACCESS）
  - 128H100-IB / 128H100-RoCE：24 台设备（4 SPINE + 8 LEAF + 1 STO_SPINE + 2 STO_LEAF
    + 2 BIZ_AGG + 4 BIZ_ACCESS + 1 OOB_AGG + 2 OOB_ACCESS）
  - IB 与 RoCE 差异：convergence（收敛比）+ deviceModels（型号）+ 宏观参数。

plan:table v1.2 契约字段：meta / macro / topology / deviceList / connections /
terminals / protocols / convergence；planHash = sha256(canonical(macro))。
"""
import datetime
import json
import os
import shutil
import sys

BACKEND = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'backend')
if BACKEND not in sys.path:
    sys.path.insert(0, BACKEND)

from intent.planner.validate import plan_hash  # noqa: E402

REPO = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
EXAMPLE_DIR = os.path.join(REPO, 'example')

# 固定时间戳（字节级/内容级确定性：重复生成产出相同文件）
_FIXED_GENERATED_AT = '2026-09-03T00:00:00+00:00'
_FIXED_META_TS = '2026-09-03T00:00:00.000Z'

# 桥接标识（契约 v1.2）
_BRIDGE = {'source': 'autolink', 'projectType': 'aidc', 'bridgeVersion': '1.0'}

# 命名模板（与 workspace/64台H100项目 一致）
_NAMING = {
    'format': '{site}-R{rack:02d}-AIDC-{vendor}-{abbr}-{seq:02d}',
    'abbr': {
        'SPINE': 'P-Spine', 'LEAF': 'P-Leaf',
        'STO_SPINE': 'S-Spine', 'STO_LEAF': 'S-Leaf',
        'BIZAGG': 'BIZ-AGG', 'BIZACC': 'BIZ-ACC',
        'OOBAGG': 'OOB-AGG', 'OOBACC': 'OOB-ACC',
    },
}

# 地址段（F10 10.1.0.0/16 裂解）
_IP_SEGMENTS = {
    'loopback': '10.1.0.0/20',
    'compute': '10.1.16.0/20',
    'storage': '10.1.32.0/20',
    'biz': '10.1.48.0/20',
    'oob': '10.1.64.0/21',
    'interconnect': '10.1.72.0/21',
}

_VLAN_RANGES = {'compute': [100, 199], 'storage': [200, 299], 'biz': [300, 399], 'oob': [400, 499]}
_OSPF = {'process': 10, 'area': '0.0.0.0'}

# 角色 → 场景 / ASN 段基址 / 命名 abbr
_ROLE = {
    'SPINE': {'scenario': 'SPINE', 'asn': 65111, 'abbr': 'P-Spine'},
    'LEAF': {'scenario': 'LEAF', 'asn': 65101, 'abbr': 'P-Leaf'},
    'STO_SPINE': {'scenario': 'STO_SPINE', 'asn': 65121, 'abbr': 'S-Spine'},
    'STO_LEAF': {'scenario': 'STO_LEAF', 'asn': 65131, 'abbr': 'S-Leaf'},
    'BIZ_AGG': {'scenario': 'BIZAGG', 'asn': 65151, 'abbr': 'BIZ-AGG'},
    'BIZ_ACCESS': {'scenario': 'BIZACC', 'asn': 65141, 'abbr': 'BIZ-ACC'},
    'OOB_AGG': {'scenario': 'OOBAGG', 'asn': 65161, 'abbr': 'OOB-AGG'},
    'OOB_ACCESS': {'scenario': 'OOBACC', 'asn': 65171, 'abbr': 'OOB-ACC'},
}

# IB（NVIDIA Quantum 计算/存储网）+ RoCE（H3C 以太 RoCEv2）型号矩阵
_MODELS_IB = {
    'SPINE': 'NVIDIA Quantum QM9700',
    'LEAF': 'NVIDIA Quantum QM9700',
    'STO_SPINE': 'NVIDIA Quantum QM9700',
    'STO_LEAF': 'NVIDIA Quantum QM9700',
    'BIZ_AGG': 'H3C S9850-32H',
    'BIZ_ACCESS': 'H3C S6850-56HF',
    'OOB_AGG': 'H3C S6805-56HF-G',
    'OOB_ACCESS': 'H3C S5560X-54C-EI',
}
_MODELS_ROCE = {
    'SPINE': 'H3C S9827',
    'LEAF': 'H3C S9827',
    'STO_SPINE': 'H3C S9825-128B',
    'STO_LEAF': 'H3C S9825-128B',
    'BIZ_AGG': 'H3C S9850-32H',
    'BIZ_ACCESS': 'H3C S6850-56HF',
    'OOB_AGG': 'H3C S6805-56HF-G',
    'OOB_ACCESS': 'H3C S5560X-54C-EI',
}

# 示例定义（固定 projectId 保证重复生成幂等）
SAMPLE_DEFS = [
    {
        'key': '64H100-IB',
        'site': 'BJ01', 'gpuCount': 64, 'rails': 8,
        'spines': 2, 'leaves': 8,
        'fabric': 'ib', 'convergence': 1,
        'vendor': 'NVDA', 'models': _MODELS_IB,
        'project_id': 'b3a1c0d1-0000-4000-8000-64h1000ib001',
        'description': '64 台 H100 集群 · InfiniBand（IB）无损计算网络示例项目：NVIDIA Quantum 组网，'
                       '收敛比 1:1，四网合一（业务&管理/参数/存储/带外）。',
        'scenario': 'AIDC/64 台/IB',
    },
    {
        'key': '64H100-RoCE',
        'site': 'BJ02', 'gpuCount': 64, 'rails': 8,
        'spines': 2, 'leaves': 8,
        'fabric': 'roce', 'convergence': 3,
        'vendor': 'H3C', 'models': _MODELS_ROCE,
        'project_id': 'b3a1c0d1-0000-4000-8000-64h100roce001',
        'description': '64 台 H100 集群 · RoCEv2（RDMA over Converged Ethernet）示例项目：'
                       'H3C S9827 组网，收敛比 3:1，四网合一。',
        'scenario': 'AIDC/64 台/RoCE',
    },
    {
        'key': '128H100-IB',
        'site': 'SH01', 'gpuCount': 128, 'rails': 8,
        'spines': 4, 'leaves': 8,
        'fabric': 'ib', 'convergence': 1,
        'vendor': 'NVDA', 'models': _MODELS_IB,
        'project_id': 'b3a1c0d1-0000-4000-8000-128h100ib001',
        'description': '128 台 H100 集群 · InfiniBand（IB）无损计算网络示例项目：4 台 SPINE 骨干，'
                       'NVIDIA Quantum 组网，收敛比 1:1，四网合一。',
        'scenario': 'AIDC/128 台/IB',
    },
    {
        'key': '128H100-RoCE',
        'site': 'GZ01', 'gpuCount': 128, 'rails': 8,
        'spines': 4, 'leaves': 8,
        'fabric': 'roce', 'convergence': 3,
        'vendor': 'H3C', 'models': _MODELS_ROCE,
        'project_id': 'b3a1c0d1-0000-4000-8000-128h100roce001',
        'description': '128 台 H100 集群 · RoCEv2 示例项目：4 台 SPINE 骨干，H3C S9827 组网，'
                       '收敛比 3:1，四网合一。',
        'scenario': 'AIDC/128 台/RoCE',
    },
]

# 模板中心元数据（validate_templates.py 必填字段：description/scenario/inputRequirements/outputDescription）
_TEMPLATE_META_BASE = {
    'inputRequirements': [
        'excel/hostname.xlsx - 设备名、角色、型号、环回/管理IP、BGP AS、MLAG 等基础信息',
        'excel/connection.xlsx - 终端连接表（每接口一行）+ VLAN 网关表（每 VLAN 一行）',
        'excel/ipaddress.xlsx - IP 规划地址表（对称表）+ 环回地址表 + 网段规划表',
        'excel/parameter.xlsx - 全局参数（PFC/CNP 队列、AAA、NTP、SNMP 等）',
    ],
    'outputDescription': '生成设备的 CLI 配置文件（sysname、VLAN、接口、EBGP/ECMP、PFC/CNP 无损参数、MLAG 等）。',
}

# 每角色固定设备数（SPINE/LEAF 由档位决定）
_ROLE_COUNT = {
    'SPINE': 0, 'LEAF': 0, 'STO_SPINE': 1, 'STO_LEAF': 2,
    'BIZ_AGG': 2, 'BIZ_ACCESS': 4, 'OOB_AGG': 1, 'OOB_ACCESS': 2,
}


def _name(site, vendor, abbr, rack, seq):
    return _NAMING['format'].format(site=site, rack=rack, vendor=vendor, abbr=abbr, seq=seq)


def build_plan(defn):
    """按定义构建 plan:table v1.2 dict（全量自包含：deviceList/connections/terminals）。"""
    site = defn['site']
    vendor = defn['vendor']
    models = defn['models']
    spines = defn['spines']
    leaves = defn['leaves']
    gpu = defn['gpuCount']
    rails = defn['rails']
    conv = defn['convergence']

    # ---- 设备清单（按角色顺序排 rack） ----
    device_list = []
    rack = 0
    for role in ('SPINE', 'LEAF', 'STO_SPINE', 'STO_LEAF', 'BIZ_AGG', 'BIZ_ACCESS', 'OOB_AGG', 'OOB_ACCESS'):
        count = spines if role == 'SPINE' else (leaves if role == 'LEAF' else _ROLE_COUNT[role])
        rinfo = _ROLE[role]
        for i in range(count):
            rack += 1
            seq = i + 1
            d = {
                'role': role,
                'scenario': rinfo['scenario'],
                'model': models[role],
                'name': _name(site, vendor, rinfo['abbr'], rack, seq),
                'asn': rinfo['asn'] + i,
                'rack': rack,
            }
            if role == 'LEAF':
                # 每个 LEAF 2 个计算 VLAN 网关（对齐 64 台样本 10.1.16.x 方案）
                d['gateways'] = [f'10.1.16.{2 * i + 1}', f'10.1.16.{2 * i + 2}']
            elif role == 'STO_LEAF':
                # 10 个存储 VLAN 网关（VLAN 序 201..209,200 对齐分配器结果）
                d['gateways'] = [f'10.1.32.{10 * i + j}' for j in range(1, 11)]
            elif role == 'BIZ_ACCESS':
                pair = (i // 2) + 1
                member = (i % 2) + 1
                d['mlag_pair'] = pair
                d['mlag_system_number'] = member
                # 单业务 VLAN 网关（member1→VLAN 301，member2→VLAN 300）
                d['gateways'] = [f'10.1.48.{i + 1}']
            device_list.append(d)

    # ---- 接线 ----
    connections = []
    leaf_devs = [d for d in device_list if d['role'] == 'LEAF']
    # 参数网：LEAF → SPINE（64 台 32 上联/LEAF，128 台 64 上联/LEAF，均摊到各 SPINE）
    uplink_per_leaf = 32 if gpu == 64 else 64
    chunk = uplink_per_leaf // spines
    for ln, leaf in enumerate(leaf_devs):
        for i in range(uplink_per_leaf):
            spine_idx = i // chunk + 1
            connections.append({
                'src': leaf['name'],
                'src_port': f'FourHundredGigE1/0/{33 + i}',
                'dst': 'SPINE',
                'rate': '400G',
                'desc': f'to-P-Spine-{spine_idx}',
            })
    # 存储网：STO_LEAF → STO_SPINE
    for sto in [d for d in device_list if d['role'] == 'STO_LEAF']:
        connections.append({
            'src': sto['name'],
            'src_port': 'TwoHundredGigE1/0/33',
            'dst': 'STO_SPINE',
            'rate': '200G',
            'desc': 'to-S-Spine',
        })
    # 业务网：BIZ_ACCESS → BIZ_AGG（每 ACC 双上联）
    for acc in [d for d in device_list if d['role'] == 'BIZ_ACCESS']:
        for i in range(2):
            connections.append({
                'src': acc['name'],
                'src_port': f'HundredGigE1/0/{i + 1}',
                'dst': 'BIZ_AGG',
                'rate': '100G',
                'desc': f'to-BIZ-AGG-{i + 1}',
            })
    # 带外网：OOB_ACCESS → OOB_AGG（trunk 上联）
    for oob in [d for d in device_list if d['role'] == 'OOB_ACCESS']:
        connections.append({
            'src': oob['name'],
            'src_port': 'GigabitEthernet1/0/25',
            'dst': 'OOB_AGG',
            'rate': '1G',
            'desc': 'to-OOB-AGG',
            'trunk': True,
        })

    # ---- 终端 ----
    terminals = []
    # 参数网 LEAF：每 GPU 每 rail 一个口（gpuCount×rails / leaves = 每 LEAF 口数）
    leaf_terms = gpu * rails // leaves
    for ln, leaf in enumerate(leaf_devs):
        base_vlan = 100 + 2 * ln
        rack_no = leaf['rack']
        for n in range(1, leaf_terms + 1):
            phys = (n - 1) // 2 + 1
            sub = (n - 1) % 2 + 1
            terminals.append({
                'src': leaf['name'],
                'src_port': f'TwoHundredGigE1/0/{phys}:{sub}',
                'vlan': base_vlan + (sub - 1),
                'desc': f'GPU-R{rack_no}-{n}',
            })
    # 存储网 STO_LEAF：32 口 / LEAF，VLAN 200-209 轮转（201 起始）
    for sn, sto in enumerate([d for d in device_list if d['role'] == 'STO_LEAF']):
        for n in range(1, 33):
            terminals.append({
                'src': sto['name'],
                'src_port': f'TwoHundredGigE1/0/{n}',
                'vlan': 200 + (n % 10),
                'desc': f'STO-{sn + 1}-{n}',
            })
    # 业务网 BIZ_ACCESS：32 口 / ACC，member1→VLAN 301 / member2→VLAN 300
    for an, acc in enumerate([d for d in device_list if d['role'] == 'BIZ_ACCESS']):
        vlan = 301 if acc['mlag_system_number'] == 1 else 300
        for n in range(1, 33):
            terminals.append({
                'src': acc['name'],
                'src_port': f'Twenty-FiveGigE1/0/{n}',
                'vlan': vlan,
                'desc': f'BIZ-{an + 1}-{n}',
            })
    # 带外网 OOB_ACCESS：8 口 / ACC，VLAN 400
    for on, oob in enumerate([d for d in device_list if d['role'] == 'OOB_ACCESS']):
        for n in range(1, 9):
            terminals.append({
                'src': oob['name'],
                'src_port': f'GigabitEthernet1/0/{n}',
                'vlan': 400,
                'desc': f'OOB-{on + 1}-{n}',
            })

    macro = {
        'site': site,
        'gpuCount': gpu,
        'pfcQueue': 3,
        'cnpQueue': 6,
        'bgpMaxPaths': 16,
        'convergence': conv,
        'rails': rails,
        'naming': _NAMING,
        'ipSegments': _IP_SEGMENTS,
        'deviceModels': dict(models),
        'asRange': [65001, 65500],
        'vlanRanges': _VLAN_RANGES,
        'ospf': _OSPF,
    }
    plan = {
        'meta': {
            'project': f'aidc_{gpu}',
            'site': site,
            'version': '1.2',
            'schema': 'plan:table/1.2',
            'generatedAt': _FIXED_GENERATED_AT,
            'source': _BRIDGE['source'],
            'projectType': _BRIDGE['projectType'],
            'bridgeVersion': _BRIDGE['bridgeVersion'],
            'projectId': defn['project_id'],
            'planHash': plan_hash(macro),
            'planVersion': 1,
            'projectName': defn['key'],
        },
        'macro': macro,
        'topology': {
            'layers': 2,
            'spines': spines,
            'leaves': leaves,
            'pods': None,
            'scale': {'gpuCount': gpu, 'spine': spines, 'leaf': leaves},
        },
        'deviceList': device_list,
        'connections': connections,
        'terminals': terminals,
        'protocols': {
            'ospf': _OSPF,
            'bgp': {'asRange': [65001, 65500], 'ecmp': 16},
        },
        'convergence': {'compute': conv, 'storage': 1, 'biz': 1},
    }
    return plan


def device_count(plan):
    return len(plan.get('deviceList', []))


def count_by_role(plan):
    out = {}
    for d in plan.get('deviceList', []):
        out[d['role']] = out.get(d['role'], 0) + 1
    return out


def build_all_plans():
    """构建全部 4 份 plan，返回 {key: plan}。"""
    return {d['key']: build_plan(d) for d in SAMPLE_DEFS}


# ---- 示例注册（生成 MC 项目 → 落地 example/） ----

_TEMPLATE_README = {
    '64H100-IB': '64 台 H100（NVIDIA H100 × 64）AIDC 单项目 · InfiniBand 无损计算网络。\n'
                 '拓扑：2 SPINE + 8 LEAF + 1 STO_SPINE + 2 STO_LEAF + 2 BIZ_AGG + 4 BIZ_ACCESS\n'
                 '      + 1 OOB_AGG + 2 OOB_ACCESS = 22 台；四表格多 sheet，四网合一。\n'
                 '可调参数：PFC队列/CNP队列（0-7）。IB 收敛比 1:1。',
    '64H100-RoCE': '64 台 H100 AIDC 单项目 · RoCEv2（RDMA over Converged Ethernet）。\n'
                   '拓扑：2 SPINE + 8 LEAF + 1 STO_SPINE + 2 STO_LEAF + 2 BIZ_AGG + 4 BIZ_ACCESS\n'
                   '      + 1 OOB_AGG + 2 OOB_ACCESS = 22 台；四表格多 sheet，四网合一。\n'
                   '可调参数：PFC队列/CNP队列（0-7）。RoCE 收敛比 3:1。',
    '128H100-IB': '128 台 H100 AIDC 单项目 · InfiniBand 无损计算网络。\n'
                  '拓扑：4 SPINE + 8 LEAF + 1 STO_SPINE + 2 STO_LEAF + 2 BIZ_AGG + 4 BIZ_ACCESS\n'
                  '      + 1 OOB_AGG + 2 OOB_ACCESS = 24 台；四表格多 sheet，四网合一。\n'
                  '可调参数：PFC队列/CNP队列（0-7）。IB 收敛比 1:1。',
    '128H100-RoCE': '128 台 H100 AIDC 单项目 · RoCEv2（RDMA over Converged Ethernet）。\n'
                    '拓扑：4 SPINE + 8 LEAF + 1 STO_SPINE + 2 STO_LEAF + 2 BIZ_AGG + 4 BIZ_ACCESS\n'
                    '      + 1 OOB_AGG + 2 OOB_ACCESS = 24 台；四表格多 sheet，四网合一。\n'
                    '可调参数：PFC队列/CNP队列（0-7）。RoCE 收敛比 3:1。',
}


def _write_json(path, data):
    os.makedirs(os.path.dirname(path), exist_ok=True)
    with open(path, 'w', encoding='utf-8') as f:
        json.dump(data, f, ensure_ascii=False, indent=2)


def _normalize_meta(meta):
    """规范 template.meta.json：补充模板中心必填字段 + 固定时间戳。"""
    key = meta.get('name', '')
    defn = next((d for d in SAMPLE_DEFS if d['key'] == key), None)
    out = dict(meta)
    out['updatedAt'] = _FIXED_META_TS
    out.update(_TEMPLATE_META_BASE)
    if defn:
        out['description'] = defn['description']
        out['scenario'] = defn['scenario']
    # 归一 changelog 时间戳（重复生成幂等）
    for entry in out.get('changelog', []):
        entry['at'] = _FIXED_GENERATED_AT
    return out


def register_sample(defn, example_dir, workspace_dir):
    """导入 plan 生成 MC 项目 → 复制到 example/<key>/ 并富化 meta/README。

    返回落地目录绝对路径。
    """
    from intent.planner.plantable_importer import import_plan_auto

    key = defn['key']
    plan = build_plan(defn)
    proj_dir = os.path.join(workspace_dir, key)
    summary = import_plan_auto(plan, workspace_dir, explicit_dir=proj_dir)
    if summary.get('error'):
        raise RuntimeError(f'{key} 导入失败: {summary["error"]}')

    target = os.path.join(example_dir, key)
    if os.path.exists(target):
        shutil.rmtree(target)
    os.makedirs(target, exist_ok=True)
    for entry in sorted(os.listdir(proj_dir)):
        if entry == 'allocator_state.json':
            continue  # 派生状态不入仓
        src = os.path.join(proj_dir, entry)
        dst = os.path.join(target, entry)
        if os.path.isdir(src):
            shutil.copytree(src, dst)
        else:
            shutil.copy2(src, dst)

    # 富化 template.meta.json（模板中心必填 + 稳定时间戳）
    meta_path = os.path.join(target, 'template.meta.json')
    with open(meta_path, encoding='utf-8') as f:
        meta = json.load(f)
    _write_json(meta_path, _normalize_meta(meta))

    # 覆写 README（按档位/组网说明）
    with open(os.path.join(target, 'README.md'), 'w', encoding='utf-8') as f:
        f.write(f'# {key}\n\n{_TEMPLATE_README[key]}\n')
    return target


def register_samples(example_dir=None, workspace_dir=None):
    """注册全部 4 个示例到 example/。返回 [(key, target_dir)]。"""
    example_dir = example_dir or EXAMPLE_DIR
    import tempfile
    tmp_ws = workspace_dir or tempfile.mkdtemp(prefix='mc_samples_')
    created = []
    try:
        for defn in SAMPLE_DEFS:
            target = register_sample(defn, example_dir, tmp_ws)
            created.append((defn['key'], target))
    finally:
        if not workspace_dir:
            shutil.rmtree(tmp_ws, ignore_errors=True)
    return created
