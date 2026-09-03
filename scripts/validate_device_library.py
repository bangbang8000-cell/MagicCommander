"""MagicCommander 设备库校验脚本（5.0.1，501-c）。

校验 backend/intent/device_library.json：
  - 条目字段完整性：id / vendor / model / port_count / port_speed / port_type / applicable_networks
  - id 唯一
  - 协议字段（protocol ∈ ib/roce）与厂商推断一致
  - 角色映射存在：ROLE_DEVICE_ID（roce）与 IB_ROLE_DEVICE_ID（ib）每角色均解析到设备库
  - 与 AL 权威库规格一致性：对账 AIDC AutoLink-Client/template/device_library/switches/*
    （port_count / port_speed / port_type 严格一致；model 按平台 token 归一比对）

用法：
  python scripts/validate_device_library.py            # 校验（退出码 0/1）
  python scripts/validate_device_library.py --list     # 仅列出设备库条目
"""
import glob
import json
import os
import re
import sys

REPO = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
LIB_PATH = os.path.join(REPO, 'backend', 'intent', 'device_library.json')
BACKEND = os.path.join(REPO, 'backend')

# AL 权威库根（在场时对账；不在场跳过，仅本地结构校验）
AL_ROOT = r'd:/MyCoding/MC-AL/AIDC AutoLink-Client/template/device_library'

# 必填字段
REQUIRED_FIELDS = ('id', 'vendor', 'model', 'port_count', 'port_speed', 'port_type')
NETWORK_DIR = {'param': 'param', 'storage': 'storage', 'biz': 'biz', 'oob': 'oob'}


def _platform_token(model: str) -> str:
    """归一化型号 → 平台 token：优先 QM/SN 数字，否则全小写无空白。"""
    m = re.search(r'(QM|SN)\d+', str(model or ''))
    if m:
        return m.group(0).lower()
    return ' '.join(str(model or '').split()).lower()


_RATE_RE = re.compile(r'^(\d+(?:\.\d+)?)\s*[Gg]$')


def _rate_gbps(rate):
    m = _RATE_RE.match(str(rate or '').strip())
    return float(m.group(1)) if m else None


def _load_entries(path):
    with open(path, encoding='utf-8') as f:
        data = json.load(f)
    return data


def _load_al_index():
    """扫描 AL switches/*/*.json → {id: entry}；AL 仓不在场返回 None。"""
    root = os.path.join(AL_ROOT, 'switches')
    if not os.path.isdir(root):
        return None
    out = {}
    for p in glob.glob(os.path.join(root, '*', '*.json')):
        try:
            with open(p, encoding='utf-8') as f:
                d = json.load(f)
        except (OSError, ValueError):
            continue
        if isinstance(d, dict) and d.get('id'):
            out[d['id']] = d
    return out


def validate_device_library(path: str | None = None) -> list[str]:
    """设备库校验，返回问题列表（空 = 通过）。"""
    path = path or LIB_PATH
    problems = []
    try:
        devices = _load_entries(path)
    except (OSError, ValueError) as e:
        return [f'设备库读取失败: {e}']

    ids = [d.get('id') for d in devices if isinstance(d, dict)]
    if len(ids) != len(set(ids)):
        dup = {i for i in ids if ids.count(i) > 1}
        problems.append(f'设备 id 重复: {sorted(dup)}')

    for d in devices:
        if not isinstance(d, dict):
            problems.append(f'非对象条目: {d!r}')
            continue
        did = d.get('id', '?')
        missing = [f for f in REQUIRED_FIELDS if d.get(f) in (None, '')]
        if missing:
            problems.append(f'{did} 缺少必填字段: {missing}')
        protocol = d.get('protocol')
        if protocol and protocol not in ('ib', 'roce'):
            problems.append(f'{did} protocol 非法: {protocol}')
        elif not protocol:
            problems.append(f'{did} 缺 protocol 字段（ib/roce）')
        else:
            inferred = 'ib' if str(d.get('vendor', '')).upper() == 'NVIDIA' else 'roce'
            if protocol != inferred:
                problems.append(f'{did} protocol({protocol}) 与厂商({d.get("vendor")})推断({inferred})不一致')
        nets = d.get('applicable_networks')
        if not nets or not isinstance(nets, list):
            problems.append(f'{did} 缺 applicable_networks')
        elif any(n not in NETWORK_DIR for n in nets):
            problems.append(f'{did} applicable_networks 含未知平面: {nets}')
        # 端口数/速率/类型 基础合理性
        try:
            if int(d.get('port_count', 0)) <= 0:
                problems.append(f'{did} port_count 非法: {d.get("port_count")}')
        except (TypeError, ValueError):
            problems.append(f'{did} port_count 非整数: {d.get("port_count")}')
        pmax = d.get('port_speed_max')
        if pmax:
            base = _rate_gbps(d.get('port_speed'))
            mx = _rate_gbps(pmax)
            if base is None or mx is None or mx < base:
                problems.append(f'{did} port_speed_max({pmax}) 应 ≥ port_speed({d.get("port_speed")})')

    # 角色映射存在
    sys.path.insert(0, BACKEND)
    from intent import device_library as dl
    # 仅参数/存储平面（SPINE/LEAF/STO_*）要求协议族 == fabric；业务/带外平面为以太网，两 fabric 均用 H3C
    _PARAM_STO_ROLES = ('SPINE', 'LEAF', 'STO_SPINE', 'STO_LEAF')
    for fabric, mapping in (('roce', dl.ROLE_DEVICE_ID), ('ib', dl.IB_ROLE_DEVICE_ID)):
        for role, did in mapping.items():
            if did not in ids:
                problems.append(f'{fabric} 角色 {role} → 设备 {did} 不在设备库')
            elif role in _PARAM_STO_ROLES and dl.device_protocol(did) != fabric:
                problems.append(f'{fabric} 角色 {role} → {did} 协议族({dl.device_protocol(did)})与 fabric({fabric})不符')
    if len(dl.FABRIC_ROLE_DEVICE_ID) == len(set(dl.FABRIC_ROLE_DEVICE_ID)) is False:  # pragma: no cover
        problems.append('FABRIC_ROLE_DEVICE_ID 键冲突')

    # 与 AL 权威库对账
    al = _load_al_index()
    if al:
        for d in devices:
            did = d.get('id')
            a = al.get(did)
            if a is None:
                continue  # MC 自有条目（非 AL 交换机清单）不强制
            for field in ('port_count', 'port_speed', 'port_type'):
                if d.get(field) != a.get(field):
                    problems.append(f'{did}.{field} 与 AL 不一致: {d.get(field)} vs {a.get(field)}')
            if _platform_token(d.get('model')) != _platform_token(a.get('model')):
                problems.append(f'{did}.model 与 AL 平台不一致: {d.get("model")} vs {a.get("model")}')
        al_ids = set(al)
        lib_ids = set(ids)
        if not lib_ids <= al_ids:
            problems.append(f'设备库存在 AL 权威库外条目: {sorted(lib_ids - al_ids)}')
    return problems


def main():
    if '--list' in sys.argv:
        devices = _load_entries(LIB_PATH)
        for d in devices:
            print('{id}\t{vendor} {model}\t{port_count}×{port_speed} {port_type}\t{protocol}'.format(**d))
        return 0
    problems = validate_device_library()
    if problems:
        print(f'设备库校验 FAIL（{len(problems)} 项）：')
        for p in problems:
            print(f'  - {p}')
        return 1
    al = _load_al_index()
    al_note = f'，AL 权威库对账 {len(al)} 条在场' if al else '（AL 权威库不在场，跳过对账）'
    devices = _load_entries(LIB_PATH)
    print(f'设备库校验 PASS：{len(devices)} 条（id 唯一/字段完整/protocol 一致/角色映射存在{al_note}）')
    return 0


if __name__ == '__main__':
    sys.exit(main())
