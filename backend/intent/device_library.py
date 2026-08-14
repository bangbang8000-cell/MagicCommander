"""
MC 设备库（H1，D-4）。

源自 AL 权威库（AIDC AutoLink-Client/template/device_library）校正后子集，
与 AL 保持一致（`device_library.json` 为静态拷贝，一致性由测试保证）。
角色 → 型号 由 ROLE_DEVICE_ID 解析到设备库。
"""

import json
import os

_DEVICES = None

# 角色 → 设备 id（D-1~D-3 定稿）
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


def _load():
    global _DEVICES
    if _DEVICES is None:
        p = os.path.join(os.path.dirname(__file__), 'device_library.json')
        with open(p, encoding='utf-8') as f:
            _DEVICES = {d['id']: d for d in json.load(f)}
    return _DEVICES


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


def role_model_str(role):
    """角色 → 型号字符串（从设备库解析，无则空串）。"""
    did = ROLE_DEVICE_ID.get(role)
    return model_str(did) if did else ''
