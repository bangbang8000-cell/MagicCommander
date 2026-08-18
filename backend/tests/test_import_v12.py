"""契约 v1.2 自动匹配导入测试（P2 M-4/M-5/M-6）。

覆盖 import_plan_auto：
  - 新建（目录默认 projectName）+ mcPlanVersion=1
  - 更新（同 projectId 回原目录 + allocator_state 保留 + mcPlanVersion+1 + changelog 字段级 diff）
  - 跳过（同 projectId 同 planHash）
  - 旧文件无 projectId → 按显式目录新建（matched=none）
  - plan.json 溯源保留 + template.meta.json 版本字段
"""
import json
import os

from intent.pilot64 import build_pilot64_context
from intent.planner.plantable import generate_plantable
from intent.planner.plantable_importer import import_plan_auto
from intent.planner.validate import plan_hash

PID = '7c9e6679-7425-40de-944b-e07fc1f90ae7'


def _plan(**overrides):
    """带身份的 v1.2 plan（macro 可覆盖）。"""
    plan = generate_plantable(build_pilot64_context())
    plan['meta'].update({
        'projectId': PID,
        'projectName': 'H3C-64台-BJ01',
        'planVersion': 1,
        'planHash': plan_hash(plan['macro']),
    })
    plan['meta'].update(overrides.get('meta', {}))
    if 'macro' in overrides:
        plan['macro'].update(overrides['macro'])
        plan['meta']['planHash'] = plan_hash(plan['macro'])
    return plan


def _read(ws, name, file):
    with open(os.path.join(ws, name, file), encoding='utf-8') as f:
        return json.load(f)


class TestAutoImport:
    def test_new_defaults_dir_to_project_name(self, tmp_path):
        ws = tmp_path / 'ws'
        ws.mkdir()
        r = import_plan_auto(_plan(), str(ws))
        assert r['matched'] == 'new' and r['mcPlanVersion'] == 1
        assert os.path.basename(r['project_dir']) == 'H3C-64台-BJ01'
        # plan.json 溯源保留 + template.meta.json 版本字段
        assert _read(str(ws), 'H3C-64台-BJ01', 'plan.json')['meta']['projectId'] == PID
        tmeta = _read(str(ws), 'H3C-64台-BJ01', 'template.meta.json')
        assert tmeta['mcPlanVersion'] == 1
        assert tmeta['originProjectId'] == PID
        # 首次导入无 None→值 噪音 diff
        assert r['changelog'][0]['changed'] == []

    def test_update_same_dir_preserves_allocator_state(self, tmp_path):
        ws = tmp_path / 'ws'
        ws.mkdir()
        import_plan_auto(_plan(), str(ws))
        # MC 微观细化：预留地址（写入 allocator_state.json，模拟用户编辑）
        proj = os.path.join(str(ws), 'H3C-64台-BJ01')
        st_path = os.path.join(proj, 'allocator_state.json')
        st = _read(str(ws), 'H3C-64台-BJ01', 'allocator_state.json')
        st['reserved'] = {'interconnect': ['10.1.72.100', '10.1.72.101']}
        with open(st_path, 'w', encoding='utf-8') as f:
            json.dump(st, f, ensure_ascii=False)
        # AL 更新（宏观变更）→ 更新回原目录
        v2 = _plan(meta={'planVersion': 2}, macro={'pfcQueue': 4})
        r = import_plan_auto(v2, str(ws))
        assert r['matched'] == 'update'
        assert r['project_dir'] == proj  # 更新回原目录
        assert r['mcPlanVersion'] == 2
        # 预留保留（D-T3：allocator_state 是 MC 微观细化的事实源）
        st2 = _read(str(ws), 'H3C-64台-BJ01', 'allocator_state.json')
        assert st2['reserved']['interconnect'] == ['10.1.72.100', '10.1.72.101']
        # changelog 字段级 diff 仅含差异
        changed = r['changelog'][-1]['changed']
        assert [c['field'] for c in changed] == ['macro.pfcQueue']

    def test_skip_on_same_hash(self, tmp_path):
        ws = tmp_path / 'ws'
        ws.mkdir()
        import_plan_auto(_plan(), str(ws))
        r = import_plan_auto(_plan(), str(ws))
        assert r['matched'] == 'skip' and r['changed'] is False
        assert r['mcPlanVersion'] == 1  # 不 +1

    def test_legacy_no_project_id_uses_explicit_dir(self, tmp_path):
        ws = tmp_path / 'ws'
        ws.mkdir()
        plan = _plan()
        plan['meta'].pop('projectId', None)
        plan['meta'].pop('planHash', None)
        r = import_plan_auto(plan, str(ws), explicit_dir=str(ws / 'legacy_import'))
        assert r['matched'] == 'none'
        assert r['project_dir'] == str(ws / 'legacy_import')

    def test_conflicting_project_name_suffix(self, tmp_path):
        """同名 projectName 不同 projectId → 目录加后缀。"""
        ws = tmp_path / 'ws'
        ws.mkdir()
        import_plan_auto(_plan(), str(ws))
        p2 = _plan()
        p2['meta']['projectId'] = 'other-id'
        p2['meta']['projectName'] = 'H3C-64台-BJ01'
        r = import_plan_auto(p2, str(ws))
        assert r['matched'] == 'new'
        assert os.path.basename(r['project_dir']) == 'H3C-64台-BJ01-2'

    def test_import_returns_bridge_and_origin_summary(self, tmp_path):
        ws = tmp_path / 'ws'
        ws.mkdir()
        r = import_plan_auto(_plan(), str(ws))
        assert r['bridge']['source'] == 'autolink'
        assert r['origin']['projectId'] == PID
        assert r['device_count'] == 22
