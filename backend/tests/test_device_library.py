"""H1 设备库测试（D-4）：MC 设备库加载 + 角色型号解析 + 双端一致性。"""
import glob
import json
import os

from intent.device_library import ROLE_DEVICE_ID, all_devices, get_device, role_model_str
from intent.planner.plantable import _SCN_MODEL
from intent.project_aidc import ROLE_SCENARIO

_SCN_TO_ROLE = {
    'SPINE': 'SPINE', 'LEAF': 'LEAF', 'STO_SPINE': 'STO_SPINE', 'STO_LEAF': 'STO_LEAF',
    'BIZAGG': 'BIZ_AGG', 'BIZACC': 'BIZ_ACCESS', 'OOBAGG': 'OOB_AGG', 'OOBACC': 'OOB_ACCESS',
}


def test_library_loads():
    devs = all_devices()
    assert len(devs) >= 8
    ids = [d['id'] for d in devs]
    assert len(ids) == len(set(ids))  # 无重复 id


def test_role_models_match_library():
    for role, did in ROLE_DEVICE_ID.items():
        dev = get_device(did)
        assert dev is not None, f'角色 {role} 设备 {did} 缺失'
        expected = f"{dev['vendor']} {dev['model']}"
        assert role_model_str(role) == expected
        # ROLE_SCENARIO 与设备库一致（单一来源）
        assert ROLE_SCENARIO[role][1] == expected


def test_role_model_d13():
    # D-1~D-3 定稿型号
    assert role_model_str('BIZ_AGG') == 'H3C S9850-32H'
    assert role_model_str('BIZ_ACCESS') == 'H3C S6850-56HF'
    assert role_model_str('OOB_AGG') == 'H3C S6805-56HF-G'
    assert role_model_str('OOB_ACCESS') == 'H3C S5560X-54C-EI'
    assert role_model_str('SPINE') == 'H3C S9827'
    assert role_model_str('STO_SPINE') == 'H3C S9825-128B'


def test_scn_model_single_source():
    # _SCN_MODEL 由 ROLE_SCENARIO 派生（消除重复硬编码）
    for scn, role in _SCN_TO_ROLE.items():
        assert _SCN_MODEL[scn] == ROLE_SCENARIO[role][1]


def test_consistency_with_al_library():
    """双端一致：MC 角色型号 ⊆ AL 权威库且规格一致（AL 仓在场时校验）。"""
    al_root = r'd:/MyCoding/MC-AL/AIDC AutoLink-Client/template/device_library'
    if not os.path.isdir(al_root):
        return  # AL 仓不在场则跳过
    al = {}
    for p in glob.glob(os.path.join(al_root, 'switches', '*', '*.json')):
        d = json.load(open(p, encoding='utf-8'))
        al[d['id']] = d
    for role, did in ROLE_DEVICE_ID.items():
        m = get_device(did)
        a = al.get(did)
        assert a is not None, f'AL 权威库缺 {did}'
        for field in ('model', 'port_count', 'port_speed', 'port_type'):
            assert m[field] == a[field], f'{did}.{field} 双端不一致: {m[field]} vs {a[field]}'
