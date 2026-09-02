"""MagicCommander 4.6.0（F6-3 / 46-c）统一测试报告：聚合各测试/门禁结果 → HTML/JSON 报告

聚合模块：
  1. pytest（backend + ai_hub）：测试数 + 通过率 + 覆盖率（--cov json + junit xml）
  2. vitest（renderer + electron）：测试数 + 覆盖率（reports/coverage/frontend/coverage-summary.json）
  3. 门禁：golden 基线 / 模板校验 / 性能基准 / 数据准确性校验（运行脚本取退出码）

用法（仓库根目录执行）：
  python scripts/test_report.py                # 全量运行：pytest + vitest + 门禁，再生成报告（较慢）
  python scripts/test_report.py --skip-run     # 仅聚合已有产物 + 运行门禁脚本（CI 复用既有测试产物）
  python scripts/test_report.py --no-gates     # 不运行门禁脚本（仅聚合产物）
  python scripts/test_report.py --report-dir DIR

输出：
  <report-dir>/quality_report.json    # 结构化报告（Q-3 JSON 结构断言）
  <report-dir>/quality_report.html    # 自包含 HTML 报告（无外部依赖）

注：本模块导入无副作用；build_report() 为纯函数，供 pytest 直接断言结构。
"""
import argparse
import json
import os
import subprocess
import sys
import time
import xml.etree.ElementTree as ET

REPO = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DEFAULT_REPORT_DIR = os.path.join(REPO, 'reports')
SCHEMA = 'mc.quality-report/1'
VERSION = '4.6.0'

FRONTEND_COVERAGE_SUMMARY = os.path.join('reports', 'coverage', 'frontend', 'coverage-summary.json')
BACKEND_COVERAGE_JSON = os.path.join('reports', 'coverage', 'backend', 'coverage.json')
BACKEND_JUNIT_XML = os.path.join('reports', 'junit', 'backend.xml')


def _load_json(path):
    if not path or not os.path.exists(path):
        return None
    try:
        with open(path, encoding='utf-8') as f:
            return json.load(f)
    except (ValueError, OSError):
        return None


def coverage_thresholds():
    """覆盖率门禁阈值单一来源：tests/coverage_thresholds.json（Q-1 只升不降断言 enforce）。"""
    data = _load_json(os.path.join(REPO, 'tests', 'coverage_thresholds.json')) or {}
    backend = (data.get('backend') or {}).get('fail_under', 55)
    frontend = (data.get('frontend') or {}).get('fail_under', 50)
    return {'backend': int(backend), 'frontend': int(frontend)}


def parse_junit_xml(path):
    """解析 pytest junit xml → 测试统计（兼容 <testsuites>/<testsuite> 根节点）。"""
    if not path or not os.path.exists(path):
        return None
    try:
        tree = ET.parse(path)
        root = tree.getroot()
        suite = root if root.tag == 'testsuite' else root.find('testsuite')
        if suite is None:
            return None
        return {
            'total': int(suite.get('tests', 0)),
            'errors': int(suite.get('errors', 0)),
            'failures': int(suite.get('failures', 0)),
            'skipped': int(suite.get('skipped', 0)),
            'time': float(suite.get('time', 0.0)),
        }
    except (ET.ParseError, OSError, ValueError, TypeError):
        return None


def parse_backend_coverage(path):
    """解析 pytest --cov-report=json → {lines, branches, threshold, pass}。"""
    data = _load_json(path)
    if not data or 'totals' not in data:
        return None
    totals = data['totals']
    return {
        'lines': round(float(totals.get('percent_covered', 0.0)), 2),
        'statements': int(totals.get('num_statements', 0)),
        'covered': int(totals.get('covered_lines', 0)),
        'threshold': coverage_thresholds()['backend'],
    }


def parse_frontend_coverage(path):
    """解析 vitest coverage-summary.json → 覆盖率统计。"""
    data = _load_json(path)
    if not data or 'total' not in data:
        return None
    total = data['total']

    def pct(key):
        v = total.get(key) or {}
        return round(float(v.get('pct', 0.0)), 2)

    return {
        'statements': pct('statements'),
        'lines': pct('lines'),
        'functions': pct('functions'),
        'branches': pct('branches'),
        'threshold': coverage_thresholds()['frontend'],
    }


def run_gate(module_id, name, cmd, cwd=None):
    """运行门禁脚本，返回 (module, elapsed_ms)。"""
    t0 = time.perf_counter()
    try:
        proc = subprocess.run(
            cmd, cwd=cwd or REPO, capture_output=True, text=True, timeout=1800, encoding='utf-8', errors='replace'
        )
        code = proc.returncode
        detail = (proc.stdout or '')[-400:] or (proc.stderr or '')[-400:]
    except subprocess.TimeoutExpired:
        code = 124
        detail = 'timeout'
    elapsed_ms = int((time.perf_counter() - t0) * 1000)
    return {
        'id': module_id,
        'name': name,
        'tool': cmd[0],
        'status': 'pass' if code == 0 else 'fail',
        'exitCode': code,
        'durationMs': elapsed_ms,
        'detail': (detail or '').strip()[:400],
    }


def build_report(modules, generated_at=None):
    """纯函数：由模块结果列表构造统一报告（Q-3 结构断言）。"""
    passed = sum(1 for m in modules if m.get('status') == 'pass')
    failed = sum(1 for m in modules if m.get('status') == 'fail')
    total_tests = sum((m.get('tests') or {}).get('total', 0) for m in modules)
    passed_tests = sum((m.get('tests') or {}).get('passed', 0) for m in modules)
    return {
        'schema': SCHEMA,
        'version': VERSION,
        'generatedAt': generated_at or time.strftime('%Y-%m-%dT%H:%M:%S%z'),
        'modules': modules,
        'summary': {
            'status': 'pass' if failed == 0 else 'fail',
            'modules': len(modules),
            'passed': passed,
            'failed': failed,
            'totalTests': total_tests,
            'passedTests': passed_tests,
        },
    }


def module_pass_rate(module):
    """模块测试统计（通过率）。"""
    tests = module.get('tests')
    if not tests or not tests.get('total'):
        return None
    return {
        'total': tests.get('total', 0),
        'passed': tests.get('passed', 0),
        'failed': tests.get('failed', 0),
        'skipped': tests.get('skipped', 0),
        'rate': round(100.0 * tests.get('passed', 0) / tests.get('total', 0), 2) if tests.get('total') else 0.0,
    }


def make_pytest_module():
    """聚合 pytest（backend + ai_hub）：junit + 覆盖率。"""
    base = {
        'id': 'pytest-backend',
        'name': '后端 pytest（backend + ai_hub）',
        'tool': 'pytest',
    }
    stats = parse_junit_xml(BACKEND_JUNIT_XML)
    cov = parse_backend_coverage(BACKEND_COVERAGE_JSON)
    if stats is None:
        base.update({'status': 'unknown', 'detail': '缺少 junit 产物（reports/junit/backend.xml）'})
        return base
    tests = {
        'total': stats['total'],
        'passed': stats['total'] - stats['errors'] - stats['failures'] - stats['skipped'],
        'failed': stats['errors'] + stats['failures'],
        'skipped': stats['skipped'],
    }
    status = 'pass' if tests['failed'] == 0 else 'fail'
    if cov is not None:
        cov['pass'] = cov['lines'] >= cov['threshold']
        if not cov['pass']:
            status = 'fail'
    base.update({
        'status': status,
        'durationMs': int(stats['time'] * 1000),
        'tests': tests,
        'passRate': module_pass_rate({'tests': tests}),
        'coverage': cov,
    })
    return base


def make_vitest_module():
    """聚合 vitest（renderer + electron）：覆盖率（vitest 自身结果由运行模式采集）。"""
    cov = parse_frontend_coverage(FRONTEND_COVERAGE_SUMMARY)
    base = {
        'id': 'vitest-frontend',
        'name': '前端 vitest（renderer + electron）',
        'tool': 'vitest',
    }
    if cov is None:
        base.update({'status': 'unknown', 'detail': '缺少 vitest 覆盖率产物（reports/coverage/frontend/coverage-summary.json）'})
        return base
    cov['pass'] = cov['lines'] >= cov['threshold']
    base.update({
        'status': 'pass' if cov['pass'] else 'fail',
        'coverage': cov,
    })
    return base


def collect_modules(run_gates=True, skip_run=False):
    """组装全部模块结果：pytest/vitest 聚合产物；门禁按需实跑。"""
    modules = []
    modules.append(make_pytest_module())
    modules.append(make_vitest_module())

    gate_scripts = [
        ('gate-golden', 'golden 渲染基线', [sys.executable, os.path.join('scripts', 'gen_golden.py'), '--check']),
        ('gate-templates', '模板校验', [sys.executable, os.path.join('scripts', 'validate_templates.py')]),
        ('gate-perf', '性能基准', [sys.executable, os.path.join('scripts', 'bench_perf.py'), '--rounds', '1']),
        ('gate-validation', '数据准确性校验', [sys.executable, os.path.join('scripts', 'validate_consistency.py'), '--check']),
    ]
    for mid, name, cmd in gate_scripts:
        if run_gates:
            modules.append(run_gate(mid, name, cmd))
        else:
            modules.append({'id': mid, 'name': name, 'tool': cmd[0], 'status': 'unknown', 'detail': '未运行门禁（--no-gates）'})
    return modules


def render_html(report):
    """渲染自包含 HTML 报告。"""
    rows = []
    for m in report['modules']:
        status_cn = {'pass': '通过', 'fail': '失败', 'unknown': '未知'}.get(m.get('status'), '未知')
        color = {'pass': '#16a34a', 'fail': '#dc2626', 'unknown': '#9ca3af'}.get(m.get('status'), '#9ca3af')
        tests = m.get('tests')
        cov = m.get('coverage')
        tests_cell = f"{tests['passed']}/{tests['total']}" if tests else '—'
        cov_cell = f"{cov['lines']}%（阈值 {cov['threshold']}%）" if cov and 'lines' in cov else '—'
        rows.append(
            f'<tr><td>{m.get("name", "")}</td>'
            f'<td style="color:{color};font-weight:600">{status_cn}</td>'
            f'<td>{tests_cell}</td><td>{cov_cell}</td>'
            f'<td>{m.get("durationMs", "—")} ms</td></tr>'
        )
    s = report['summary']
    return f"""<!DOCTYPE html>
<html lang="zh-CN"><head><meta charset="utf-8">
<title>MC 质量测试报告 v{VERSION}</title>
<style>
 body {{ font-family: -apple-system, "Microsoft YaHei", sans-serif; margin: 32px; color: #1f2937; }}
 h1 {{ font-size: 20px; }} h2 {{ font-size: 15px; margin-top: 24px; }}
 table {{ border-collapse: collapse; width: 100%; margin-top: 8px; }}
 th, td {{ border: 1px solid #e5e7eb; padding: 6px 10px; font-size: 13px; text-align: left; }}
 th {{ background: #f3f4f6; }}
 .summary {{ display: flex; gap: 24px; margin: 12px 0; }}
 .card {{ border: 1px solid #e5e7eb; border-radius: 8px; padding: 10px 16px; }}
 .card b {{ font-size: 18px; }}
</style></head><body>
<h1>MagicCommander 质量测试报告（4.6.0）</h1>
<p>生成时间：{report.get('generatedAt', '')}</p>
<div class="summary">
  <div class="card">总体 <b style="color:{'#16a34a' if s['status']=='pass' else '#dc2626'}">{'通过' if s['status']=='pass' else '失败'}</b></div>
  <div class="card">模块 <b>{s['passed']}/{s['modules']}</b></div>
  <div class="card">用例 <b>{s['passedTests']}/{s['totalTests']}</b></div>
</div>
<h2>各模块</h2>
<table>
<tr><th>模块</th><th>状态</th><th>通过/总数</th><th>覆盖率</th><th>耗时</th></tr>
{''.join(rows)}
</table>
</body></html>"""


def main(argv=None):
    parser = argparse.ArgumentParser(description='MC 统一测试报告（4.6.0-F6-3）')
    parser.add_argument('--skip-run', action='store_true', help='不运行 pytest/vitest，仅聚合已有产物 + 门禁')
    parser.add_argument('--no-gates', action='store_true', help='不运行门禁脚本')
    parser.add_argument('--report-dir', default=DEFAULT_REPORT_DIR, help='报告输出目录（默认 reports/）')
    args = parser.parse_args(argv)

    report_dir = os.path.abspath(args.report_dir)
    os.makedirs(report_dir, exist_ok=True)

    if not args.skip_run:
        # 全量运行：pytest（junit + 覆盖率 json）→ vitest（覆盖率）→ 门禁
        backend_cmd = [
            sys.executable, '-m', 'pytest', 'backend/tests', 'ai_hub/tests', '-q',
            f'--junitxml={os.path.join(report_dir, "junit", "backend.xml")}',
            '--cov=backend', '--cov=ai_hub',
            f'--cov-report=json:{os.path.join(report_dir, "coverage", "backend", "coverage.json")}',
            '--cov-report=term',
        ]
        print('[test_report] 运行 pytest（backend + ai_hub）…')
        subprocess.run(backend_cmd, cwd=REPO, timeout=3600)
        print('[test_report] 运行 vitest（--coverage）…')
        subprocess.run(['npx', 'vitest', 'run', '--coverage'], cwd=REPO, timeout=3600)

    modules = collect_modules(run_gates=not args.no_gates, skip_run=args.skip_run)
    report = build_report(modules)

    json_path = os.path.join(report_dir, 'quality_report.json')
    html_path = os.path.join(report_dir, 'quality_report.html')
    with open(json_path, 'w', encoding='utf-8') as f:
        json.dump(report, f, ensure_ascii=False, indent=2)
    with open(html_path, 'w', encoding='utf-8') as f:
        f.write(render_html(report))

    s = report['summary']
    print(f"[test_report] 报告生成：{json_path}")
    print(f"[test_report] HTML：{html_path}")
    print(f"[test_report] 总体 {s['status']}（模块 {s['passed']}/{s['modules']}，用例 {s['passedTests']}/{s['totalTests']}）")
    return 0 if s['status'] == 'pass' else 1


if __name__ == '__main__':
    sys.exit(main())
