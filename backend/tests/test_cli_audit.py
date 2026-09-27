"""MC-CLI-A7：审计日志（P2-7）行为测试。

覆盖：
- 成功命令写审计（command / argv / ok=true / exitCode）
- 失败/异常写审计（ok=false + error）
- 敏感参数脱敏（content / apiKey / token 等 → `***`）
- argv 脱敏（`--content <val>` / `--api-key=<val>`）
- 审计写入失败不阻塞主流程
- 无命令 / argparse 级错误不写审计（在 main 体之前）

运行：pytest backend/tests/test_cli_audit.py
"""
from __future__ import annotations

import importlib.util
import json
import os
import subprocess
import sys

import pytest

REPO = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
MAIN_PY = os.path.join(REPO, 'backend', 'main.py')


def _load_main():
    """以模块方式加载 backend/main.py（隔离 import 副作用）。"""
    sys.path.insert(0, os.path.join(REPO, 'backend'))
    spec = importlib.util.spec_from_file_location('mc_main', MAIN_PY)
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    return mod


@pytest.fixture(scope='module')
def mcmain():
    return _load_main()


class TestRedaction:
    def test_params_redacted(self, mcmain):
        r = mcmain._redact_params(
            {'content': 'SECRET', 'apiKey': 'sk-1', 'token': 't', 'name': 'ok', 'message': 'hi'}
        )
        assert r['content'] == '***'
        assert r['apiKey'] == '***'
        assert r['token'] == '***'
        assert r['name'] == 'ok'
        assert r['message'] == 'hi'

    def test_argv_inline_redacted(self, mcmain):
        r = mcmain._redact_argv(['--api-key=sk-abc', '--name', 'ok'])
        assert r == ['--api-key=***', '--name', 'ok']

    def test_argv_separate_redacted(self, mcmain):
        r = mcmain._redact_argv(['template', 'update', '--content', 'SECRET', '--name', 'ok'])
        assert r == ['template', 'update', '--content', '***', '--name', 'ok']

    def test_no_sensitive_untouched(self, mcmain):
        assert mcmain._redact_argv(['render', 'project', '1']) == ['render', 'project', '1']


class TestAuditWrite:
    def test_success_recorded(self, tmp_path):
        audit = tmp_path / 'mc-audit.jsonl'
        env = dict(os.environ, MC_AUDIT_PATH=str(audit))
        r = subprocess.run([sys.executable, MAIN_PY, 'project', 'list'],
                           cwd=os.path.join(REPO, 'backend'), env=env,
                           capture_output=True, text=True)
        assert r.returncode == 0
        rec = json.loads(audit.read_text(encoding='utf-8').strip().splitlines()[-1])
        assert rec['command'] == 'project:list'
        assert rec['ok'] is True
        assert rec['exitCode'] == 0
        assert 'ts' in rec

    def test_audit_disabled(self, tmp_path):
        audit = tmp_path / 'mc-audit.jsonl'
        env = dict(os.environ, MC_AUDIT_PATH=str(audit), MC_AUDIT_DISABLED='1')
        subprocess.run([sys.executable, MAIN_PY, 'project', 'list'],
                       cwd=os.path.join(REPO, 'backend'), env=env,
                       capture_output=True, text=True)
        assert not audit.exists()

    def test_failure_does_not_block(self, mcmain, tmp_path, monkeypatch):
        """审计目标不可写时，命令仍正常返回。"""
        monkeypatch.setenv('MC_AUDIT_PATH', str(tmp_path / 'no' / 'such' / 'dir' / 'a.jsonl'))
        # 不应抛异常
        mcmain.audit_log('project:list', {'a': 1}, ['project', 'list'], ok=True, exit_code=0)

    def test_path_priority(self, mcmain, monkeypatch, tmp_path):
        monkeypatch.setenv('MC_AUDIT_PATH', str(tmp_path / 'explicit.jsonl'))
        assert mcmain._audit_path() == str(tmp_path / 'explicit.jsonl')
        monkeypatch.delenv('MC_AUDIT_PATH')
        monkeypatch.setenv('MC_USER_DATA', str(tmp_path / 'ud'))
        assert mcmain._audit_path() == str(tmp_path / 'ud' / 'audit' / 'mc-audit.jsonl')


class TestCommandNameComposition:
    def test_subcommand_included(self, tmp_path):
        audit = tmp_path / 'a.jsonl'
        env = dict(os.environ, MC_AUDIT_PATH=str(audit))
        subprocess.run([sys.executable, MAIN_PY, 'template', 'list'],
                       cwd=os.path.join(REPO, 'backend'), env=env,
                       capture_output=True, text=True)
        rec = json.loads(audit.read_text(encoding='utf-8').strip().splitlines()[-1])
        assert rec['command'] == 'template:list'
