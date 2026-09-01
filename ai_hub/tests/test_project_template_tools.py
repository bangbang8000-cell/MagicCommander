"""4.3 F3-4（测试计划 A-5）：项目/模板操作工具——AI 对话内可完成
list_projects / create_project / update_project / delete_project /
import_project / export_project / create_from_template / preview_template

覆盖维度：
- 工具注册：init_tools 后 8 个项目/模板操作工具已注册、权限正确
- 工具校验：execute_tool 缺必填参数返回可读中文错误（不抛异常）
- 错误可读：未知工具 / 项目不存在 / 参数非法均返回 {"success": False, "error": ...}
- CLI 桥接：list/create/delete/create_from_template/preview_template 正确构造 backend CLI 命令
- 文件系统：update_project 更新元数据；import/export zip 往返；zip-slip 防护
"""
import asyncio
import json
import os
import sys
from unittest.mock import AsyncMock, patch

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))))

import ai_hub.agent.tools as tools_mod
from ai_hub.agent.tools import init_tools, execute_tool, get_tool_definitions, set_workspace_dir
from ai_hub.agent.schemas import get_tool_permission, ToolPermission

# 8 个项目/模板操作工具（F3-4 清单）
PROJECT_TEMPLATE_TOOLS = [
    "list_projects", "create_project", "update_project", "delete_project",
    "import_project", "export_project", "create_from_template", "preview_template",
]


def setup_module():
    init_tools()


def _run(coro):
    return asyncio.run(coro)


def _reset_workspace(tmp_path):
    set_workspace_dir(str(tmp_path))
    return tmp_path


# ---- 工具注册 ----

def test_eight_project_template_tools_registered():
    defs = get_tool_definitions()
    names = {d["function"]["name"] for d in defs}
    for name in PROJECT_TEMPLATE_TOOLS:
        assert name in names, f"缺少工具: {name}"


def test_project_template_tools_permissions():
    # 只读/导出：auto；创建/导入/更新：notify；删除：confirm
    assert get_tool_permission("list_projects") == ToolPermission.AUTO
    assert get_tool_permission("export_project") == ToolPermission.AUTO
    assert get_tool_permission("preview_template") == ToolPermission.AUTO
    assert get_tool_permission("create_project") == ToolPermission.NOTIFY
    assert get_tool_permission("create_from_template") == ToolPermission.NOTIFY
    assert get_tool_permission("update_project") == ToolPermission.NOTIFY
    assert get_tool_permission("import_project") == ToolPermission.NOTIFY
    assert get_tool_permission("delete_project") == ToolPermission.CONFIRM


# ---- 工具校验（缺必填参数 → 可读中文错误）----

def test_execute_unknown_tool_readable_error():
    result = _run(execute_tool("no_such_tool", {}))
    assert result["success"] is False
    assert "未知工具" in result["error"]


def test_missing_required_param_readable_error():
    result = _run(execute_tool("create_project", {}))
    assert result["success"] is False
    assert "projectName" in result["error"]
    assert "缺少必需参数" in result["error"]


def test_missing_required_param_update_project():
    result = _run(execute_tool("update_project", {}))
    assert result["success"] is False
    assert "projectName" in result["error"]


def test_missing_required_param_export_project():
    result = _run(execute_tool("export_project", {}))
    assert result["success"] is False
    assert "projectName" in result["error"]


def test_enum_param_invalid_readable_error():
    result = _run(execute_tool("delete_files", {"projectName": "p", "fileType": "bad-type"}))
    assert result["success"] is False
    assert "fileType" in result["error"]
    assert "取值无效" in result["error"]


# ---- CLI 桥接（list/create/delete/create_from_template/preview_template）----

def _patch_cli(return_json: str):
    """monkeypatch _run_python_cli 记录命令并返回固定输出"""
    calls = []

    async def fake_run(args):
        calls.append(list(args))
        return return_json

    return calls, fake_run


def test_list_projects_calls_cli(tmp_path):
    _reset_workspace(tmp_path)
    calls, fake = _patch_cli(json.dumps({"status": "ok", "projects": []}))
    with patch.object(tools_mod, "_run_python_cli", new=fake):
        result = _run(execute_tool("list_projects", {}))
    assert result["success"] is True
    assert calls and calls[0][:2] == ["project", "list"]


def test_create_project_calls_cli(tmp_path):
    _reset_workspace(tmp_path)
    calls, fake = _patch_cli(json.dumps({"status": "success"}))
    with patch.object(tools_mod, "_run_python_cli", new=fake):
        result = _run(execute_tool("create_project", {"projectName": "projA"}))
    assert result["success"] is True
    assert calls and calls[0] == ["project", "create", "projA"]


def test_delete_project_calls_cli(tmp_path):
    _reset_workspace(tmp_path)
    calls, fake = _patch_cli(json.dumps({"status": "success"}))
    with patch.object(tools_mod, "_run_python_cli", new=fake):
        result = _run(execute_tool("delete_project", {"projectName": "projA"}))
    assert result["success"] is True
    assert calls and calls[0][:3] == ["project", "delete", "--force"]


def test_create_from_template_calls_cli(tmp_path):
    _reset_workspace(tmp_path)
    calls, fake = _patch_cli(json.dumps({"status": "success"}))
    with patch.object(tools_mod, "_run_python_cli", new=fake):
        result = _run(execute_tool("create_from_template", {
            "projectName": "projB", "templateName": "example1",
        }))
    assert result["success"] is True
    assert calls and calls[0] == ["project", "create", "projB", "--template", "example1"]


def test_preview_template_calls_cli(tmp_path):
    _reset_workspace(tmp_path)
    calls, fake = _patch_cli(json.dumps({"status": "ok", "results": []}))
    with patch.object(tools_mod, "_run_python_cli", new=fake):
        result = _run(execute_tool("preview_template", {
            "projectName": "projA", "templatePath": "templates/ASW.j2",
        }))
    assert result["success"] is True
    assert calls and calls[0] == ["template", "preview", "projA", "templates/ASW.j2"]


# ---- update_project（项目元数据）----

def test_update_project_description(tmp_path):
    ws = _reset_workspace(tmp_path)
    project_dir = ws / "projA"
    (project_dir / "templates").mkdir(parents=True, exist_ok=True)
    (project_dir / "template.meta.json").write_text(
        json.dumps({"name": "projA", "description": "旧描述"}, ensure_ascii=False),
        encoding="utf-8",
    )
    result = _run(execute_tool("update_project", {
        "projectName": "projA", "description": "新描述",
    }))
    assert result["success"] is True
    data = json.loads((project_dir / "template.meta.json").read_text(encoding="utf-8"))
    assert data["description"] == "新描述"


def test_update_project_missing_project_readable_error(tmp_path):
    _reset_workspace(tmp_path)
    result = _run(execute_tool("update_project", {"projectName": "not_exists"}))
    assert result["success"] is False
    assert "不存在" in result["error"]


def test_update_project_creates_meta_if_missing(tmp_path):
    ws = _reset_workspace(tmp_path)
    project_dir = ws / "projC"
    project_dir.mkdir()
    result = _run(execute_tool("update_project", {
        "projectName": "projC", "meta": {"deviceType": "switch"},
    }))
    assert result["success"] is True
    data = json.loads((project_dir / "template.meta.json").read_text(encoding="utf-8"))
    assert data["deviceType"] == "switch"


# ---- export / import（zip 往返 + zip-slip 防护）----

def test_export_project_creates_zip(tmp_path):
    ws = _reset_workspace(tmp_path)
    project_dir = ws / "projD"
    (project_dir / "templates").mkdir(parents=True)
    (project_dir / "templates" / "ASW.j2").write_text("{# tpl #}", encoding="utf-8")
    result = _run(execute_tool("export_project", {"projectName": "projD"}))
    assert result["success"] is True
    payload = json.loads(result["result"])
    assert payload["status"] == "ok"
    assert payload["projectName"] == "projD"
    zip_path = payload["zipPath"]
    assert os.path.exists(zip_path)
    assert zip_path.endswith(".zip")


def test_export_project_missing_readable_error(tmp_path):
    _reset_workspace(tmp_path)
    result = _run(execute_tool("export_project", {"projectName": "not_exists"}))
    assert result["success"] is False
    assert "不存在" in result["error"]


def test_import_export_roundtrip(tmp_path):
    ws = _reset_workspace(tmp_path)
    project_dir = ws / "projD"
    (project_dir / "templates").mkdir(parents=True)
    (project_dir / "templates" / "ASW.j2").write_text("CONTENT_42", encoding="utf-8")
    export_res = _run(execute_tool("export_project", {"projectName": "projD"}))
    payload = json.loads(export_res["result"])
    zip_path = payload["zipPath"]

    result = _run(execute_tool("import_project", {
        "projectName": "projE", "zipPath": zip_path,
    }))
    assert result["success"] is True
    imported = json.loads(result["result"])
    assert imported["status"] == "ok"
    assert imported["projectName"] == "projE"
    assert (ws / "projE" / "templates" / "ASW.j2").exists()
    assert (ws / "projE" / "templates" / "ASW.j2").read_text(encoding="utf-8") == "CONTENT_42"


def test_import_project_rejects_zip_slip(tmp_path):
    ws = _reset_workspace(tmp_path)
    from zipfile import ZipFile, ZIP_DEFLATED
    evil_zip = ws / "evil.zip"
    with ZipFile(evil_zip, "w", ZIP_DEFLATED) as zf:
        zf.writestr("../../escape.txt", "PWNED")
    result = _run(execute_tool("import_project", {
        "projectName": "safe", "zipPath": str(evil_zip),
    }))
    assert result["success"] is False
    assert "路径" in result["error"] or "非法" in result["error"]
    assert not (ws.parent / "escape.txt").exists()


def test_import_project_missing_zip_readable_error(tmp_path):
    _reset_workspace(tmp_path)
    result = _run(execute_tool("import_project", {
        "projectName": "projF", "zipPath": str(tmp_path / "no_such.zip"),
    }))
    assert result["success"] is False
    assert "zipPath" in result["error"] or "不存在" in result["error"]


# ---- 错误可读性：handler 异常转可读错误 ----

def test_handler_exception_readable(tmp_path):
    _reset_workspace(tmp_path)
    original = tools_mod._tools["list_projects"]["handler"]
    try:
        tools_mod._tools["list_projects"]["handler"] = AsyncMock(side_effect=RuntimeError("boom"))
        result = _run(execute_tool("list_projects", {}))
    finally:
        tools_mod._tools["list_projects"]["handler"] = original
    assert result["success"] is False
    assert "boom" in result["error"]
