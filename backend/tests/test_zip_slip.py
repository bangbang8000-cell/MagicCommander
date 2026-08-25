"""MC-S2：zip-slip 防护测试（交付包 zip 解压逐条目校验）"""
import os
import sys
import tempfile
import zipfile

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

import pytest  # noqa: E402
from main import _load_plan_input, _safe_extract_zip  # noqa: E402


def _make_zip(path: str, entries: dict) -> str:
    with zipfile.ZipFile(path, 'w') as z:
        for name, data in entries.items():
            z.writestr(name, data)
    return path


def test_zip_slip_rejects_traversal_entry():
    """包含 ../ 条目的 zip 必须整体拒绝，且无文件写出到目标目录外"""
    with tempfile.TemporaryDirectory() as d:
        zpath = _make_zip(os.path.join(d, 'evil.zip'), {'../evil.txt': 'x', 'plan.json': '{}'})
        with zipfile.ZipFile(zpath) as zf:
            with pytest.raises(ValueError):
                _safe_extract_zip(zf, d)
        # 目标目录外不得有 evil.txt
        assert not os.path.exists(os.path.join(os.path.dirname(d), 'evil.txt'))


def test_zip_slip_rejects_absolute_entry():
    """含绝对路径条目（/etc/passwd、C:/evil）必须拒绝"""
    with tempfile.TemporaryDirectory() as d:
        for bad in ('/etc/passwd', 'C:/evil.txt', 'C:\\evil.txt'):
            zpath = _make_zip(os.path.join(d, 'evil2.zip'), {bad: 'x'})
            with zipfile.ZipFile(zpath) as zf:
                with pytest.raises(ValueError):
                    _safe_extract_zip(zf, d)


def test_zip_slip_accepts_normal_entries():
    """正常相对路径条目应正常解压"""
    with tempfile.TemporaryDirectory() as d:
        zpath = _make_zip(os.path.join(d, 'ok.zip'), {'plan.json': '{}', 'assets/a.txt': 'x'})
        with zipfile.ZipFile(zpath) as zf:
            _safe_extract_zip(zf, d)
        assert os.path.exists(os.path.join(d, 'plan.json'))
        assert os.path.exists(os.path.join(d, 'assets', 'a.txt'))


def test_load_plan_input_malicious_zip_returns_error():
    """恶意交付包经 _load_plan_input 返回 error（不抛异常、不部分解压）"""
    with tempfile.TemporaryDirectory() as d:
        zpath = _make_zip(os.path.join(d, 'evil3.zip'), {'../evil.txt': 'x'})
        result = _load_plan_input(zpath)
        assert 'error' in result


def test_load_plan_input_normal_zip_returns_plan():
    """正常交付包能取到 plan.json"""
    import json
    with tempfile.TemporaryDirectory() as d:
        zpath = _make_zip(os.path.join(d, 'ok2.zip'), {'plan.json': json.dumps({'site': 'BJ01'})})
        result = _load_plan_input(zpath)
        assert result.get('site') == 'BJ01'
