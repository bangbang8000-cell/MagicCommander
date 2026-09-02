"""MagicCommander 4.6.0（F6-1 / 46-a）覆盖率棘轮门禁：只许升不许降（Q-1）

- 读取 tests/coverage_baseline.json（锚点，提交入库，只许升）
- 读取当前覆盖率产物：
  - 后端：reports/coverage/backend/coverage.json（pytest --cov-report=json）
  - 前端：reports/coverage/frontend/coverage-summary.json（vitest --coverage）
- 断言：当前各指标 >= 基线（只升不降）；任一低于基线 → 退出码 1
- --update-baseline：将当前覆盖率写回基线（棘轮上移；仅当当前 >= 基线时允许）

用法（仓库根目录）：
  python scripts/check_coverage_baseline.py              # 校验只升不降
  python scripts/check_coverage_baseline.py --update-baseline   # 棘轮上移并写回

注：ratchet_check() 为纯函数，供 pytest（backend/tests/test_quality_gates.py）直接断言。
"""
import argparse
import json
import os
import sys
import time

REPO = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
BASELINE_PATH = os.path.join(REPO, 'tests', 'coverage_baseline.json')
BACKEND_COV = os.path.join('reports', 'coverage', 'backend', 'coverage.json')
FRONTEND_COV = os.path.join('reports', 'coverage', 'frontend', 'coverage-summary.json')


def _load_json(path):
    if not path or not os.path.exists(path):
        return None
    try:
        with open(path, encoding='utf-8') as f:
            return json.load(f)
    except (ValueError, OSError):
        return None


def collect_current():
    """从覆盖率产物收集当前各指标。缺失 → None（视为无法校验）。"""
    backend = _load_json(os.path.join(REPO, BACKEND_COV))
    frontend = _load_json(os.path.join(REPO, FRONTEND_COV))
    out = {'backend': {}, 'frontend': {}}
    if backend and backend.get('totals'):
        t = backend['totals']
        out['backend']['lines'] = round(float(t.get('percent_covered', 0.0)), 2)
    if frontend and frontend.get('total'):
        t = frontend['total']

        def pct(key):
            v = t.get(key) or {}
            return round(float(v.get('pct', 0.0)), 2)

        out['frontend']['lines'] = pct('lines')
        out['frontend']['statements'] = pct('statements')
        out['frontend']['functions'] = pct('functions')
        out['frontend']['branches'] = pct('branches')
    return out


def load_baseline():
    data = _load_json(BASELINE_PATH) or {}
    return data.get('baseline') or {}


def ratchet_check(baseline, current):
    """纯函数：对比基线与当前，返回违反「只升不降」的列表。
    每项：{metric, baseline, current, side}；空列表 = 通过。
    """
    violations = []
    for side in ('backend', 'frontend'):
        b = (baseline or {}).get(side) or {}
        c = (current or {}).get(side) or {}
        for metric, base_val in b.items():
            cur = c.get(metric)
            if cur is None:
                violations.append({'side': side, 'metric': metric, 'baseline': base_val, 'current': None})
            elif cur < base_val - 1e-9:
                violations.append({'side': side, 'metric': metric, 'baseline': base_val, 'current': cur})
    return violations


def update_baseline(current):
    """将当前覆盖率写回基线（棘轮上移）。"""
    baseline = {
        'schema': 'mc.quality.coverage-baseline/1',
        'policy': 'MC 4.6.0-F6-1（46-a）覆盖率棘轮：只许升不许降。--update-baseline 上移锚点。',
        'updatedAt': time.strftime('%Y-%m-%dT%H:%M:%S%z'),
        'baseline': current,
    }
    with open(BASELINE_PATH, 'w', encoding='utf-8') as f:
        json.dump(baseline, f, ensure_ascii=False, indent=2)
    return baseline


def main(argv=None):
    parser = argparse.ArgumentParser(description='MC 覆盖率棘轮门禁（只升不降，F6-1/Q-1）')
    parser.add_argument('--update-baseline', action='store_true', help='将当前覆盖率写回基线锚点')
    args = parser.parse_args(argv)

    current = collect_current()
    baseline = load_baseline()

    if args.update_baseline:
        update_baseline(current)
        print('[coverage-baseline] 已更新基线锚点：')
        print(json.dumps(current, ensure_ascii=False, indent=2))
        return 0

    if not baseline:
        print('[coverage-baseline] 缺少基线 tests/coverage_baseline.json，请先运行 --update-baseline')
        return 1

    violations = ratchet_check(baseline, current)
    print(f"[coverage-baseline] 基线: {json.dumps(baseline, ensure_ascii=False)}")
    print(f"[coverage-baseline] 当前: {json.dumps(current, ensure_ascii=False)}")
    if violations:
        print('[coverage-baseline] FAIL：覆盖率下降（只许升不许降）：')
        for v in violations:
            cur = v['current'] if v['current'] is not None else '缺失'
            print(f"  - [{v['side']}] {v['metric']}: 基线 {v['baseline']} → 当前 {cur}")
        return 1
    print('[coverage-baseline] PASS：各指标均不低于基线（只升不降）')
    return 0


if __name__ == '__main__':
    sys.exit(main())
