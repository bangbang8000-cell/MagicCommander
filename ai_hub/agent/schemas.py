"""Agent v2 工具 Schema：权限分级 + 工具名别名 + 参数别名"""
from enum import Enum

class ToolPermission(Enum):
    AUTO = "auto"       # 🟢 自动执行
    NOTIFY = "notify"   # 🟡 自动 + 通知
    CONFIRM = "confirm" # 🔴 需确认

TOOL_PERMISSIONS: dict[str, ToolPermission] = {
    "list_projects": ToolPermission.AUTO,
    "read_file": ToolPermission.AUTO, "read_excel": ToolPermission.AUTO,
    "search_files": ToolPermission.AUTO, "recommend_template": ToolPermission.AUTO,
    "analyze_project": ToolPermission.AUTO, "get_project_info": ToolPermission.AUTO,
    "list_project_files": ToolPermission.AUTO, "validate_template": ToolPermission.AUTO,
    "validate_excel": ToolPermission.AUTO, "dry_run": ToolPermission.AUTO,
    "diff_compare": ToolPermission.AUTO,
    "create_project": ToolPermission.NOTIFY, "create_project_intelligent": ToolPermission.NOTIFY,
    "write_text_file": ToolPermission.NOTIFY, "write_excel": ToolPermission.NOTIFY,
    "update_template": ToolPermission.NOTIFY, "create_template": ToolPermission.NOTIFY,
    "generate_labels": ToolPermission.NOTIFY, "generate_label_md": ToolPermission.NOTIFY,
    "undo_render": ToolPermission.NOTIFY,
    "delete_project": ToolPermission.CONFIRM, "delete_files": ToolPermission.CONFIRM,
    "delete_labels": ToolPermission.CONFIRM, "render_config": ToolPermission.CONFIRM,
    "render_yaml": ToolPermission.CONFIRM, "reverse_engineer_config": ToolPermission.CONFIRM,
}

TOOL_NAME_ALIASES: dict[str, str] = {
    "create_project": "create_project_intelligent",
    "render": "render_config", "list_templates": "recommend_template",
    "show_templates": "recommend_template", "get_templates": "recommend_template",
    "read_template": "read_file", "write_file": "write_text_file",
    "create_file": "write_text_file", "generate_label": "generate_labels",
    "analyze": "analyze_project", "get_project": "get_project_info",
    "diff": "diff_compare", "reverse": "reverse_engineer_config",
    "reverse_engineer": "reverse_engineer_config",
}

PARAM_ALIASES: dict[str, str] = {
    "project": "projectName", "name": "projectName", "project_name": "projectName",
    "template": "templateName", "template_name": "templateName",
    "config_text": "configText", "config": "configText",
    "device_type": "deviceType", "device": "deviceType",
    "source_project": "sourceProject", "source": "sourceProject",
    "target_project": "targetProject", "target": "targetProject",
    "file_path": "filePath", "path": "filePath",
    "file_name": "fileName", "filename": "fileName",
    "excel_name": "excelName", "sheet_name": "sheetName",
    "config_description": "configDescription", "description": "configDescription",
    "query": "query", "data": "data", "vendor": "vendor",
}

def get_tool_permission(tool_name: str) -> ToolPermission:
    return TOOL_PERMISSIONS.get(tool_name, ToolPermission.CONFIRM)

def resolve_tool_name(name: str) -> tuple[str, str | None]:
    name_lower = name.lower().strip()
    if name_lower in TOOL_NAME_ALIASES:
        resolved = TOOL_NAME_ALIASES[name_lower]
        return resolved, f"工具 '{name}' 已自动修正为 '{resolved}'"
    return name, None

def normalize_params(args: dict) -> dict:
    normalized = dict(args)
    for wrong, correct in PARAM_ALIASES.items():
        if wrong in normalized and correct not in normalized:
            normalized[correct] = normalized.pop(wrong)
    return normalized