"""5.1.6-516-d + X-516：结构化错误码与连接自检测试。

覆盖：
- 516-d：execute_tool/_execute_wrapped 失败携带 error_code（UNKNOWN_TOOL/INVALID_ARGS/BUSINESS/EXEC/L2）
- X-516：manager.selfcheck() 结构化检查（SDK/开关/工具/审计）+ HTTP /agent-connect/selfcheck
"""
import asyncio
import sys
from pathlib import Path

import pytest

sys.path.insert(0, str(Path(__file__).resolve().parents[2]))
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))


@pytest.fixture(autouse=True)
def _restore_execute_tool():
    """每用例后恢复 tools.execute_tool，防止 fake 泄漏到其他测试文件。"""
    import ai_hub.agent.tools as tools_mod

    orig = tools_mod.execute_tool
    yield
    tools_mod.execute_tool = orig


class TestStructuredErrorCodes:
    """516-d：结构化错误码 + 可读提示。"""

    def test_unknown_tool_code(self):
        from ai_hub.agent.tools import execute_tool

        res = asyncio.run(execute_tool("no_such_tool", {}))
        assert res["success"] is False
        assert res["error_code"] == "AC_ERR_UNKNOWN_TOOL"
        assert "未知工具" in res["error"]

    def test_invalid_args_code(self):
        from ai_hub.agent.tools import execute_tool, init_tools

        init_tools()
        res = asyncio.run(execute_tool("create_project", {}))
        assert res["success"] is False
        assert res["error_code"] == "AC_ERR_INVALID_ARGS"
        assert "缺少必需参数" in res["error"]

    def test_business_code(self):
        from ai_hub.agent.tools import execute_tool, register_tool, unregister_tool

        async def _handler(args):
            return '{"status": "error", "error": "机房布局校验未通过"}'

        register_tool("tmp_biz_fail", "测试", {"type": "object", "properties": {}, "required": []}, _handler)
        try:
            res = asyncio.run(execute_tool("tmp_biz_fail", {}))
            assert res["success"] is False
            assert res["error_code"] == "AC_ERR_BUSINESS"
            assert "机房布局校验未通过" in res["error"]
        finally:
            unregister_tool("tmp_biz_fail")

    def test_l2_failure_code_via_manager(self):
        """L2 业务失败经 _execute_wrapped 携带 AC_ERR_L2_BUSINESS。"""
        from ai_hub.mcp_server.manager import AgentConnectManager, reset_manager

        reset_manager()
        mgr = AgentConnectManager()

        async def _fake_execute(name, arguments):
            return {"success": True, "result": {"status": "error", "error": "布局校验未通过"}}

        import ai_hub.agent.tools as tools_mod
        tools_mod.execute_tool = _fake_execute

        res = asyncio.run(mgr._execute_wrapped("create_project", {"projectId": "p1"}))
        assert res["success"] is False
        assert res["error_code"] == "AC_ERR_L2_BUSINESS"
        assert "布局校验未通过" in res["error"]


class TestSelfcheck:
    """X-516：连接自检可测性。"""

    def test_selfcheck_enabled_shape(self):
        from ai_hub.mcp_server.manager import AgentConnectManager, reset_manager

        reset_manager()
        mgr = AgentConnectManager()
        report = mgr.selfcheck()
        assert "ok" in report
        assert "mode" in report
        assert isinstance(report["checks"], list)
        names = {c["name"] for c in report["checks"]}
        assert {"mcp_sdk", "enabled", "tools", "audit"}.issubset(names)
        for c in report["checks"]:
            assert "ok" in c and "message" in c

    def test_selfcheck_disabled_not_ok(self):
        from ai_hub.mcp_server.manager import AgentConnectManager, reset_manager

        reset_manager()
        mgr = AgentConnectManager()  # 未 enable
        report = mgr.selfcheck()
        assert report["ok"] is False
        enabled_check = next(c for c in report["checks"] if c["name"] == "enabled")
        assert enabled_check["ok"] is False
        assert enabled_check["hint"]

    def test_selfcheck_sdk_missing(self, monkeypatch):
        from ai_hub.mcp_server import manager as server_manager

        def _fake_import():
            raise ImportError("MCP SDK 未安装（pip install 'mcp>=1.2.0'）")

        monkeypatch.setattr(server_manager, "_import_fastmcp", _fake_import)
        server_manager.reset_manager()
        mgr = server_manager.AgentConnectManager()
        report = mgr.selfcheck()
        sdk_check = next(c for c in report["checks"] if c["name"] == "mcp_sdk")
        assert sdk_check["ok"] is False
        assert "pip install" in sdk_check["hint"]

    def test_selfcheck_http_endpoint(self, tmp_path):
        """HTTP GET /agent-connect/selfcheck 返回结构化检查。"""
        from ai_hub.api.chat import router
        from ai_hub.mcp_server.manager import reset_manager

        reset_manager()
        import starlette.testclient
        from fastapi import FastAPI

        app = FastAPI()
        app.include_router(router)
        client = starlette.testclient.TestClient(app)
        resp = client.get("/api/chat/agent-connect/selfcheck")
        assert resp.status_code == 200
        data = resp.json()["data"]
        assert "ok" in data
        assert "checks" in data
