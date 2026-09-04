"""5.0.5-505-b：知识库可被 AI 工具调用——list_knowledge/search_knowledge/add_knowledge

覆盖：
- 三个工具已注册、权限正确（只读 auto / 沉淀 notify）
- list_knowledge：返回条目元信息清单
- search_knowledge：按关键词召回含内容命中
- add_knowledge：新增条目并落盘
- 缺必填参数返回可读中文错误
"""
import asyncio
import json
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))))

from ai_hub.agent.tools import init_tools, execute_tool, get_tool_definitions
from ai_hub.agent.schemas import get_tool_permission, ToolPermission

KNOWLEDGE_TOOLS = ["list_knowledge", "search_knowledge", "add_knowledge"]


def setup_module():
    init_tools()


def _run(coro):
    return asyncio.run(coro)


def _isolate_knowledge(tmp_path, monkeypatch):
    import ai_hub.knowledge.engine as kb_engine
    from ai_hub.knowledge.engine import get_knowledge_engine
    monkeypatch.setattr(kb_engine, "KNOWLEDGE_DIR", tmp_path)
    kb_engine._engine = None
    get_knowledge_engine().load_all()
    return kb_engine


def test_knowledge_tools_registered():
    defs = get_tool_definitions()
    names = {d["function"]["name"] for d in defs}
    for name in KNOWLEDGE_TOOLS:
        assert name in names, f"缺少知识库工具: {name}"


def test_knowledge_tools_permissions():
    assert get_tool_permission("list_knowledge") == ToolPermission.AUTO
    assert get_tool_permission("search_knowledge") == ToolPermission.AUTO
    assert get_tool_permission("add_knowledge") == ToolPermission.NOTIFY


def test_add_knowledge_tool(tmp_path, monkeypatch):
    _isolate_knowledge(tmp_path, monkeypatch)
    result = _run(execute_tool("add_knowledge", {
        "title": "RoCE 规划", "content": "PFC 与 ECN 无损",
        "category": "网络", "tags": ["roce"], "project": "p1",
    }))
    assert result["success"] is True
    payload = json.loads(result["result"])
    assert payload["status"] == "ok"
    assert payload["entry"]["title"] == "RoCE 规划"
    assert (tmp_path / "roce-规划.md").exists()


def test_list_knowledge_tool(tmp_path, monkeypatch):
    _isolate_knowledge(tmp_path, monkeypatch)
    _run(execute_tool("add_knowledge", {"title": "条目A", "content": "a", "category": "网络"}))
    _run(execute_tool("add_knowledge", {"title": "条目B", "content": "b", "category": "存储"}))
    result = _run(execute_tool("list_knowledge", {}))
    assert result["success"] is True
    payload = json.loads(result["result"])
    assert payload["total"] == 2
    assert {e["title"] for e in payload["entries"]} == {"条目A", "条目B"}
    # 分类过滤
    result2 = _run(execute_tool("list_knowledge", {"category": "网络"}))
    payload2 = json.loads(result2["result"])
    assert payload2["total"] == 1
    assert payload2["entries"][0]["title"] == "条目A"


def test_search_knowledge_tool(tmp_path, monkeypatch):
    _isolate_knowledge(tmp_path, monkeypatch)
    _run(execute_tool("add_knowledge", {"title": "VLAN 规划", "content": "VLAN 100 业务网"}))
    result = _run(execute_tool("search_knowledge", {"query": "VLAN"}))
    assert result["success"] is True
    payload = json.loads(result["result"])
    assert payload["total"] >= 1
    assert any(h["title"] == "VLAN 规划" for h in payload["hits"])
    assert "content" in payload["hits"][0]


def test_knowledge_tool_missing_required_readable_error():
    result = _run(execute_tool("add_knowledge", {}))
    assert result["success"] is False
    assert "title" in result["error"]

    result2 = _run(execute_tool("search_knowledge", {}))
    assert result2["success"] is False
    assert "query" in result2["error"]
