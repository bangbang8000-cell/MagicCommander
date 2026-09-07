"""5.1.7-517-a/b + X-517：源码态无限制通道（CLI 透传 + 文件系统沙箱）测试。

覆盖：
- 源码态暴露 run_cli/read_file/list_dir/read_source；编译态强制过滤
- 沙箱：read_file/list_dir 越权拒绝（沙箱外路径）
- read_source 读仓库源码；run_cli 白名单拒绝 + 透传参数正确
"""
import asyncio
import json
import sys
from pathlib import Path

import pytest

sys.path.insert(0, str(Path(__file__).resolve().parents[2]))
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))


@pytest.fixture(autouse=True)
def _init(tmp_path):
    from ai_hub.agent.tools import init_tools, set_workspace_dir

    set_workspace_dir(str(tmp_path))
    init_tools()
    yield


def _filtered(mode):
    from ai_hub.agent.tools import get_tool_definitions
    from ai_hub.mcp_server.capabilities import filter_tools_for_mode

    return {t["name"] for t in filter_tools_for_mode(mode, get_tool_definitions())}


class TestModeExposure:
    def test_source_exposes_source_tools(self):
        names = _filtered("source")
        assert {"run_cli", "read_file", "list_dir", "read_source"}.issubset(names)

    def test_compiled_blocks_source_tools(self):
        names = _filtered("compiled")
        for n in ("run_cli", "list_dir", "read_source"):
            assert n not in names
        assert "read_file" not in names  # 项目 read_file 亦被过滤


class TestSandbox:
    async def _run(self, name, args):
        from ai_hub.agent.tools import execute_tool

        return await execute_tool(name, args)

    def test_read_file_in_sandbox_ok(self, tmp_path):
        f = tmp_path / "hello.txt"
        f.write_text("你好 sandbox", encoding="utf-8")
        res = asyncio.run(self._run("read_file", {"path": str(f)}))
        assert res["success"] is True
        data = json.loads(res["result"])
        assert data["status"] == "ok"
        assert "你好 sandbox" in data["content"]

    def test_read_file_outside_sandbox_rejected(self, tmp_path):
        outside = tmp_path.parent / "secret.txt"
        res = asyncio.run(self._run("read_file", {"path": str(outside)}))
        assert res["success"] is False
        assert "越权" in res["error"]

    def test_list_dir_outside_rejected(self, tmp_path):
        res = asyncio.run(self._run("list_dir", {"path": str(tmp_path.parent)}))
        assert res["success"] is False
        assert "越权" in res["error"]

    def test_list_dir_in_sandbox_ok(self, tmp_path):
        res = asyncio.run(self._run("list_dir", {"path": str(tmp_path)}))
        assert res["success"] is True
        data = json.loads(res["result"])
        assert data["status"] == "ok"
        assert isinstance(data["entries"], list)

    def test_read_source_reads_repo(self):
        tools_path = str(Path(__file__).resolve().parents[1] / "agent" / "tools.py")
        res = asyncio.run(self._run("read_source", {"path": tools_path}))
        assert res["success"] is True
        data = json.loads(res["result"])
        assert data["status"] == "ok"
        assert "def register_tool" in data["content"]


class TestRunCli:
    def test_run_cli_rejects_non_whitelist(self):
        from ai_hub.agent.tools import execute_tool

        res = asyncio.run(execute_tool("run_cli", {"subcommand": "rm -rf /"}))
        assert res["success"] is False
        assert "白名单" in res["error"]

    def test_run_cli_requires_subcommand(self):
        from ai_hub.agent.tools import execute_tool

        res = asyncio.run(execute_tool("run_cli", {}))
        assert res["success"] is False
        assert "subcommand" in res["error"]

    def test_run_cli_whitelist_passes_cmd(self, monkeypatch):
        from ai_hub.agent.tools import execute_tool

        captured = {}

        async def _fake_cli(cmd):
            captured["cmd"] = cmd
            return json.dumps({"status": "ok", "data": "done"}, ensure_ascii=False)

        import ai_hub.agent.tools as tools_mod
        monkeypatch.setattr(tools_mod, "_run_python_cli", _fake_cli)
        res = asyncio.run(execute_tool("run_cli", {"subcommand": "project list", "args": ["--format", "json"]}))
        assert res["success"] is True
        assert captured["cmd"] == ["project", "list", "--format", "json"]

    def test_run_cli_args_must_be_array(self):
        from ai_hub.agent.tools import execute_tool

        res = asyncio.run(execute_tool("run_cli", {"subcommand": "project list", "args": "oops"}))
        assert res["success"] is False
        assert "数组" in res["error"]
