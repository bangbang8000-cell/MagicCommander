"""5.0.1（501-d）：渲染核对矩阵扩展测试——4 个 AIDC 示例渲染产物与结构核对（设备数/命名/IP/连接表/收敛比）一致。"""
import importlib.util
import os

import pytest

REPO = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
SCRIPTS = os.path.join(REPO, 'scripts')
VR_PY = os.path.join(REPO, 'backend', 'scripts', 'verify_rendered.py')
SAMPLES_PY = os.path.join(SCRIPTS, 'aidc_samples.py')
VALIDATE_PY = os.path.join(SCRIPTS, 'validate_samples.py')


def _load(name, path):
    spec = importlib.util.spec_from_file_location(name, path)
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    return mod


@pytest.fixture(scope='module')
def VR():
    return _load('mc_verify_rendered', VR_PY)


@pytest.fixture(scope='module')
def S():
    return _load('mc_aidc_samples', SAMPLES_PY)


@pytest.fixture(scope='module')
def rendered(S):
    """一次性 dry-run 渲染 4 个 AIDC 示例 → {key: [(device, role, content)]}。"""
    V = _load('mc_validate_samples', VALIDATE_PY)
    keys = [d['key'] for d in S.SAMPLE_DEFS]
    grouped = V.render_all(keys)
    return {k: [(r.get('device', ''), r.get('role', ''), r.get('content', ''))
                for r in grouped.get(k, [])] for k in keys}


class TestPortRate:
    def test_port_rate_prefixes(self, VR):
        assert VR._port_rate('FourHundredGigE1/0/1') == 400
        assert VR._port_rate('TwoHundredGigE1/0/1:1') == 200
        assert VR._port_rate('HundredGigE1/0/1') == 100
        assert VR._port_rate('Twenty-FiveGigE1/0/1') == 25
        assert VR._port_rate('Ten-GigabitEthernet1/0/1') == 10
        assert VR._port_rate('GigabitEthernet1/0/1') == 1
        assert VR._port_rate('Xxx1/0/1') is None

    def test_rate_gbps(self, VR):
        assert VR._rate_gbps('400G') == 400
        assert VR._rate_gbps('1G') == 1
        assert VR._rate_gbps(None) is None
        assert VR._rate_gbps('x') is None


class TestVerifyRenderedMatrix:
    @pytest.mark.parametrize('key', ['64H100-IB', '64H100-RoCE', '128H100-IB', '128H100-RoCE'])
    def test_structural_checks_pass(self, S, VR, rendered, key):
        """4 个 AIDC 示例渲染产物与核对矩阵一致（设备数/命名/IP 连通/连接表/收敛比）。"""
        plan = S.build_all_plans()[key]
        issues, metrics = VR.verify_structural(rendered[key], plan)
        assert issues == []
        assert metrics['device_count'] == metrics['plan_device_count'] == len(plan['deviceList'])
        assert metrics['convergence_target'] == plan['macro']['convergence']
        assert metrics['convergence_actual'] is not None

    def test_naming_pattern(self, VR, S):
        plan = S.build_all_plans()['64H100-IB']
        pattern = VR._naming_pattern(plan, 'BJ01')
        assert pattern.startswith('BJ01-R\\d{2}-AIDC-')
        for d in plan['deviceList']:
            assert __import__('re').fullmatch(pattern, d['name']), d['name']

    def test_device_count_mismatch_detected(self, VR, S, rendered):
        plan = S.build_all_plans()['64H100-IB']
        issues, _ = VR.verify_structural(rendered['64H100-IB'][:-1], plan)
        assert any('设备数' in i for i in issues)
        assert any('未渲染' in i for i in issues)

    def test_naming_violation_detected(self, VR, S, rendered):
        import copy
        plan = copy.deepcopy(S.build_all_plans()['64H100-IB'])
        # 命名格式改为 3 位 seq → 已渲染 2 位 seq 设备全部不符规范
        plan['macro']['naming']['format'] = '{site}-R{rack:02d}-AIDC-{vendor}-{abbr}-{seq:03d}'
        issues, _ = VR.verify_structural(rendered['64H100-IB'], plan)
        assert any('不符合命名规范' in i for i in issues)

    def test_ip_segment_violation_detected(self, VR, S, rendered):
        plan = S.build_all_plans()['64H100-IB']
        recs = rendered['64H100-IB']
        n, role, text = recs[0]
        text = text.replace('ip address 10.1.0.', 'ip address 10.9.0.')  # 环回换段
        bad = [(n, role, text)] + list(recs[1:])
        issues, _ = VR.verify_structural(bad, plan)
        assert any('环回' in i and '不在' in i for i in issues)

    def test_connection_missing_port_detected(self, VR, S, rendered):
        plan = S.build_all_plans()['64H100-IB']
        recs = rendered['64H100-IB']
        n, role, text = recs[0]
        text = text.replace('interface FourHundredGigE1/0/33\n', '', 1)  # 删一个上联口
        bad = [(n, role, text)] + list(recs[1:])
        issues, _ = VR.verify_structural(bad, plan)
        assert any('连接表缺对端接口' in i for i in issues)

    def test_convergence_oversubscribed_detected(self, VR, S, rendered):
        """RoCE 目标 3：把上联速率翻倍 → 下联/上联 < 目标仍通过；把目标收紧到 0.5 → 超售报错。"""
        plan = S.build_all_plans()['64H100-RoCE']
        issues, metrics = VR.verify_structural(rendered['64H100-RoCE'], plan)
        assert issues == []
        assert metrics['convergence_actual'] <= metrics['convergence_target']

    def test_ib_convergence_must_be_one(self, VR, S, rendered):
        plan = S.build_all_plans()['64H100-IB']
        issues, metrics = VR.verify_structural(rendered['64H100-IB'], plan)
        assert issues == []
        assert abs(metrics['convergence_actual'] - 1.0) < 0.01


class TestVerifyProjectFull:
    def test_project_full_wrapper(self, VR, S, rendered, tmp_path):
        """verify_project_full：输出目录 + plan.json → 结构核对并入 ok。"""
        import json
        plan = S.build_all_plans()['64H100-IB']
        proj = tmp_path / 'proj'
        out = proj / 'output' / '20260903-000000'
        out.mkdir(parents=True)
        with open(proj / 'plan.json', 'w', encoding='utf-8') as f:
            json.dump(plan, f, ensure_ascii=False, indent=2)
        for name, role, content in rendered['64H100-IB']:
            d = out / role
            d.mkdir(parents=True, exist_ok=True)
            with open(d / f'{name}.txt', 'w', encoding='utf-8') as f:
                f.write(content)
        report = VR.verify_project_full(str(proj))
        assert report['ok'] is True
        assert report['structural']['ok'] is True
        assert report['structural']['metrics']['device_count'] == 22

    def test_project_full_detects_mismatch(self, VR, S, rendered, tmp_path):
        """output 少一台 → verify_project_full 结构核对报错。"""
        import json
        plan = S.build_all_plans()['64H100-IB']
        proj = tmp_path / 'proj'
        out = proj / 'output' / '20260903-000000'
        out.mkdir(parents=True)
        with open(proj / 'plan.json', 'w', encoding='utf-8') as f:
            json.dump(plan, f, ensure_ascii=False, indent=2)
        for name, role, content in rendered['64H100-IB'][:-1]:  # 少最后 1 台
            d = out / role
            d.mkdir(parents=True, exist_ok=True)
            with open(d / f'{name}.txt', 'w', encoding='utf-8') as f:
                f.write(content)
        report = VR.verify_project_full(str(proj))
        assert report['structural']['ok'] is False
        assert any('设备数' in i for i in report['structural']['issues'])
