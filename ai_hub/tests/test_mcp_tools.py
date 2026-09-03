"""5.0.3-503-c：MCP 工具接入测试（mock stdio server）

覆盖：
- 配置管理：add/list/get/remove + <workspace>/.mc_mcp_config.json 持久化（重载恢复）
- 子进程生命周期：start_server（mock stdio_client + ClientSession）/ stop_server / server_status
- 工具发现注册：list_tools → 动态 register_tool（命名空间 mcp:<server>:<tool> 防冲突）
- 执行分发：ClientSession.call_tool 包装为 {success, result|error}（含 isError / 未运行）
- 双引擎共享：注入 tools.py 注册表后 execute_tool 透传（自有/外部引擎通用面）
- mcp SDK 未安装：启动返回可读错误（不阻断）
- 审计登记：mcp 允许依赖（见 test_no_external_agent.py）
"""
import asyncio
import json
import os
import sys
import types

import pytest

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))))

from ai_hub.mcp.manager import MCPManager, MCP_TOOL_PREFIX, get_mcp_manager
from ai_hub.agent import tools as tools_mod


# ============================================================
# Fake MCP SDK（mock stdio server）
# ============================================================

FAKE_MCP_STATE = {"tools": [], "results": {}, "call_history": []}


class FakeCallToolResult:
    def __init__(self, content=None, is_error=False, structured_content=None):
        self.content = content or []
        self.isError = is_error
        self.structuredContent = structured_content


class FakeTool:
    def __init__(self, name, description="", input_schema=None):
        self.name = name
        self.description = description
        self.inputSchema = input_schema or {"type": "object", "properties": {}, "required": []}


def _install_fake_mcp(monkeypatch):
    """向 sys.modules 注入 fake mcp SDK（ClientSession/StdioServerParameters/stdio_client）。"""
    mcp_mod = types.ModuleType("mcp")
    mcp_client = types.ModuleType("mcp.client")
    mcp_stdlib = types.ModuleType("mcp.client.stdio")

    class StdioServerParameters:
        def __init__(self, command="", args=None, env=None):
            self.command = command
            self.args = list(args or [])
            self.env = env

    class ClientSession:
        def __init__(self, read, write):
            self._tools = list(FAKE_MCP_STATE["tools"])
            self._results = FAKE_MCP_STATE["results"]
            self._closed = False

        async def __aenter__(self):
            return self

        async def __aexit__(self, *a):
            self._closed = True
            return False

        async def initialize(self):
            return None

        async def list_tools(self):
            return types.SimpleNamespace(tools=self._tools)

        async def call_tool(self, name, arguments):
            FAKE_MCP_STATE["call_history"].append((name, arguments))
            if name in self._results:
                return self._results[name]
            return FakeCallToolResult([{"type": "text", "text": "default-ok"}])

    class StdioClient:
        def __init__(self, params):
            self.params = params

        async def __aenter__(self):
            return (object(), object())

        async def __aexit__(self, *a):
            return False

    mcp_mod.StdioServerParameters = StdioServerParameters
    mcp_mod.ClientSession = ClientSession
    mcp_stdlib.stdio_client = StdioClient
    mcp_client.stdio = mcp_stdlib
    mcp_mod.client = mcp_client
    monkeypatch.setitem(sys.modules, "mcp", mcp_mod)
    monkeypatch.setitem(sys.modules, "mcp.client", mcp_client)
    monkeypatch.setitem(sys.modules, "mcp.client.stdio", mcp_stdlib)
    return mcp_mod


@pytest.fixture
def fresh_mcp(tmp_path, monkeypatch):
    """隔离管理器 + 工具注册表快照；卸载后恢复。"""
    saved_tools = dict(tools_mod._tools)
    FAKE_MCP_STATE.update({"tools": [], "results": {}, "call_history": []})
    manager = MCPManager(config_path=str(tmp_path / "mcp.json"))
    yield manager, tmp_path
    tools_mod._tools.clear()
    tools_mod._tools.update(saved_tools)


def _run(coro):
    return asyncio.run(coro)


# ============================================================
# 配置管理 + 持久化
# ============================================================

class TestMCPConfig:
    def test_add_and_list_server(self, fresh_mcp):
        manager, tmp_path = fresh_mcp
        r = manager.add_server("files", "python", args=["-m", "mcp.server.filesystem"],
                               env={"MC_MCP": "1"})
        assert r["status"] == "ok"
        assert r["command"] == "python"
        servers = manager.list_servers()
        assert servers[0]["name"] == "files"
        assert servers[0]["args"] == ["-m", "mcp.server.filesystem"]
        assert servers[0]["status"] == "stopped"

    def test_add_server_invalid_name(self, fresh_mcp):
        manager, _ = fresh_mcp
        assert manager.add_server("bad:name", "python")["status"] == "error"
        assert manager.add_server("bad/name", "python")["status"] == "error"
        assert manager.add_server("", "python")["status"] == "error"
        assert manager.add_server("ok", "")["status"] == "error"

    def test_config_persists_across_reload(self, fresh_mcp):
        manager, tmp_path = fresh_mcp
        manager.add_server("files", "python", args=["-m", "x"])
        assert (tmp_path / "mcp.json").exists()
        # 新管理器重载同一配置文件 → 恢复 server
        m2 = MCPManager(config_path=str(tmp_path / "mcp.json"))
        assert m2.get_server("files") is not None
        assert m2.get_server("files")["command"] == "python"

    def test_remove_server(self, fresh_mcp):
        manager, _ = fresh_mcp
        manager.add_server("files", "python")
        assert manager.remove_server("files")["status"] == "ok"
        assert manager.get_server("files") is None
        assert manager.remove_server("nope")["status"] == "error"


# ============================================================
# 生命周期 / 工具发现注册 / 命名空间
# ============================================================

class TestMCPLifecycle:
    def test_start_server_registers_namespaced_tools(self, fresh_mcp, monkeypatch):
        _install_fake_mcp(monkeypatch)
        manager, _ = fresh_mcp
        manager.add_server("fs", "python")
        FAKE_MCP_STATE["tools"] = [
            FakeTool("read_file", "读取文件", {"type": "object", "properties": {"path": {"type": "string"}},
                                              "required": ["path"]}),
            FakeTool("write_file", "写文件"),
        ]
        r = _run(manager.start_server("fs"))
        assert r["status"] == "ok"
        assert r["server"]["status"] == "running"
        assert r["server"]["tool_count"] == 2
        names = {d["function"]["name"] for d in tools_mod.get_tool_definitions()}
        # 命名空间前缀 mcp:<server>:<tool> 防冲突
        assert f"mcp:fs:read_file" in names
        assert f"mcp:fs:write_file" in names
        # 双引擎共享：注入注册表后 execute_tool 透传
        result = _run(tools_mod.execute_tool("mcp:fs:read_file", {"path": "/tmp/a"}))
        assert result["success"] is True
        assert result["result"] == "default-ok"
        assert FAKE_MCP_STATE["call_history"][-1] == ("read_file", {"path": "/tmp/a"})

    def test_parameter_validation_on_mcp_tool(self, fresh_mcp, monkeypatch):
        _install_fake_mcp(monkeypatch)
        manager, _ = fresh_mcp
        manager.add_server("fs", "python")
        FAKE_MCP_STATE["tools"] = [
            FakeTool("read_file", "读取", {"type": "object",
                                          "properties": {"path": {"type": "string"}}, "required": ["path"]}),
        ]
        _run(manager.start_server("fs"))
        # 缺必需参数 → 可读中文错误（_validate_tool_args 生效）
        result = _run(tools_mod.execute_tool("mcp:fs:read_file", {}))
        assert result["success"] is False
        assert "path" in result["error"]

    def test_call_tool_wraps_error_result(self, fresh_mcp, monkeypatch):
        _install_fake_mcp(monkeypatch)
        manager, _ = fresh_mcp
        manager.add_server("fs", "python")
        FAKE_MCP_STATE["tools"] = [FakeTool("bad", "坏工具")]
        FAKE_MCP_STATE["results"] = {
            "bad": FakeCallToolResult([{"type": "text", "text": "权限不足"}], is_error=True),
        }
        _run(manager.start_server("fs"))
        result = _run(tools_mod.execute_tool("mcp:fs:bad", {}))
        assert result["success"] is False
        assert "权限不足" in result["error"]

    def test_call_tool_when_server_not_running(self, fresh_mcp):
        manager, _ = fresh_mcp
        manager.add_server("fs", "python")
        # 未启动 → 可读错误
        result = _run(tools_mod.execute_tool("mcp:fs:read_file", {}))
        assert result["success"] is False
        assert "未知工具" in result["error"]  # 未注册

    def test_stop_server_unregisters_tools(self, fresh_mcp, monkeypatch):
        _install_fake_mcp(monkeypatch)
        manager, _ = fresh_mcp
        manager.add_server("fs", "python")
        FAKE_MCP_STATE["tools"] = [FakeTool("read_file", "读取")]
        _run(manager.start_server("fs"))
        assert "mcp:fs:read_file" in {d["function"]["name"] for d in tools_mod.get_tool_definitions()}
        r = _run(manager.stop_server("fs"))
        assert r["status"] == "ok"
        names = {d["function"]["name"] for d in tools_mod.get_tool_definitions()}
        assert "mcp:fs:read_file" not in names
        assert manager.server_status("fs")["status"] == "stopped"

    def test_mcp_sdk_not_installed_returns_readable_error(self, fresh_mcp, monkeypatch):
        # mcp SDK 未安装（惰性导入抛 ImportError）→ 可读错误，不阻断 AI Hub
        import ai_hub.mcp.manager as mgr
        monkeypatch.setattr(mgr, "_import_mcp_sdk", lambda: (_ for _ in ()).throw(ImportError("no mcp")))
        manager, _ = fresh_mcp
        manager.add_server("fs", "python")
        r = _run(manager.start_server("fs"))
        assert r["status"] == "error"
        assert "MCP SDK 未安装" in r["error"]

    def test_start_unknown_server_error(self, fresh_mcp):
        manager, _ = fresh_mcp
        r = _run(manager.start_server("nope"))
        assert r["status"] == "error"
        assert "不存在" in r["error"]

    def test_get_tools_and_status(self, fresh_mcp, monkeypatch):
        _install_fake_mcp(monkeypatch)
        manager, _ = fresh_mcp
        manager.add_server("fs", "python")
        FAKE_MCP_STATE["tools"] = [FakeTool("read_file", "读取")]
        _run(manager.start_server("fs"))
        tools = manager.get_tools("fs")
        assert tools[0]["name"] == "read_file"
        assert tools[0]["server"] == "fs"
        assert manager.server_status("fs")["tool_count"] == 1
        assert manager.get_tools()  # 全部


# ============================================================
# 双引擎共享 / 注册表透传
# ============================================================

class TestMCPSharesWithEngines:
    def test_mcp_tools_exposed_via_provider_mixin(self, fresh_mcp, monkeypatch):
        """自有引擎的 _MCToolsMixin.list_tools 透传 tools 注册表 → MCP 工具可见。"""
        _install_fake_mcp(monkeypatch)
        manager, _ = fresh_mcp
        manager.add_server("fs", "python")
        FAKE_MCP_STATE["tools"] = [FakeTool("read_file", "读取")]
        _run(manager.start_server("fs"))
        from ai_hub.agent.provider import get_own_provider
        names = {d["function"]["name"] for d in get_own_provider().list_tools()}
        assert "mcp:fs:read_file" in names


# ============================================================
# HTTP 端点（chat.py /api/chat/mcp/*）
# ============================================================

class TestMCPEndpoints:
    def test_endpoints_list_add_remove(self, tmp_path, monkeypatch):
        from fastapi import FastAPI
        from fastapi.testclient import TestClient
        from ai_hub.api.chat import router as chat_router
        from ai_hub.config import settings
        import ai_hub.mcp.manager as mgr

        saved_ws = settings.workspace_dir
        saved_manager = mgr._manager
        settings.workspace_dir = str(tmp_path)
        mgr._manager = None
        try:
            app = FastAPI()
            app.include_router(chat_router)
            with TestClient(app) as client:
                r = client.get("/api/chat/mcp/servers")
                assert r.status_code == 200
                assert r.json()["servers"] == []
                r = client.post("/api/chat/mcp/servers",
                                json={"name": "fs", "command": "python", "args": ["-m", "x"]})
                assert r.json()["status"] == "ok"
                r = client.get("/api/chat/mcp/servers")
                assert len(r.json()["servers"]) == 1
                assert r.json()["servers"][0]["name"] == "fs"
                r = client.get("/api/chat/mcp/servers/fs/tools")
                assert r.json()["server"] == "fs"
                r = client.delete("/api/chat/mcp/servers/fs")
                assert r.json()["status"] == "ok"
                r = client.get("/api/chat/mcp/servers")
                assert r.json()["servers"] == []
        finally:
            settings.workspace_dir = saved_ws
            mgr._manager = saved_manager


# ============================================================
# unregister_tool（tools 注册表）
# ============================================================

def test_unregister_tool_direct(fresh_mcp):
    from ai_hub.agent.tools import register_tool, unregister_tool, get_tool_definitions

    async def handler(args):
        return "ok"

    register_tool("mcp:test:tmp", "临时工具", {"type": "object", "properties": {}, "required": []}, handler)
    assert "mcp:test:tmp" in {d["function"]["name"] for d in get_tool_definitions()}
    assert unregister_tool("mcp:test:tmp") is True
    assert "mcp:test:tmp" not in {d["function"]["name"] for d in get_tool_definitions()}
    assert unregister_tool("mcp:test:tmp") is False
