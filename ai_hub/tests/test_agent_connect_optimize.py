"""5.1.9-519-a/c + X-519：Agent 驱动优化迭代与安全约束测试。

覆盖：
- 519-a：agent_feedback 记录反馈并产出优化建议
- 519-c：校验→建议→dry-run→审批闭环工具在编译态暴露（validate/dry_run/analyze/undo）
- X-519：无代码写入通道（写工具项目作用域；run_cli 白名单不含代码变更命令）
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


class TestFeedbackSelfOptimize:
    """519-a：反馈自优化。"""

    def test_feedback_records_and_suggests(self):
        from ai_hub.agent.tools import execute_tool

        res = asyncio.run(execute_tool(
            "agent_feedback",
            {"tool": "render_config", "result": "error", "notes": "模板变量缺失"},
        ))
        assert res["success"] is True
        data = json.loads(res["result"])
        assert data["status"] == "ok"
        assert data["feedback"]
        assert "建议" in data["suggestion"]

    def test_feedback_requires_tool(self):
        from ai_hub.agent.tools import execute_tool

        res = asyncio.run(execute_tool("agent_feedback", {}))
        assert res["success"] is False
        assert "tool" in res["error"]

    def test_feedback_exposed_in_compiled(self):
        from ai_hub.agent.tools import get_tool_definitions
        from ai_hub.mcp_server.capabilities import filter_tools_for_mode

        names = {t["name"] for t in filter_tools_for_mode("compiled", get_tool_definitions())}
        assert "agent_feedback" in names


class TestRepairLoopExposed:
    """519-c：校验→建议→dry-run→审批闭环工具在编译态可用。"""

    def test_loop_tools_available(self):
        from ai_hub.agent.tools import get_tool_definitions
        from ai_hub.mcp_server.capabilities import filter_tools_for_mode

        names = {t["name"] for t in filter_tools_for_mode("compiled", get_tool_definitions())}
        loop_tools = {"validate_template", "validate_excel", "dry_run", "analyze_project", "undo_render", "diff_compare"}
        assert loop_tools.issubset(names), loop_tools - names


class TestNoCodeWriteChannel:
    """X-519：不通过 MCP 暴露代码写入（安全约束）。"""

    def test_write_tools_project_scoped(self):
        """写工具仅接受项目作用域参数，无任意文件系统写。"""
        from ai_hub.agent.tools import get_tool_definitions
        from ai_hub.mcp_server.capabilities import filter_tools_for_mode

        tools = filter_tools_for_mode("compiled", get_tool_definitions())
        write_names = {"write_text_file", "write_excel", "update_template", "import_project"}
        for t in tools:
            if t["name"] in write_names:
                props = t["parameters"].get("properties", {})
                # 项目作用域写入必须要求项目标识；不允许仅凭 path/content 直接写任意位置
                assert "projectName" in props or "templateName" in props, t["name"]

    def test_run_cli_whitelist_no_code_mutation(self):
        """run_cli 白名单不包含代码变更/执行类命令。"""
        from ai_hub.agent.tools import _CLI_ALLOWED_ROOTS

        forbidden = {"git", "npm", "pip", "shell", "sh", "bash", "exec", "system", "install", "config", "python"}
        assert not (set(_CLI_ALLOWED_ROOTS) & forbidden), set(_CLI_ALLOWED_ROOTS) & forbidden

    def test_no_source_write_tools(self):
        """MCP 工具集不含源码写工具（read_source/read_file 均只读）。"""
        from ai_hub.agent.tools import get_tool_definitions

        names = {t["function"]["name"] for t in get_tool_definitions()}
        for n in names:
            if "write" in n or "delete" in n or "update" in n:
                # 这些是项目/模板作用域，允许存在；但禁止对源码路径的写
                assert n not in ("write_source", "write_file_abs", "fs_write")
