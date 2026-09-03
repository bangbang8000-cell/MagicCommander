"""H1 设备库测试（D-4 / 501-c）：MC 设备库加载 + 角色型号解析 + 双端一致性 + fabric 感知。"""
import glob
import importlib.util
import json
import os

from intent.device_library import (
    FABRIC_ROLE_DEVICE_ID,
    IB_ROLE_DEVICE_ID,
    ROLE_DEVICE_ID,
    all_devices,
    device_protocol,
    get_device,
    lookup_device_by_model,
    resolve_models_fabric,
    role_device_id,
    role_model_str,
)
from intent.planner.plantable import _SCN_MODEL
from intent.project_aidc import ROLE_SCENARIO

REPO = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
VALIDATE_SCRIPT = os.path.join(REPO, 'scripts', 'validate_device_library.py')

_SCN_TO_ROLE = {
    'SPINE': 'SPINE', 'LEAF': 'LEAF', 'STO_SPINE': 'STO_SPINE', 'STO_LEAF': 'STO_LEAF',
    'BIZAGG': 'BIZ_AGG', 'BIZACC': 'BIZ_ACCESS', 'OOBAGG': 'OOB_AGG', 'OOBACC': 'OOB_ACCESS',
}


def test_library_loads():
    devs = all_devices()
    assert len(devs) >= 13  # 501-c：9 条 H3C + 4 条 NVIDIA IB
    ids = [d['id'] for d in devs]
    assert len(ids) == len(set(ids))  # 无重复 id
    # 501-c：每条含 protocol 字段且取值合法
    for d in devs:
        assert d.get('protocol') in ('ib', 'roce'), d['id']
        for f in ('id', 'vendor', 'model', 'port_count', 'port_speed', 'port_type'):
            assert d.get(f), f'{d["id"]} 缺 {f}'


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


# ---- 501-c：fabric 感知解析 + protocol + 设备库校验脚本 ----

def test_ib_fabric_role_models():
    """IB fabric：参数/存储四角色解析到 NVIDIA Quantum；业务/带外保持 H3C。"""
    assert role_model_str('SPINE', 'ib') == 'NVIDIA Quantum QM9700'
    assert role_model_str('LEAF', 'ib') == 'NVIDIA Quantum QM9700'
    assert role_model_str('STO_SPINE', 'ib') == 'NVIDIA Quantum QM9700'
    assert role_model_str('STO_LEAF', 'ib') == 'NVIDIA Quantum QM9700'
    # 业务/带外平面两 fabric 共用 H3C
    assert role_model_str('BIZ_AGG', 'ib') == 'H3C S9850-32H'
    assert role_model_str('OOB_ACCESS', 'ib') == 'H3C S5560X-54C-EI'
    # RoCE 默认不变
    assert role_model_str('SPINE') == 'H3C S9827'
    assert role_model_str('SPINE', 'roce') == 'H3C S9827'


def test_role_device_id_fabric():
    assert role_device_id('SPINE', 'roce') == 'h3c_s9827'
    assert role_device_id('SPINE', 'ib') == 'nvidia_mqm9700_64_400g_ib'
    assert role_device_id('STO_LEAF', 'ib') == 'nvidia_mqm9700_64_400g_ib'
    assert role_device_id('BIZ_AGG', 'ib') == 'h3c_s9850_32h'
    assert role_device_id('UNKNOWN', 'roce') is None
    assert role_device_id('SPINE', 'unknown_fabric') == 'h3c_s9827'  # 未知 fabric 回退默认


def test_fabric_maps_cover_roles():
    """两 fabric 映射覆盖同一角色集合，且 IB 参数/存储角色指向 NVIDIA（协议=ib）。"""
    assert set(ROLE_DEVICE_ID) == set(IB_ROLE_DEVICE_ID)
    assert set(FABRIC_ROLE_DEVICE_ID) == {'roce', 'ib'}
    for role in ('SPINE', 'LEAF', 'STO_SPINE', 'STO_LEAF'):
        assert device_protocol(IB_ROLE_DEVICE_ID[role]) == 'ib'


def test_device_protocol():
    assert device_protocol('nvidia_mqm9700_64_400g_ib') == 'ib'
    assert device_protocol('nvidia_mqm8700_40_200g_ib') == 'ib'
    assert device_protocol('h3c_s9827') == 'roce'
    assert device_protocol('h3c_s9825_128b') == 'roce'
    assert device_protocol('nope_missing') is None


def test_lookup_device_by_model():
    """plan deviceModels 型号字符串 → 设备 id（协议校验前置解析）。"""
    assert lookup_device_by_model('NVIDIA Quantum QM9700') == 'nvidia_mqm9700_64_400g_ib'
    assert lookup_device_by_model('NVIDIA Quantum QM8700') == 'nvidia_mqm8700_40_200g_ib'
    assert lookup_device_by_model('H3C S9827') == 'h3c_s9827'
    assert lookup_device_by_model('H3C S9825-128B') == 'h3c_s9825_128b'
    assert lookup_device_by_model('H3C 不存在') is None


def test_resolve_models_fabric():
    assert resolve_models_fabric({'SPINE': 'NVIDIA Quantum QM9700', 'LEAF': 'NVIDIA Quantum QM9700'}) == 'ib'
    assert resolve_models_fabric({'SPINE': 'H3C S9827', 'LEAF': 'H3C S9827'}) == 'roce'
    assert resolve_models_fabric({}) == 'roce'


def _load_validate_module():
    spec = importlib.util.spec_from_file_location('mc_validate_device_library', VALIDATE_SCRIPT)
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    return mod


def test_validate_device_library_passes_on_committed():
    """设备库校验脚本对提交库通过（id 唯一/字段完整/protocol/角色映射/AL 对账）。"""
    mod = _load_validate_module()
    assert mod.validate_device_library() == []


def test_validate_device_library_catches_issues(tmp_path):
    """校验脚本能检出重复 id / 缺字段 / 角色指向缺失设备。"""
    mod = _load_validate_module()
    lib = json.load(open(mod.LIB_PATH, encoding='utf-8'))
    bad = list(lib) + [dict(lib[0])]  # 复制首条 → id 重复
    dup_path = str(tmp_path / 'dup.json')
    json.dump(bad, open(dup_path, 'w', encoding='utf-8'))
    assert any('重复' in p for p in mod.validate_device_library(dup_path))

    missing = [dict(lib[0])]
    missing[0].pop('port_speed')
    miss_path = str(tmp_path / 'miss.json')
    json.dump(missing, open(miss_path, 'w', encoding='utf-8'))
    assert any('必填' in p for p in mod.validate_device_library(miss_path))
