"""plan:table 契约 v1.2 测试（身份/版本/planHash 算法/兼容判别/导入透传）。

对应 docs/plan_table_契约v1.2_2026-08-18.md：
  - §1.3 canonical(macro)/planHash 算法与 AL 端一致（硬编码参考哈希锁算法）
  - §4 判别矩阵（projectId 存在/缺失）
  - §7 planHash 完整性校验
  - §6.2 template.meta.json 身份透传
"""
import json
import os

import pytest

from intent.pilot64 import build_pilot64_context
from intent.planner.plantable import generate_plantable
from intent.planner.plantable_importer import find_mc_project_by_origin, plantable_to_project
from intent.planner.validate import (canonical_macro, plan_hash,
                                     plan_identity_warnings,
                                     validate_bridge_meta, validate_plan)

PID = '7c9e6679-7425-40de-944b-e07fc1f90ae7'

# 算法锁定：canonical = json.dumps(sort_keys=True, ensure_ascii=False)，与 AL 端 aidc_planner 一致。
# 若任一端修改算法，此参考哈希会比对失败（防止双端算法漂移）。
_REF_MACRO = {'site': 'BJ01', 'gpuCount': 64, 'pfcQueue': 3, 'cnpQueue': 6}
_REF_HASH = 'b58b7d290bb9ec7d193a135c33a69681069af5177f202c2769f8578a7f478c1d'


def _v12_plan(**meta_overrides):
    """构造带身份的 v1.2 契约 plan（基于现有 generate_plantable 注入身份）。"""
    plan = generate_plantable(build_pilot64_context())
    plan['meta'].update({
        'projectId': PID,
        'projectName': 'H3C-64台-BJ01',
        'planVersion': 2,
        'planHash': plan_hash(plan['macro']),
    })
    plan['meta'].update(meta_overrides)
    return plan


class TestPlanHashAlgorithm:
    def test_canonical_key_order_independent(self):
        assert canonical_macro({'a': 1, 'b': 2}) == canonical_macro({'b': 2, 'a': 1})

    def test_canonical_spec_form(self):
        assert canonical_macro(_REF_MACRO) == '{"cnpQueue": 6, "gpuCount": 64, "pfcQueue": 3, "site": "BJ01"}'

    def test_plan_hash_locked_to_reference(self):
        """硬编码参考哈希：双端算法必须一致，改算法会在此失败。"""
        assert plan_hash(_REF_MACRO) == _REF_HASH

    def test_plan_hash_deterministic_and_sensitive(self):
        a = _v12_plan()
        assert a['meta']['planHash'] == plan_hash(a['macro'])
        assert plan_hash(_REF_MACRO) != plan_hash({**_REF_MACRO, 'pfcQueue': 4})


class TestDiscriminationMatrix:
    def test_bridge_meta_ok_with_project_id(self):
        assert validate_bridge_meta(_v12_plan()) == []

    def test_bridge_meta_bad_project_id_format(self):
        # 存在但格式非法 → 报错
        for bad in ('', '   ', 123):
            issues = validate_bridge_meta(_v12_plan(projectId=bad))
            assert any('projectId 非法' in i for i in issues), f'projectId={bad!r} 应报非法'
        # 缺失（None/未提供）→ 不报非法（走 plan_identity_warnings warn，旧 v1.0/v1.1 兼容）
        assert validate_bridge_meta(_v12_plan(projectId=None)) == []

    def test_identity_warnings_missing_identity(self):
        plan = _v12_plan()
        plan['meta'].pop('projectId', None)
        plan['meta'].pop('planHash', None)
        warns = plan_identity_warnings(plan)
        assert any('projectId' in w for w in warns)
        assert any('planHash' in w for w in warns)

    def test_identity_warnings_none_when_present(self):
        assert plan_identity_warnings(_v12_plan()) == []

    def test_validate_plan_plan_hash_mismatch(self):
        plan = _v12_plan()
        plan['macro']['pfcQueue'] = 5  # 篡改宏观，planHash 不动
        issues = validate_plan(plan)
        assert any('planHash 与 macro 不符' in i for i in issues)

    def test_validate_plan_plan_hash_match(self):
        assert validate_plan(_v12_plan()) == []


class TestIdentityPropagation:
    def test_import_writes_identity_to_template_meta(self, tmp_path):
        project_dir = str(tmp_path / 'proj')
        plantable_to_project(_v12_plan(), project_dir)
        with open(os.path.join(project_dir, 'template.meta.json'), encoding='utf-8') as f:
            meta = json.load(f)
        assert meta['source'] == 'autolink'
        assert meta['originProjectId'] == PID
        assert meta['originProjectName'] == 'H3C-64台-BJ01'
        assert meta['originSite'] == 'BJ01'
        assert meta['originPlanVersion'] == 2
        assert meta['planHash'] == _v12_plan()['meta']['planHash']

    def test_find_mc_project_by_origin(self, tmp_path):
        """匹配检测：命中返回目录名；未命中/缺身份返回 None。"""
        ws = tmp_path / 'ws'
        ws.mkdir()
        hit_dir = ws / 'projA'
        hit_dir.mkdir()
        with open(hit_dir / 'template.meta.json', 'w', encoding='utf-8') as f:
            json.dump({'originProjectId': PID}, f)
        assert find_mc_project_by_origin(PID, str(ws)) == 'projA'
        assert find_mc_project_by_origin('OTHER-ID', str(ws)) is None
        assert find_mc_project_by_origin('', str(ws)) is None
