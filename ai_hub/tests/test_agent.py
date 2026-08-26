"""AI Hub Agent 最小测试集：工具权限、名称/参数规范化、校验器"""
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))))

from ai_hub.agent.schemas import (
    ToolPermission,
    get_tool_permission,
    resolve_tool_name,
    normalize_params,
)
from ai_hub.agent.validator import validate_tool_call


# --- schemas ---

def test_permission_levels():
    assert get_tool_permission("list_projects") == ToolPermission.AUTO
    assert get_tool_permission("create_project") == ToolPermission.NOTIFY
    assert get_tool_permission("delete_project") == ToolPermission.CONFIRM


# --- M6-b: 模板 CRUD 工具权限 ---

def test_m6_template_permissions():
    assert get_tool_permission("template_list") == ToolPermission.AUTO
    assert get_tool_permission("create_template") == ToolPermission.NOTIFY
    assert get_tool_permission("update_template") == ToolPermission.NOTIFY
    assert get_tool_permission("template_delete") == ToolPermission.CONFIRM


def test_unknown_tool_defaults_to_confirm():
    assert get_tool_permission("unknown_tool_xyz") == ToolPermission.CONFIRM


def test_resolve_tool_name_alias():
    name, msg = resolve_tool_name("render")
    assert name == "render_config"
    assert msg is not None


def test_resolve_unknown_tool_unchanged():
    name, msg = resolve_tool_name("no_such_tool")
    assert name == "no_such_tool"
    assert msg is None


def test_normalize_params_alias():
    args = normalize_params({"name": "test1", "file_path": "a/b.j2"})
    assert args["projectName"] == "test1"
    assert args["filePath"] == "a/b.j2"
    assert "name" not in args


# --- validator ---

def test_validate_tool_call_name_alias():
    result = validate_tool_call("render", {"ids": "1"}, available_tools={"render_config"})
    assert result.name == "render_config"
    assert result.permission == ToolPermission.CONFIRM
    assert result.has_corrections


def test_validate_tool_call_param_normalization():
    result = validate_tool_call("read_file", {"name": "test1", "file_path": "t/a.j2"}, available_tools={"read_file"})
    assert result.args["projectName"] == "test1"
    assert result.args["filePath"] == "t/a.j2"


def test_validate_tool_call_auto_project_fill():
    result = validate_tool_call(
        "render_config", {"ids": "1"}, available_tools={"render_config"}, current_project="projA"
    )
    assert result.args.get("projectName") == "projA"
    assert any("自动补充项目名" in c for c in result.corrections)


def test_validate_tool_call_permission():
    assert validate_tool_call("delete_project", {}, available_tools={"delete_project"}).permission == ToolPermission.CONFIRM
    assert validate_tool_call("list_projects", {}, available_tools={"list_projects"}).permission == ToolPermission.AUTO


def test_validate_tool_call_normalizes_name_only_when_missing():
    # 工具名已在可用集合中时不做别名改写
    result = validate_tool_call("diff_compare", {}, available_tools={"diff_compare"})
    assert result.name == "diff_compare"
    assert not result.has_corrections
