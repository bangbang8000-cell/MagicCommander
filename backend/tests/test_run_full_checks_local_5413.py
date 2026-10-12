"""5.4.13-F54-13-2：MC 本地全量检查脚本契约测试（steps() 执行计划 = 单一事实源）。"""
import os
import sys

import pytest

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))))  # 仓库根
sys.path.insert(0, os.path.join(os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))), "scripts"))

from run_full_checks_local import steps  # noqa: E402


class TestLocalFullCheckPlan:
    def test_plan_contains_core_gates(self):
        names = [n for n, _, _ in steps()]
        # CI 硬前置核心门禁必须都在本地计划中
        assert "typecheck" in names
        assert "模板校验" in names
        assert "golden 基线比对" in names
        assert "性能门禁" in names
        assert "后端 pytest" in names
        assert "ai_hub pytest" in names

    def test_plan_includes_env_limited_steps_as_hard_gate(self):
        """CI 中 continue-on-error 的步骤（模板/示例/golden）在本地必须为硬门禁。"""
        names = [n for n, _, _ in steps()]
        for name in ("模板校验", "示例自动化验收", "golden 基线比对"):
            assert name in names, f"本地硬门禁缺失: {name}"

    def test_plan_unique_names(self):
        names = [n for n, _, _ in steps()]
        assert len(names) == len(set(names))

    def test_plan_commands_are_strings(self):
        for name, cmd, cwd in steps():
            assert isinstance(cmd, list) and all(isinstance(c, str) for c in cmd)
            assert cwd is None or isinstance(cwd, str)
