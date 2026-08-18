"""契约 v1.2 可移植性测试（P4-T3）：MC 消费 AL 真实导出的 plan 夹具。

夹具 `tests/fixtures/al_plan_v12.json` 由 AIDC AutoLink 的 `plan_aidc` 实际导出
（含 projectId/planName/planVersion/planHash），模拟异机传输后 MC 导入全链路：
  - 校验桥接标识 PASS
  - 自动匹配导入（新建）→ 身份/版本透传 + 派生文件生成
  - AL 更新（planVersion+1 + pfc 变更）→ 更新回原目录 + changelog 字段级 diff
  - 幂等（同 planHash 重导 → 跳过）
"""
import copy
import json
import os

import pytest

from intent.planner.plantable_importer import import_plan_auto
from intent.planner.validate import plan_hash, validate_plan

FIXTURE = os.path.join(os.path.dirname(__file__), 'fixtures', 'al_plan_v12.json')
PID = '9f3c2e1a-6b7d-4c9e-8f1a-3d2b4c5d6e7f'


@pytest.fixture(scope='module')
def al_plan():
    with open(FIXTURE, encoding='utf-8') as f:
        return json.load(f)


class TestPortability:
    def test_fixture_is_contract_valid(self, al_plan):
        """AL 真实导出夹具须通过 MC 契约级校验（异机可移植前提）。"""
        assert validate_plan(al_plan) == []
        assert al_plan['meta']['source'] == 'autolink'
        assert al_plan['meta']['projectId'] == PID

    def test_import_new_via_auto(self, tmp_path, al_plan):
        ws = tmp_path / 'ws'
        ws.mkdir()
        r = import_plan_auto(al_plan, str(ws))
        assert r['matched'] == 'new' and r['mcPlanVersion'] == 1
        proj = r['project_dir']
        # 派生文件生成
        for f in ('plan.json', 'template.meta.json', 'para.xlsx'):
            assert os.path.exists(os.path.join(proj, f)), f
        assert os.path.isdir(os.path.join(proj, 'excel'))
        assert os.path.isdir(os.path.join(proj, 'templates'))
        # 身份透传
        with open(os.path.join(proj, 'template.meta.json'), encoding='utf-8') as f:
            tmeta = json.load(f)
        assert tmeta['originProjectId'] == PID
        assert tmeta['originPlanVersion'] == 2
        assert tmeta['mcPlanVersion'] == 1

    def test_update_and_changelog(self, tmp_path, al_plan):
        ws = tmp_path / 'ws'
        ws.mkdir()
        import_plan_auto(al_plan, str(ws))
        # AL 更新：planVersion+1，pfc 3→4，重算 planHash
        v3 = copy.deepcopy(al_plan)
        v3['meta']['planVersion'] = 3
        v3['macro']['pfcQueue'] = 4
        v3['meta']['planHash'] = plan_hash(v3['macro'])
        r = import_plan_auto(v3, str(ws))
        assert r['matched'] == 'update' and r['mcPlanVersion'] == 2
        changed = r['changelog'][-1]['changed']
        assert [c['field'] for c in changed] == ['macro.pfcQueue']
        assert changed[0]['from'] == 3 and changed[0]['to'] == 4

    def test_skip_on_same_hash(self, tmp_path, al_plan):
        ws = tmp_path / 'ws'
        ws.mkdir()
        import_plan_auto(al_plan, str(ws))
        r = import_plan_auto(al_plan, str(ws))
        assert r['matched'] == 'skip' and r['mcPlanVersion'] == 1

    def test_mcplan_version_and_allocator_state_persist(self, tmp_path, al_plan):
        """更新后 mcPlanVersion 递增 + allocator_state（reserved）保留。"""
        ws = tmp_path / 'ws'
        ws.mkdir()
        import_plan_auto(al_plan, str(ws))
        proj = os.path.join(str(ws), 'H3C-64台-BJ01')
        st_path = os.path.join(proj, 'allocator_state.json')
        st = json.load(open(st_path, encoding='utf-8'))
        st['reserved'] = {'interconnect': ['10.1.72.200']}
        json.dump(st, open(st_path, 'w', encoding='utf-8'), ensure_ascii=False)
        v3 = copy.deepcopy(al_plan)
        v3['macro']['pfcQueue'] = 5
        v3['meta']['planHash'] = plan_hash(v3['macro'])
        r = import_plan_auto(v3, str(ws))
        assert r['project_dir'] == proj and r['mcPlanVersion'] == 2
        st2 = json.load(open(st_path, encoding='utf-8'))
        assert st2['reserved']['interconnect'] == ['10.1.72.200']
