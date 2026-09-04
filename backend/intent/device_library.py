"""
MC 设备库（H1，D-4）。

源自 AL 权威库（AIDC AutoLink-Client/template/device_library）校正后子集，
与 AL 保持一致（`device_library.json` 为静态拷贝，一致性由测试保证）。
角色 → 型号 由 ROLE_DEVICE_ID 解析到设备库。
"""

import json
import os

_DEVICES = None
_DEVICE_LIBRARY_PATH = os.path.join(os.path.dirname(__file__), 'device_library.json')
DEVICE_LIBRARY_SCHEMA = 'mc.device-library/1'
DEVICE_LIBRARY_VERSION = 1

# 角色 → 设备 id（D-1~D-3 定稿，RoCE/以太默认）
ROLE_DEVICE_ID = {
    'SPINE': 'h3c_s9827',
    'LEAF': 'h3c_s9827',
    'STO_SPINE': 'h3c_s9825_128b',
    'STO_LEAF': 'h3c_s9825_128b',
    'BIZ_AGG': 'h3c_s9850_32h',
    'BIZ_ACCESS': 'h3c_s6850_56hf',
    'OOB_AGG': 'h3c_s6805_56hf_g',
    'OOB_ACCESS': 'h3c_s5560x_54c_ei',
}

# 5.0.1（501-c）：IB（NVIDIA Quantum）角色 → 设备 id（fabric 感知解析）。
# 业务/带外四角色两 fabric 共用 H3C（IB 仅参数/存储网换 NVIDIA 交换机）。
IB_ROLE_DEVICE_ID = {
    'SPINE': 'nvidia_mqm9700_64_400g_ib',
    'LEAF': 'nvidia_mqm9700_64_400g_ib',
    'STO_SPINE': 'nvidia_mqm9700_64_400g_ib',
    'STO_LEAF': 'nvidia_mqm9700_64_400g_ib',
    'BIZ_AGG': 'h3c_s9850_32h',
    'BIZ_ACCESS': 'h3c_s6850_56hf',
    'OOB_AGG': 'h3c_s6805_56hf_g',
    'OOB_ACCESS': 'h3c_s5560x_54c_ei',
}

# 协议族 → 角色映射（roce=以太 RoCEv2 默认；ib=InfiniBand）
FABRIC_ROLE_DEVICE_ID = {'roce': ROLE_DEVICE_ID, 'ib': IB_ROLE_DEVICE_ID}
FABRICS = ('roce', 'ib')


def _load():
    global _DEVICES
    if _DEVICES is None:
        with open(_DEVICE_LIBRARY_PATH, encoding='utf-8') as f:
            _DEVICES = {d['id']: d for d in json.load(f)}
    return _DEVICES


def _invalidate_cache():
    global _DEVICES
    _DEVICES = None


def load_devices_from(path: str) -> dict:
    """从指定 JSON 路径加载设备库（id → device dict）；文件不存在/损坏 → 空库。"""
    if not os.path.exists(path):
        return {}
    try:
        with open(path, encoding='utf-8') as f:
            data = json.load(f)
    except (OSError, ValueError):
        return {}
    if isinstance(data, dict) and data.get('schema'):
        data = data.get('devices', [])
    return {d['id']: d for d in data if isinstance(d, dict) and d.get('id')}


def export_device_library(out_path: str) -> dict:
    """4.8.0（F8-3 / 48-c）：设备库导出为可移植 JSON/zip（schema+版本+条目清单）。

    - .zip：manifest.json（顶层 bundle）+ devices.json（条目清单）
    - 其他/无后缀：单文件 JSON bundle
    """
    devices = all_devices()
    bundle = {
        'schema': DEVICE_LIBRARY_SCHEMA,
        'version': DEVICE_LIBRARY_VERSION,
        'kind': 'device-library',
        'count': len(devices),
        'devices': devices,
    }
    os.makedirs(os.path.dirname(os.path.abspath(out_path)), exist_ok=True)
    if str(out_path).lower().endswith('.zip'):
        import zipfile
        with zipfile.ZipFile(out_path, 'w', zipfile.ZIP_DEFLATED) as zf:
            zf.writestr('manifest.json', json.dumps(bundle, ensure_ascii=False, indent=2))
            zf.writestr('devices.json', json.dumps({'devices': devices}, ensure_ascii=False, indent=2))
    else:
        with open(out_path, 'w', encoding='utf-8') as f:
            json.dump(bundle, f, ensure_ascii=False, indent=2)
    return bundle


def _read_device_package(package_path: str) -> dict:
    """读取设备库包（JSON 或 zip），校验 schema，返回 bundle。"""
    if str(package_path).lower().endswith('.zip'):
        import zipfile
        with zipfile.ZipFile(package_path) as zf:
            if 'manifest.json' not in zf.namelist():
                raise ValueError('设备库包缺少 manifest.json')
            for member in zf.infolist():
                name = member.filename.replace('\\', '/')
                if name.startswith('/') or (len(name) > 1 and name[1] == ':') or '..' in name.split('/'):
                    raise ValueError(f'设备库包条目含不安全路径: {member.filename}')
            try:
                bundle = json.loads(zf.read('manifest.json').decode('utf-8'))
            except ValueError as e:
                raise ValueError(f'设备库包 manifest 无效: {e}')
    else:
        try:
            with open(package_path, encoding='utf-8') as f:
                bundle = json.load(f)
        except (OSError, ValueError) as e:
            raise ValueError(f'设备库包读取失败: {e}')
    if bundle.get('schema') != DEVICE_LIBRARY_SCHEMA:
        raise ValueError(f'设备库包 schema 不受支持: {bundle.get("schema")}')
    return bundle


def import_device_library(package_path: str, target_path: str | None = None) -> dict:
    """4.8.0（F8-3 / 48-c）：导入设备库包并合并（新增 added / 同 id 同内容 skipped 去重 /
    同 id 不同内容 updated 冲突提示，last-wins 覆盖）。target 缺省写回内置 device_library.json。"""
    bundle = _read_device_package(package_path)
    devices = bundle.get('devices', [])
    target = target_path or _DEVICE_LIBRARY_PATH
    existing = load_devices_from(target)
    added, updated, skipped = [], [], []
    for d in devices:
        did = d.get('id') if isinstance(d, dict) else None
        if not did:
            continue
        if did in existing:
            if existing[did] == d:
                skipped.append(did)
            else:
                updated.append(did)
        else:
            added.append(did)
    merged = dict(existing)
    for d in devices:
        did = d.get('id') if isinstance(d, dict) else None
        if did:
            merged[did] = d
    with open(target, 'w', encoding='utf-8') as f:
        json.dump(sorted(merged.values(), key=lambda x: x.get('id', '')), f, ensure_ascii=False, indent=2)
    if target == _DEVICE_LIBRARY_PATH:
        _invalidate_cache()
    return {
        'ok': True,
        'schema': DEVICE_LIBRARY_SCHEMA,
        'total': len(devices),
        'added': added,
        'updated': updated,
        'skipped': skipped,
        'conflicts': updated,
        'local_count': len(merged),
        'target': target,
    }


def get_device(device_id):
    """设备 id → 设备 dict（无则 None）。"""
    return _load().get(device_id)


def all_devices():
    return list(_load().values())


def model_str(device_id):
    """设备 id → 型号字符串（如 'H3C S9827'）。"""
    d = get_device(device_id)
    if d:
        vendor = d.get('vendor', 'H3C')
        return f'{vendor} {d.get("model", device_id)}'
    return device_id


def role_device_id(role, fabric='roce'):
    """角色 → 设备 id（fabric 感知：roce 默认 / ib）。无映射返回 None。"""
    return FABRIC_ROLE_DEVICE_ID.get(fabric, ROLE_DEVICE_ID).get(role)


def role_model_str(role, fabric='roce'):
    """角色 → 型号字符串（按 fabric 从设备库解析，无则空串）。"""
    did = role_device_id(role, fabric)
    return model_str(did) if did else ''


def device_protocol(device_id):
    """设备协议族：'ib' / 'roce' / None（按条目 protocol 字段，缺省按厂商推断）。"""
    d = get_device(device_id)
    if not d:
        return None
    protocol = d.get('protocol')
    if protocol:
        return protocol
    return 'ib' if str(d.get('vendor', '')).upper() == 'NVIDIA' else 'roce'


def lookup_device_by_model(model):
    """按 'Vendor Model' 型号字符串查找设备 id（用于 plan deviceModels → 设备库解析）。

    先精确匹配 'vendor model'，再退化为 model 模糊匹配（归一化空白/大小写）。
    """
    target = ' '.join(str(model or '').split()).lower()
    for d in all_devices():
        exact = f"{d.get('vendor', '')} {d.get('model', '')}".strip()
        if ' '.join(exact.split()).lower() == target:
            return d['id']
    for d in all_devices():
        if target.endswith(' '.join(str(d.get('model', '')).split()).lower()):
            return d['id']
    return None


def resolve_models_fabric(models: dict) -> str:
    """由角色→型号 dict（如 plan macro.deviceModels）推断协议族：参数网含 NVIDIA → 'ib'，否则 'roce'。"""
    for role in ('SPINE', 'LEAF', 'STO_SPINE', 'STO_LEAF'):
        m = str((models or {}).get(role, '') or '')
        if m.upper().startswith('NVIDIA'):
            return 'ib'
    return 'roce'
