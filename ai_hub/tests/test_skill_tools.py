"""4.3 F3-3（测试计划 A-4）：技能可被 AI 工具调用——list_skills/get_skill/enable_skill/disable_skill/update_skill

覆盖：
- 技能工具已注册、权限正确（只读 auto / 写入 notify）
- list_skills：返回技能清单
- get_skill：返回技能详情
- enable_skill / disable_skill：启用/禁用
- update_skill：更新技能内容
- 缺必填参数返回可读中文错误
"""
import asyncio
import json
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))))

from ai_hub.agent.tools import init_tools, execute_tool, get_tool_definitions
from ai_hub.agent.schemas import get_tool_permission, ToolPermission

SKILL_TOOLS = ["list_skills", "get_skill", "enable_skill", "disable_skill", "update_skill"]


def setup_module():
    init_tools()


def _run(coro):
    return asyncio.run(coro)


def _populate_skills(tmp_path):
    """在 tmp_path 下放置两个技能文件并让 SkillsEngine 使用该目录"""
    from ai_hub.skills import engine as skills_engine
    from ai_hub.skills.engine import SkillsEngine

    (tmp_path / "alpha.md").write_text("技能A内容", encoding="utf-8")
    (tmp_path / "beta.md").write_text("技能B内容", encoding="utf-8")
    orig_dir = skills_engine.SKILLS_DIR
    skills_engine.SKILLS_DIR = tmp_path
    return orig_dir


def test_skill_tools_registered():
    defs = get_tool_definitions()
    names = {d["function"]["name"] for d in defs}
    for name in SKILL_TOOLS:
        assert name in names, f"缺少技能工具: {name}"


def test_skill_tools_permissions():
    assert get_tool_permission("list_skills") == ToolPermission.AUTO
    assert get_tool_permission("get_skill") == ToolPermission.AUTO
    assert get_tool_permission("enable_skill") == ToolPermission.NOTIFY
    assert get_tool_permission("disable_skill") == ToolPermission.NOTIFY
    assert get_tool_permission("update_skill") == ToolPermission.NOTIFY


def test_list_skills_tool(tmp_path, monkeypatch):
    from ai_hub.skills.engine import get_skills_engine
    orig_dir = _populate_skills(tmp_path)
    monkeypatch.setattr("ai_hub.skills.engine.SKILLS_DIR", tmp_path)
    try:
        get_skills_engine().reload()
        result = _run(execute_tool("list_skills", {}))
        assert result["success"] is True
        payload = json.loads(result["result"])
        names = {s["name"] for s in payload.get("skills", [])}
        assert names == {"alpha", "beta"}
        assert payload["total"] == 2
    finally:
        get_skills_engine().reload()
        import ai_hub.skills.engine as _e
        _e.SKILLS_DIR = orig_dir


def test_get_skill_tool(tmp_path, monkeypatch):
    from ai_hub.skills.engine import get_skills_engine
    orig_dir = _populate_skills(tmp_path)
    monkeypatch.setattr("ai_hub.skills.engine.SKILLS_DIR", tmp_path)
    try:
        get_skills_engine().reload()
        result = _run(execute_tool("get_skill", {"skillName": "alpha"}))
        assert result["success"] is True
        detail = json.loads(result["result"])["skill"]
        assert detail["name"] == "alpha"
        assert detail["content"] == "技能A内容"
    finally:
        get_skills_engine().reload()
        import ai_hub.skills.engine as _e
        _e.SKILLS_DIR = orig_dir


def test_disable_enable_skill_tool(tmp_path, monkeypatch):
    from ai_hub.skills.engine import get_skills_engine
    orig_dir = _populate_skills(tmp_path)
    monkeypatch.setattr("ai_hub.skills.engine.SKILLS_DIR", tmp_path)
    try:
        get_skills_engine().reload()
        result = _run(execute_tool("disable_skill", {"skillName": "alpha"}))
        assert result["success"] is True
        assert get_skills_engine().skills["alpha"].enabled is False
        result2 = _run(execute_tool("enable_skill", {"skillName": "alpha"}))
        assert result2["success"] is True
        assert get_skills_engine().skills["alpha"].enabled is True
    finally:
        get_skills_engine().reload()
        import ai_hub.skills.engine as _e
        _e.SKILLS_DIR = orig_dir


def test_update_skill_tool(tmp_path, monkeypatch):
    from ai_hub.skills.engine import get_skills_engine
    orig_dir = _populate_skills(tmp_path)
    monkeypatch.setattr("ai_hub.skills.engine.SKILLS_DIR", tmp_path)
    try:
        get_skills_engine().reload()
        result = _run(execute_tool("update_skill", {"skillName": "alpha", "content": "新技能内容"}))
        assert result["success"] is True
        assert get_skills_engine().skills["alpha"].content == "新技能内容"
        assert (tmp_path / "alpha.md").read_text(encoding="utf-8") == "新技能内容"
    finally:
        get_skills_engine().reload()
        import ai_hub.skills.engine as _e
        _e.SKILLS_DIR = orig_dir


def test_get_skill_missing_readable_error(tmp_path, monkeypatch):
    from ai_hub.skills.engine import get_skills_engine
    orig_dir = _populate_skills(tmp_path)
    monkeypatch.setattr("ai_hub.skills.engine.SKILLS_DIR", tmp_path)
    try:
        get_skills_engine().reload()
        result = _run(execute_tool("get_skill", {"skillName": "no_such"}))
        assert result["success"] is False
        assert "不存在" in result["error"]
    finally:
        get_skills_engine().reload()
        import ai_hub.skills.engine as _e
        _e.SKILLS_DIR = orig_dir


def test_skill_tool_missing_required_readable_error():
    result = _run(execute_tool("get_skill", {}))
    assert result["success"] is False
    assert "skillName" in result["error"]
