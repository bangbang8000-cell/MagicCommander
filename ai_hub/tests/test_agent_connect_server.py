"""5.1.1-511-a：Agent Connect MCP Server 框架测试。

覆盖：
- AgentConnectManager 状态机（disabled/enabled/starting/running/error）
- 编译态/源码态能力域划分与权限映射（511-b/511-d）
- MCP 工具元数据标准化（name/description/inputSchema）
- 开关两态（enableAgentConnect 关=不暴露/开=暴露，agentMode 切换）
- 惰性导入 mcp SDK（未安装不阻断）
"""
import asyncio
import sys
from pathlib import Path

import pytest

sys.path.insert(0, str(Path(__file__).resolve().parents[2]))
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from ai_hub.agent.tools import register_tool, unregister_tool  # noqa: E402


@pytest.fixture(autouse=True)
def _clean_state():
    """每用例前重置 Agent Connect 管理器并清理动态工具，隔离全局状态。"""
    from ai_hub.agent import tools
    from ai_hub.mcp_server.manager import reset_manager

    reset_manager()
    for name in list(tools._tools.keys()):
        if name.startswith("ac:"):
            tools._tools.pop(name, None)
    yield
    for name in list(tools._tools.keys()):
        if name.startswith("ac:"):
            tools._tools.pop(name, None)


@pytest.fixture
def sample_tools():
    """注入若干示例工具（不同能力域与权限档位）供过滤测试。"""
    from ai_hub.agent.schemas import ToolPermission

    async def _h(args):  # noqa: ANN001
        return {"ok": True}

    register_tool("list_projects", "列出所有项目", {"type": "object", "properties": {}, "required": []}, _h)
    register_tool("render_config", "渲染配置", {"type": "object", "properties": {"projectName": {"type": "string"}}, "required": ["projectName"]}, _h, permission=ToolPermission.CONFIRM)
    register_tool("delete_project", "删除项目", {"type": "object", "properties": {"projectName": {"type": "string"}}, "required": ["projectName"]}, _h, permission=ToolPermission.CONFIRM)
    yield


def test_capability_domains_defined():
    """能力域元数据齐备：名称/说明/编译态是否暴露/默认权限。"""
    from ai_hub.mcp_server.capabilities import CAPABILITY_DOMAINS

    assert "project" in CAPABILITY_DOMAINS
    assert "template" in CAPABILITY_DOMAINS
    assert "device" in CAPABILITY_DOMAINS
    assert "render" in CAPABILITY_DOMAINS
    assert "export" in CAPABILITY_DOMAINS
    assert "validate" in CAPABILITY_DOMAINS
    for domain, meta in CAPABILITY_DOMAINS.items():
        assert meta["name"]
        assert meta["description"]
        assert "compiled_visible" in meta
        assert meta["default_permission"] in ("auto", "notify", "confirm")


def test_compiled_mode_filters_tools(sample_tools):
    """编译态：删除/系统类工具不暴露，只读/渲染/校验暴露。"""
    from ai_hub.agent.tools import get_tool_definitions
    from ai_hub.mcp_server.capabilities import filter_tools_for_mode

    tools = filter_tools_for_mode("compiled", get_tool_definitions())
    names = {t["name"] for t in tools}
    assert "list_projects" in names
    assert "render_config" in names
    # 编译态不允许删除类工具
    assert "delete_project" not in names


def test_source_mode_includes_cli_and_fs():
    """源码态：追加 CLI 透传与文件系统（读源码）工具。"""
    from ai_hub.mcp_server.capabilities import SOURCE_ONLY_TOOLS

    assert {"run_cli", "read_file", "list_dir"}.issubset(set(SOURCE_ONLY_TOOLS))


def test_permission_mapping():
    """权限档位映射：auto/notify/confirm → MCP 工具标注。"""
    from ai_hub.mcp_server.capabilities import mcp_permission_meta

    assert mcp_permission_meta("auto")["require_approval"] is False
    assert mcp_permission_meta("notify")["require_approval"] is True
    assert mcp_permission_meta("confirm")["require_approval"] is True
    assert mcp_permission_meta("confirm")["approval_level"] == "confirm"


def test_manager_disabled_by_default():
    """默认（开关关）状态为 disabled，不启动 FastMCP。"""
    from ai_hub.mcp_server.manager import AgentConnectManager, reset_manager

    reset_manager()
    mgr = AgentConnectManager()
    assert mgr.status == "disabled"
    assert mgr.mcp is None


def test_manager_enable_starts_fastmcp(monkeypatch):
    """开启后创建 FastMCP 实例并注册工具。"""
    from ai_hub.mcp_server.manager import AgentConnectManager, reset_manager

    reset_manager()
    mgr = AgentConnectManager()
    mgr.enable(agent_mode="compiled")
    assert mgr.status == "enabled"
    assert mgr.agent_mode == "compiled"
    assert mgr.mcp is not None


def test_manager_disable_cleans_up():
    """关闭后回到 disabled 并释放 mcp 实例。"""
    from ai_hub.mcp_server.manager import AgentConnectManager, reset_manager

    reset_manager()
    mgr = AgentConnectManager()
    mgr.enable(agent_mode="source")
    mgr.disable()
    assert mgr.status == "disabled"
    assert mgr.mcp is None


def test_manager_switch_mode():
    """agentMode 切换：compiled → source 保持 enabled。"""
    from ai_hub.mcp_server.manager import AgentConnectManager, reset_manager

    reset_manager()
    mgr = AgentConnectManager()
    mgr.enable(agent_mode="compiled")
    mgr.set_agent_mode("source")
    assert mgr.agent_mode == "source"
    assert mgr.status == "enabled"


def test_manager_invalid_mode_clamped():
    """非法 agentMode 回退 compiled。"""
    from ai_hub.mcp_server.manager import AgentConnectManager, reset_manager

    reset_manager()
    mgr = AgentConnectManager()
    mgr.enable(agent_mode="bogus")
    assert mgr.agent_mode == "compiled"


def test_lazy_import_mcp_sdk(monkeypatch):
    """惰性导入：mcp SDK 未安装时 enable 返回可读错误且不抛异常。"""
    import builtins

    from ai_hub.mcp_server import manager as server_manager

    real_import = builtins.__import__

    def fake_import(name, *args, **kwargs):
        if name.startswith("mcp"):
            raise ImportError("No module named 'mcp'")
        return real_import(name, *args, **kwargs)

    monkeypatch.setattr(builtins, "__import__", fake_import)
    server_manager.reset_manager()
    mgr = server_manager.AgentConnectManager()
    ok, err = mgr.enable(agent_mode="compiled")
    assert ok is False
    assert "mcp" in err.lower() or "MCP" in err


def test_status_report_shape():
    """状态报告包含开关/模式/工具数/审计入口。"""
    from ai_hub.mcp_server.manager import AgentConnectManager, reset_manager

    reset_manager()
    mgr = AgentConnectManager()
    status = mgr.status_report()
    assert "status" in status
    assert "enabled" in status
    assert "agent_mode" in status
    assert "tool_count" in status


def test_audit_log_entry(tmp_path):
    """审计：Agent 操作写入审计文件。"""
    from ai_hub.mcp_server.manager import AgentConnectManager, reset_manager

    reset_manager()
    mgr = AgentConnectManager()
    mgr.set_audit_path(tmp_path / "audit.jsonl")
    mgr.record_audit("external-agent", "list_projects", {"projectName": "p1"}, "ok")
    lines = (tmp_path / "audit.jsonl").read_text(encoding="utf-8").strip().splitlines()
    assert len(lines) == 1
    entry = __import__("json").loads(lines[0])
    assert entry["agent"] == "external-agent"
    assert entry["tool"] == "list_projects"
    assert entry["result"] == "ok"


# ===== 511-c：双开关配置 =====

def test_agent_connect_config_defaults(tmp_path, monkeypatch):
    """默认：开关关、模式 compiled。"""
    from ai_hub import config as ai_config

    monkeypatch.setattr(ai_config, "get_secrets_path", lambda: tmp_path / ".mc_ai_secrets.json")
    assert ai_config.get_enable_agent_connect() is False
    assert ai_config.get_agent_mode() == "compiled"


def test_agent_connect_config_set_persist(tmp_path, monkeypatch):
    """设置开关/模式后持久化到 secrets，重读生效。"""
    from ai_hub import config as ai_config

    monkeypatch.setattr(ai_config, "get_secrets_path", lambda: tmp_path / ".mc_ai_secrets.json")
    assert ai_config.set_enable_agent_connect(True) is True
    assert ai_config.set_agent_mode("source") == "source"
    assert ai_config.get_enable_agent_connect() is True
    assert ai_config.get_agent_mode() == "source"


def test_agent_connect_mode_clamp():
    """非法模式回退 compiled。"""
    from ai_hub import config as ai_config

    assert ai_config.clamp_agent_mode("bogus") == "compiled"
    assert ai_config.clamp_agent_mode("source") == "source"
    assert ai_config.clamp_agent_mode(None) == "compiled"


def test_agent_connect_keys_not_provider_configs(tmp_path, monkeypatch):
    """开关/模式键不被当作 provider 配置。"""
    from ai_hub import config as ai_config

    monkeypatch.setattr(ai_config, "get_secrets_path", lambda: tmp_path / ".mc_ai_secrets.json")
    ai_config.save_secrets({"enable_agent_connect": True, "agent_mode": "source", "deepseek": {"api_key": "x"}})
    ai_config.apply_secrets()
    assert ai_config.settings.provider_configs.get("enable_agent_connect") is None
    assert ai_config.settings.provider_configs.get("agent_mode") is None
    assert ai_config.settings.provider_configs.get("deepseek") == {"api_key": "x"}


# ===== HTTP 端点 =====

def _make_client():
    from fastapi.testclient import TestClient
    from ai_hub.api.chat import router
    from fastapi import FastAPI

    app = FastAPI()
    app.include_router(router)
    return TestClient(app)


def test_agent_connect_status_endpoint(tmp_path, monkeypatch):
    """GET /agent-connect/status：默认关、compiled。"""
    from ai_hub import config as ai_config
    from ai_hub.mcp_server import manager as mgr_mod

    monkeypatch.setattr(ai_config, "get_secrets_path", lambda: tmp_path / ".mc_ai_secrets.json")
    mgr_mod.reset_manager()
    client = _make_client()
    r = client.get("/api/chat/agent-connect/status")
    assert r.status_code == 200
    data = r.json()["data"]
    assert data["enabled"] is False
    assert data["agent_mode"] == "compiled"


def test_agent_connect_config_endpoint_enable(tmp_path, monkeypatch):
    """POST /agent-connect/config 开启后状态 enabled。"""
    from ai_hub import config as ai_config
    from ai_hub.mcp_server import manager as mgr_mod

    monkeypatch.setattr(ai_config, "get_secrets_path", lambda: tmp_path / ".mc_ai_secrets.json")
    mgr_mod.reset_manager()
    client = _make_client()
    r = client.post("/api/chat/agent-connect/config", json={"enable": True, "agent_mode": "source"})
    assert r.status_code == 200
    data = r.json()["data"]
    assert data["enabled"] is True
    assert data["agent_mode"] == "source"
    assert data["status"] == "enabled"
    # 持久化生效
    assert ai_config.get_enable_agent_connect() is True
    assert ai_config.get_agent_mode() == "source"


def test_agent_connect_config_endpoint_disable(tmp_path, monkeypatch):
    """POST 关闭后状态 disabled。"""
    from ai_hub import config as ai_config
    from ai_hub.mcp_server import manager as mgr_mod

    monkeypatch.setattr(ai_config, "get_secrets_path", lambda: tmp_path / ".mc_ai_secrets.json")
    mgr_mod.reset_manager()
    client = _make_client()
    client.post("/api/chat/agent-connect/config", json={"enable": True})
    r = client.post("/api/chat/agent-connect/config", json={"enable": False})
    assert r.status_code == 200
    data = r.json()["data"]
    assert data["enabled"] is False
    assert data["status"] == "disabled"
