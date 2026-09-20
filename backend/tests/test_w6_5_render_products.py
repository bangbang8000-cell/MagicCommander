"""V5.3.0-640-m（W6.5 / FR-M1+M2）：6 场景 example 渲染产物核验。

对应 PRD §3.4 / 开发计划 W6.4 / 测试计划 T-6S-E 组：
  - IB 4 套：参数/存储网（fabric）交换机不产出 j2（配置在 IB 子网管理器侧），
    业务/带外角色照常产出；
  - RoCE 2 套：SPINE/LEAF 为 SONiC/UXOS 命令族（X400 基准，待现网校准），
    其余角色保持 info 占位；
  - render_sonic_leaf 按赋值表实际渲染产出 SONiC 命令（W6.4 接入）。
"""
import json
import os

import pytest

from intent.planner.plan_builder import build_plan_context
from intent.sonic_templates import render_sonic_leaf, render_sonic_spine
from intent.planner.allocator_state import AllocatorState

REPO = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
EXAMPLE_DIR = os.path.join(REPO, 'example')

IB_SAMPLES = [
    '万卡-H200-QM9700-三层-IB',
    '万卡-H200-Q3400-二层-IB',
    '二层最大-2048卡-QM9700-IB',
    '万卡-B300-Q3400-二层-IB',
]
ROCE_SAMPLES = [
    '万卡-H200-X400-三层-RoCE',
    '二层最大-8192卡-X400-RoCE',
]
FABRIC_ROLES = ('SPINE', 'LEAF', 'STO_SPINE', 'STO_LEAF')
NON_FABRIC_ROLES = ('BIZ_AGG', 'BIZ_ACCESS', 'OOB_AGG', 'OOB_ACCESS')


def _load_plan(name):
    with open(os.path.join(EXAMPLE_DIR, name, 'plan.json'), encoding='utf-8') as f:
        return json.load(f)


class TestIbNoFabricJ2:
    """M1 判据：IB 4 套无 fabric j2，业务/带外照常。"""

    @pytest.mark.parametrize('name', IB_SAMPLES)
    def test_fabric_roles_no_j2(self, name):
        tpl = os.path.join(EXAMPLE_DIR, name, 'templates')
        for role in FABRIC_ROLES:
            assert not os.path.exists(os.path.join(tpl, f'{role}.j2')), \
                f'{name}/{role}.j2 不应存在（IB 配置在子网管理器侧）'

    @pytest.mark.parametrize('name', IB_SAMPLES)
    def test_non_fabric_roles_have_j2(self, name):
        tpl = os.path.join(EXAMPLE_DIR, name, 'templates')
        for role in NON_FABRIC_ROLES:
            assert os.path.exists(os.path.join(tpl, f'{role}.j2')), \
                f'{name}/{role}.j2 应存在（业务/带外照常产出）'

    @pytest.mark.parametrize('name', IB_SAMPLES)
    def test_meta_marks_skipped(self, name):
        with open(os.path.join(EXAMPLE_DIR, name, 'template.meta.json'), encoding='utf-8') as f:
            meta = json.load(f)
        assert meta['fabric'] == 'ib'
        assert set(meta['renderSplit']['skippedFabricRoles']) == set(FABRIC_ROLES)


class TestRoceSonicFamily:
    """M2 判据：RoCE 2 套 SPINE/LEAF 为 SONiC 族，全部角色有 j2。"""

    @pytest.mark.parametrize('name', ROCE_SAMPLES)
    def test_all_roles_have_j2(self, name):
        tpl = os.path.join(EXAMPLE_DIR, name, 'templates')
        for role in FABRIC_ROLES + NON_FABRIC_ROLES:
            assert os.path.exists(os.path.join(tpl, f'{role}.j2')), \
                f'{name}/{role}.j2 应存在（RoCE 全部角色）'

    @pytest.mark.parametrize('name', ROCE_SAMPLES)
    def test_sonic_marker_in_spine_leaf(self, name):
        tpl = os.path.join(EXAMPLE_DIR, name, 'templates')
        for role in ('SPINE', 'LEAF'):
            with open(os.path.join(tpl, f'{role}.j2'), encoding='utf-8') as f:
                text = f.read()
            assert 'SONiC' in text or 'UXOS' in text, \
                f'{name}/{role}.j2 应为 SONiC/UXOS 命令族（X400 基准）'


class TestRenderSonicLeaf:
    """W6.4 接入：render_sonic_leaf/spine 按赋值表实际渲染产出 SONiC 命令。"""

    @pytest.mark.parametrize('name', ROCE_SAMPLES)
    def test_render_leaf_produces_commands(self, name):
        plan = _load_plan(name)
        state = AllocatorState(os.path.join(EXAMPLE_DIR, name))
        ctx = build_plan_context(plan, state)
        out = render_sonic_leaf(ctx, device_id=1)
        assert 'config interface' in out or 'config buffer' in out or 'router bgp' in out
        assert '待现网校准' in out or 'SONiC' in out

    @pytest.mark.parametrize('name', ROCE_SAMPLES)
    def test_render_spine_produces_commands(self, name):
        plan = _load_plan(name)
        state = AllocatorState(os.path.join(EXAMPLE_DIR, name))
        ctx = build_plan_context(plan, state)
        out = render_sonic_spine(ctx, device_id=1)
        assert 'router bgp' in out or 'config interface' in out or 'config buffer' in out

    @pytest.mark.parametrize('name', IB_SAMPLES)
    def test_meta_status_ready(self, name):
        with open(os.path.join(EXAMPLE_DIR, name, 'template.meta.json'), encoding='utf-8') as f:
            meta = json.load(f)
        assert meta.get('status') == 'ready'
        with open(os.path.join(EXAMPLE_DIR, name, 'README.md'), encoding='utf-8') as f:
            assert '已导入' in f.read()
