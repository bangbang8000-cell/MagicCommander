"""4.6.0-F6-3（46-c）Q-3：测试报告生成（JSON 结构断言）

- Q-3 断言：build_report() 输出 JSON 结构（schema/version/generatedAt/modules/summary）；
  解析 junit xml 与 vitest coverage-summary 的结构。
"""
import importlib.util
import json
import os

REPO = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
SCRIPT = os.path.join(REPO, 'scripts', 'test_report.py')


def _load_module():
    spec = importlib.util.spec_from_file_location('mc_test_report', SCRIPT)
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    return mod


def test_build_report_json_structure():
    mod = _load_module()
    modules = [
        {'id': 'a', 'name': 'A', 'status': 'pass', 'tests': {'total': 10, 'passed': 10, 'failed': 0, 'skipped': 0}},
        {'id': 'b', 'name': 'B', 'status': 'fail', 'tests': {'total': 5, 'passed': 4, 'failed': 1, 'skipped': 0}},
    ]
    report = mod.build_report(modules, generated_at='2026-09-02T00:00:00+0800')
    assert report['schema'] == 'mc.quality-report/1'
    assert report['version'] == '4.6.0'
    assert report['generatedAt'] == '2026-09-02T00:00:00+0800'
    assert isinstance(report['modules'], list) and len(report['modules']) == 2
    s = report['summary']
    assert s['status'] == 'fail'
    assert s['modules'] == 2 and s['passed'] == 1 and s['failed'] == 1
    assert s['totalTests'] == 15 and s['passedTests'] == 14


def test_build_report_all_pass():
    mod = _load_module()
    modules = [
        {'id': 'a', 'name': 'A', 'status': 'pass', 'tests': {'total': 3, 'passed': 3, 'failed': 0, 'skipped': 0}},
    ]
    report = mod.build_report(modules)
    assert report['summary']['status'] == 'pass'


def test_parse_junit_xml_structure(tmp_path):
    mod = _load_module()
    xml = tmp_path / 'backend.xml'
    xml.write_text('<testsuite tests="424" errors="0" failures="2" skipped="1" time="123.4"/>', encoding='utf-8')
    stats = mod.parse_junit_xml(str(xml))
    assert stats['total'] == 424
    assert stats['failures'] == 2
    assert stats['skipped'] == 1
    assert stats['time'] == 123.4


def test_parse_frontend_coverage_structure(tmp_path):
    mod = _load_module()
    p = tmp_path / 'coverage-summary.json'
    p.write_text(
        json.dumps({
            'total': {
                'lines': {'pct': 62.5},
                'statements': {'pct': 60.1},
                'functions': {'pct': 50},
                'branches': {'pct': 45},
            }
        }),
        encoding='utf-8',
    )
    cov = mod.parse_frontend_coverage(str(p))
    assert cov['lines'] == 62.5
    assert cov['threshold'] == mod.coverage_thresholds()['frontend']
    assert cov['lines'] >= cov['threshold']
