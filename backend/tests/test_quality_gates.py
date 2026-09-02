"""4.6.0-F6-1（46-a）Q-1：覆盖率门禁（低阈值起步 + 只升不降断言 enforce）

- 阈值单一来源 tests/coverage_thresholds.json：后端 fail_under 与 .coveragerc 一致；
  前端 thresholds 与 vite.config.ts 引用一致；均为低阈值起步（只升不降）。
- 基线锚点 tests/coverage_baseline.json 存在且结构完整。
- 棘轮断言 ratchet_check()：当前 < 基线 → 违反「只升不降」；--update-baseline 上移锚点。
"""
import importlib.util
import json
import os

REPO = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
THRESHOLDS = os.path.join(REPO, 'tests', 'coverage_thresholds.json')
BASELINE = os.path.join(REPO, 'tests', 'coverage_baseline.json')
COVERAGERC = os.path.join(REPO, '.coveragerc')
VITE_CONFIG = os.path.join(REPO, 'vite.config.ts')
CHECK_SCRIPT = os.path.join(REPO, 'scripts', 'check_coverage_baseline.py')


def _load(rel):
    with open(os.path.join(REPO, rel), encoding='utf-8') as f:
        return json.load(f)


def _load_check_module():
    spec = importlib.util.spec_from_file_location('mc_check_cov_baseline', CHECK_SCRIPT)
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    return mod


def test_thresholds_json_low_start_and_valid():
    """阈值单一来源：后端/前端 fail_under 均为低阈值起步（非零且 >0），策略注明只升不降。"""
    data = _load('tests/coverage_thresholds.json')
    assert data['schema'] == 1
    assert '不许降' in data.get('policy', '')
    backend = data['backend']
    frontend = data['frontend']
    assert backend['fail_under'] > 0
    assert frontend['fail_under'] > 0
    assert 'backend' in backend['paths'] and 'ai_hub' in backend['paths']
    assert frontend['thresholds']['lines'] > 0
    assert frontend['thresholds']['statements'] > 0
    assert frontend['thresholds']['functions'] > 0
    assert frontend['thresholds']['branches'] > 0


def test_coveragerc_consistent_with_thresholds_json():
    """.coveragerc fail_under 与 thresholds.json backend.fail_under 一致（CI 以 --cov-fail-under 注入）。"""
    data = _load('tests/coverage_thresholds.json')
    with open(COVERAGERC, encoding='utf-8') as f:
        text = f.read()
    assert f'fail_under = {data["backend"]["fail_under"]}' in text
    assert 'source = backend, ai_hub' in text


def test_vite_config_reads_thresholds_json():
    """vite.config.ts 从 tests/coverage_thresholds.json 读取前端阈值（frontend.thresholds）。"""
    with open(VITE_CONFIG, encoding='utf-8') as f:
        text = f.read()
    assert 'tests/coverage_thresholds.json' in text
    assert 'frontend.thresholds' in text or 'raw.frontend?.thresholds' in text
    assert 'provider: \'v8\'' in text or 'provider: "v8"' in text


def test_coverage_baseline_anchor_exists():
    """基线锚点存在且结构完整（schema + 双端指标），供棘轮只升不降断言。"""
    baseline = _load('tests/coverage_baseline.json')
    assert baseline['schema'] == 'mc.quality.coverage-baseline/1'
    b = baseline['baseline']
    assert 'backend' in b and 'frontend' in b
    assert b['backend'].get('lines') is not None
    for metric in ('lines', 'statements', 'functions', 'branches'):
        assert b['frontend'].get(metric) is not None


def test_ratchet_only_up_no_down():
    """棘轮纯函数：当前 < 基线 → 违反只升不降；当前 >= 基线 → 通过。"""
    mod = _load_check_module()
    baseline = {'backend': {'lines': 60.0}, 'frontend': {'lines': 27.0, 'statements': 27.0, 'functions': 51.0, 'branches': 70.0}}
    # 全覆盖达标 → 无违反
    current_ok = {'backend': {'lines': 61.0}, 'frontend': {'lines': 28.0, 'statements': 28.0, 'functions': 52.0, 'branches': 71.0}}
    assert mod.ratchet_check(baseline, current_ok) == []
    # 后端下降 → 违反
    current_drop = {'backend': {'lines': 59.0}, 'frontend': {'lines': 28.0, 'statements': 28.0, 'functions': 52.0, 'branches': 71.0}}
    violations = mod.ratchet_check(baseline, current_drop)
    assert len(violations) == 1
    assert violations[0]['metric'] == 'lines' and violations[0]['side'] == 'backend'
    # 前端分支下降 → 违反
    current_branch_drop = {'backend': {'lines': 61.0}, 'frontend': {'lines': 28.0, 'statements': 28.0, 'functions': 52.0, 'branches': 69.0}}
    violations = mod.ratchet_check(baseline, current_branch_drop)
    assert len(violations) == 1 and violations[0]['metric'] == 'branches'
    # 缺失当前指标 → 视为违反
    missing = {'backend': {'lines': 61.0}, 'frontend': {'lines': 28.0}}
    violations = mod.ratchet_check(baseline, missing)
    assert any(v['metric'] == 'statements' for v in violations)


def test_update_baseline_writes_anchor(tmp_path):
    """--update-baseline 将当前覆盖率写回基线锚点（棘轮上移）。"""
    mod = _load_check_module()
    current = {'backend': {'lines': 61.5}, 'frontend': {'lines': 28.5, 'statements': 28.5, 'functions': 52.5, 'branches': 71.5}}
    # 重定向到临时路径，避免污染仓库真实基线
    mod.BASELINE_PATH = str(tmp_path / 'coverage_baseline.json')
    result = mod.update_baseline(current)
    assert result['schema'] == 'mc.quality.coverage-baseline/1'
    assert result['baseline'] == current
    with open(mod.BASELINE_PATH, encoding='utf-8') as f:
        written = json.load(f)
    assert written['baseline'] == current
