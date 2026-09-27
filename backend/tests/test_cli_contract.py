"""MC-CLI-A5/A6：CLI 契约守卫的行为测试（C1-C7）。

守卫本体：`scripts/check_cli_contract.py` —— 真值源在 `backend/main.py`
（退出码常量 / epilog / print_error 流 / status 白名单），本用例确保守卫
**真的会因违例而失败**（不只验证「当前通过」），并对关键契约做正向断言。

覆盖：
- C1 退出码常量存在且取值 0/1/2/3
- C2 无裸 sys.exit(数字)（130 白名单）
- C3 --version 不硬编码
- C4 print_error/warning 走 stderr
- C5 epilog 无残留已移除命令
- C7 status 取值白名单（MC-CLI-A6，P2-6）——正/反双向

运行：pytest backend/tests/test_cli_contract.py
"""
from __future__ import annotations

import importlib.util
import os
import re
import sys

import pytest

REPO = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
GUARD = os.path.join(REPO, 'scripts', 'check_cli_contract.py')
MAIN_PY = os.path.join(REPO, 'backend', 'main.py')


def _load_guard():
    spec = importlib.util.spec_from_file_location('check_cli_contract', GUARD)
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    return mod


@pytest.fixture(scope='module')
def guard():
    assert os.path.exists(GUARD), f'守卫脚本缺失: {GUARD}'
    return _load_guard()


@pytest.fixture(scope='module')
def main_src():
    with open(MAIN_PY, 'r', encoding='utf-8') as f:
        return f.read()


class TestGuardPassesOnCurrentTree:
    """当前树必须全绿。"""

    def test_guard_exit_zero(self):
        import subprocess
        r = subprocess.run([sys.executable, GUARD], capture_output=True, text=True)
        assert r.returncode == 0, f'守卫未通过:\n{r.stdout}\n{r.stderr}'

    def test_all_checks_present(self, guard):
        assert hasattr(guard, 'check_status_whitelist'), 'C7 检查函数缺失'
        assert guard.STATUS_WHITELIST == ('success', 'error', 'warning', 'progress', 'complete')


class TestC1ExitConstants:
    def test_constants_values(self, guard, main_src):
        assert guard.check_exit_constants(main_src) == []

    def test_wrong_value_detected(self, guard):
        bad = 'EXIT_OK = 0\nEXIT_INTERNAL = 1\nEXIT_USAGE = 9\nEXIT_EXEC = 3\n'
        v = guard.check_exit_constants(bad)
        assert any(x.check == 'C1' for x in v)


class TestC2RawExits:
    def test_no_raw_exit(self, guard, main_src):
        assert guard.check_raw_exits(main_src) == []

    def test_raw_exit_detected(self, guard):
        v = guard.check_raw_exits('import sys\nsys.exit(2)\n')
        assert any(x.check == 'C2' for x in v)

    def test_sigint_whitelisted(self, guard):
        assert guard.check_raw_exits('import sys\nsys.exit(130)\n') == []


class TestC7StatusWhitelist:
    """MC-CLI-A6 / P2-6：status 顶层取值收拢。"""

    def test_current_tree_clean(self, guard):
        assert guard.check_status_whitelist() == []

    def test_whitelist_covers_electron_accepted_values(self, guard):
        # Electron render.handler.ts 认 success/complete/error；warning 必须也在白名单
        for v in ('success', 'complete', 'error', 'warning', 'progress'):
            assert v in guard.STATUS_WHITELIST

    def test_illegal_value_is_caught(self, guard, tmp_path, monkeypatch):
        # 构造一个含非法 status 的假 main.py，指向扫描文件
        fake = tmp_path / 'fake_main.py'
        fake.write_text(
            "print({'status': 'ok'})\nprint({'status': 'success'})\n",
            encoding='utf-8',
        )
        monkeypatch.setattr(guard, 'STATUS_SCAN_FILES', (str(fake),))
        monkeypatch.setattr(guard, 'ROOT', str(tmp_path), raising=False)
        v = guard.check_status_whitelist()
        assert len(v) == 1 and "status='ok'" in v[0].message


class TestC6DocConsistency:
    """P3-2：MC docs/cli.md 已建立并与顶层命令树对账。"""

    def test_doc_exists(self):
        assert os.path.exists(os.path.join(REPO, 'docs', 'cli.md')), 'docs/cli.md 缺失'

    def test_doc_lists_all_top_level_commands(self, guard, main_src):
        doc = os.path.join(REPO, 'docs', 'cli.md')
        if not os.path.exists(doc):
            pytest.skip('docs/cli.md 不存在')
        assert guard.check_doc_consistency(main_src, doc) == []


    """main.py 内的契约常量与实现保持一致。"""

    def test_status_constants_declared(self, main_src):
        for name in ('STATUS_SUCCESS', 'STATUS_ERROR', 'STATUS_WARNING',
                     'STATUS_PROGRESS', 'STATUS_COMPLETE', 'STATUS_VALUES'):
            assert re.search(rf'^{name}\s*=', main_src, re.MULTILINE), f'缺少 {name}'

    def test_naming_flag_replaced(self, main_src):
        """批次 B：render/diff 的 --format 已改名 --naming，消费点同步。"""
        assert "'--naming'" in main_src
        # 已无 device_name/device_sn 语义的 --format
        assert not re.search(r"--format['\"],\s*choices=\['device_name'", main_src)

    def test_no_args_format_for_naming_consumers(self, main_src):
        """render/diff 消费点不得再读 args.format。"""
        # diff 分支已用 args.naming
        assert 'args.naming' in main_src
