"""AL→MC 管道测试（plan:table 生成 / 转换 / 渲染）。"""
import os
import tempfile

import pandas as pd
import pytest

from intent.pilot64 import build_pilot64_context
from intent.planner.plantable import generate_plantable
from intent.planner.plantable_importer import plantable_to_context, plantable_to_project
from intent.planner.validate import validate_bridge_meta, validate_plan

sys_path_ok = True
try:
    from pre_processing import PreProcessing
    import config as mc_config
except Exception:  # noqa: BLE001
    sys_path_ok = False


def _snapshot(project_dir):
    """项目文件字节快照（相对路径 → bytes）。"""
    out = {}
    for root, _, files in os.walk(project_dir):
        for f in files:
            p = os.path.join(root, f)
            with open(p, 'rb') as fh:
                out[os.path.relpath(p, project_dir)] = fh.read()
    return out


class TestPlantable:
    def test_generate_plantable_structure(self):
        ctx = build_pilot64_context()
        plan = generate_plantable(ctx)
        assert plan['meta']['project'] == 'aidc_pilot64'
        assert plan['meta']['source'] == 'autolink'
        assert plan['meta']['projectType'] == 'aidc'
        assert plan['macro']['pfcQueue'] == 3
        assert plan['macro']['cnpQueue'] == 6
        # 设备清单：22 台
        total = sum(d['count'] for d in plan['deviceList'])
        assert total == 22
        # 接线/终端
        assert plan['connections']
        assert plan['terminals']
        # 角色覆盖
        roles = {d['role'] for d in plan['deviceList']}
        assert roles == {'SPINE', 'LEAF', 'STO_SPINE', 'STO_LEAF',
                         'BIZ_AGG', 'BIZ_ACCESS', 'OOB_AGG', 'OOB_ACCESS'}

    def test_plantable_to_context_tunables(self):
        ctx = build_pilot64_context()
        plan = generate_plantable(ctx)
        plan['macro']['pfcQueue'] = 5
        plan['macro']['cnpQueue'] = 7
        ctx2 = plantable_to_context(plan)
        assert ctx2.globals['pfc_queue'] == 5
        assert ctx2.globals['cnp_queue'] == 7

    def test_plantable_to_project(self):
        ctx = build_pilot64_context()
        plan = generate_plantable(ctx)
        with tempfile.TemporaryDirectory() as tmp:
            project = os.path.join(tmp, 'aidc_pilot64')
            plantable_to_project(plan, project)
            assert os.path.exists(os.path.join(project, 'para.xlsx'))
            assert os.path.exists(os.path.join(project, 'excel', 'hostname.xlsx'))

    @pytest.mark.skipif(not sys_path_ok, reason='MC pre_processing 不可用')
    def test_end_to_end_plan_render(self, monkeypatch):
        ctx = build_pilot64_context()
        plan = generate_plantable(ctx)
        with tempfile.TemporaryDirectory() as tmp:
            project = os.path.join(tmp, 'aidc_pilot64')
            plantable_to_project(plan, project)
            pd.DataFrame({'项目名称': ['aidc_pilot64']}).to_excel(
                os.path.join(tmp, 'MC_Para.xlsx'), sheet_name='项目名称', index=False)
            monkeypatch.setattr(mc_config, 'WORKSPACE_DIR', tmp)
            pp = PreProcessing()
            pp.workspace = tmp
            pp.read_MC_para('MC_Para.xlsx')
            pp.execute_render('1', 'device_name')
            out = os.path.join(tmp, 'aidc_pilot64', 'output')
            td = os.listdir(out)[0]
            total = sum(
                len([f for f in os.listdir(os.path.join(out, td, r)) if f.endswith('.txt')])
                for r in os.listdir(os.path.join(out, td)))
            assert total == 22


class TestBridgeContract:
    """契约 v1.1 桥接标识（G0）：双端判别 + camelCase 统一 + 缺字段回报。"""

    def test_plan_has_bridge_meta(self):
        ctx = build_pilot64_context()
        plan = generate_plantable(ctx)
        meta = plan['meta']
        assert meta['source'] == 'autolink'
        assert meta['projectType'] == 'aidc'
        assert meta['bridgeVersion'] == '1.0'
        assert meta['version'] == '1.1'
        assert meta['schema'] == 'plan:table/1.1'
        assert meta['generatedAt']

    def test_macro_camelcase_and_new_fields(self):
        ctx = build_pilot64_context()
        plan = generate_plantable(ctx)
        m = plan['macro']
        assert m['pfcQueue'] == 3 and m['cnpQueue'] == 6 and 'bgpMaxPaths' in m
        assert 'naming' in m and 'ipSegments' in m and 'ospf' in m and 'asRange' in m
        assert plan['topology']['layers'] == 2
        assert 'ospf' in plan['protocols']

    def test_validate_bridge_meta_missing(self):
        ctx = build_pilot64_context()
        plan = generate_plantable(ctx)
        plan['meta'].pop('projectType', None)
        assert validate_bridge_meta(plan)
        assert validate_plan(plan)  # validate_plan 同步暴露

    def test_validate_bridge_meta_mismatch(self):
        ctx = build_pilot64_context()
        plan = generate_plantable(ctx)
        plan['meta']['source'] = 'mc'
        assert validate_bridge_meta(plan)

    def test_plantable_to_project_rejects_missing_bridge(self):
        ctx = build_pilot64_context()
        plan = generate_plantable(ctx)
        plan['meta'].pop('bridgeVersion', None)
        with pytest.raises(ValueError):
            plantable_to_project(plan, 'should_not_matter')

    def test_import_accepts_legacy_snake_case(self):
        # v1.0 兼容过渡：camelCase 缺省时 snake_case 兜底（契约 §3）
        ctx = build_pilot64_context()
        plan = generate_plantable(ctx)
        plan['macro'].pop('pfcQueue', None)
        plan['macro'].pop('cnpQueue', None)
        plan['macro']['pfc_queue'] = 5
        plan['macro']['cnp_queue'] = 7
        ctx2 = plantable_to_context(plan)
        assert ctx2.globals['pfc_queue'] == 5
        assert ctx2.globals['cnp_queue'] == 7

    def test_idempotent_import_byte_identical(self):
        # G3.1：同 plan 重导入 → 项目文件字节级一致（含 xlsx 元数据时间戳固定）
        ctx = build_pilot64_context()
        plan = generate_plantable(ctx)
        with tempfile.TemporaryDirectory() as tmp:
            project = os.path.join(tmp, 'proj')
            plantable_to_project(plan, project)
            snap1 = _snapshot(project)
            plantable_to_project(plan, project)
            snap2 = _snapshot(project)
            assert snap1 == snap2

    def test_plan_driven_import_matches_plan(self):
        # G3.1：导入按 plan 的 deviceList/connections/terminals 驱动（规模无关）；
        # 地址修复：互联 IP 由 MC 分配器按 /31 网段粒度分配（忽略 AL 的 src_ip/dst_ip，
        # 决策：MC 分配器唯一事实源）。Leaf 首链己端从网段边界 .0 起，对端 .1（同 /31）。
        plan = {
            'meta': {'project': 'mini', 'site': 'BJ01', 'version': '1.1',
                     'source': 'autolink', 'projectType': 'aidc', 'bridgeVersion': '1.0'},
            'macro': {'site': 'BJ01', 'gpuCount': 32, 'pfcQueue': 3, 'cnpQueue': 6,
                      'ipSegments': {'loopback': '10.1.0.0/20', 'compute': '10.1.16.0/20',
                                     'storage': '10.1.32.0/20', 'biz': '10.1.48.0/20',
                                     'oob': '10.1.64.0/21', 'interconnect': '10.1.72.0/21'}},
            'deviceList': [
                {'role': 'SPINE', 'scenario': 'SPINE', 'model': 'H3C S9827',
                 'name': 'BJ01-R01-AIDC-H3C-P-Spine-01', 'asn': 65111},
                {'role': 'LEAF', 'scenario': 'LEAF', 'model': 'H3C S9827',
                 'name': 'BJ01-R02-AIDC-H3C-P-Leaf-01', 'asn': 65101,
                 'gateways': ['10.1.16.1', '10.1.16.2']},
            ],
            'connections': [
                {'src': 'BJ01-R02-AIDC-H3C-P-Leaf-01', 'src_port': 'FourHundredGigE1/0/33',
                 'src_ip': '10.1.72.1', 'dst': 'SPINE', 'dst_ip': '10.1.72.2',
                 'rate': '400G', 'desc': 'to-P-Spine-1'},
            ],
            'terminals': [
                {'src': 'BJ01-R02-AIDC-H3C-P-Leaf-01', 'src_port': 'TwoHundredGigE1/0/1:1',
                 'vlan': 100, 'desc': 'GPU-R02-1'},
                {'src': 'BJ01-R02-AIDC-H3C-P-Leaf-01', 'src_port': 'TwoHundredGigE1/0/1:2',
                 'vlan': 101, 'desc': 'GPU-R02-2'},
            ],
            'protocols': {'bgp': {'asRange': [65001, 65500], 'ecmp': 16}},
            'convergence': {'compute': 1, 'storage': 1, 'biz': 1},
        }
        ctx = plantable_to_context(plan)
        assert len(ctx.device_params['SPINE']) == 1
        assert len(ctx.device_params['LEAF']) == 1
        assert ctx.device_params['LEAF'][1]['hostname_hostname_B_LEAF1'] == 'BJ01-R02-AIDC-H3C-P-Leaf-01'
        # 终端 vlan 去重 → VLAN 网关（优先用 plan.gateways）
        assert ctx.lists['LEAF_vlan_id1'] == [100, 101]
        assert ctx.lists['LEAF_vlan_gw1'] == ['10.1.16.1', '10.1.16.2']
        # 本端上联 + 聚合层反向重建（分配器网段对齐：首链 (.0, .1) 同 /31）
        assert ctx.lists['LEAF_uplink_ip1'] == ['10.1.72.0']
        assert ctx.lists['LEAF_bgp_peer_ip1'] == ['10.1.72.1']
        assert ctx.lists['SPINE_uplink_ip1'] == ['10.1.72.1']
        assert ctx.lists['SPINE_bgp_peer_ip1'] == ['10.1.72.0']

    def test_bridge_meta_persisted_in_template_meta(self):
        # G3.2：plan.meta 桥接标识 → template.meta.json 透传（判别规则契约 §1.4）
        ctx = build_pilot64_context()
        plan = generate_plantable(ctx)
        with tempfile.TemporaryDirectory() as tmp:
            project = os.path.join(tmp, 'proj')
            plantable_to_project(plan, project)
            import json
            meta = json.load(open(os.path.join(project, 'template.meta.json'), encoding='utf-8'))
            assert meta['source'] == 'autolink'
            assert meta['projectType'] == 'aidc'
            assert meta['bridgeVersion'] == '1.0'
            assert meta['originPlan'] == plan['meta']['project']

    def test_validate_plan_contract_level(self):
        # G3.3：缺宏观字段 / 接线引用缺失 → 报错回 AL
        ctx = build_pilot64_context()
        plan = generate_plantable(ctx)
        assert validate_plan(plan) == []
        # 缺宏观字段
        plan['macro'].pop('cnpQueue', None)
        assert any('缺宏观字段' in i for i in validate_plan(plan))
        # 接线 src 不在 deviceList
        plan2 = generate_plantable(ctx)
        plan2['connections'].append({'src': 'ghost-device', 'dst': 'SPINE'})
        assert any('src 未在 deviceList' in i for i in validate_plan(plan2))
