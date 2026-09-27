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
    "template_list": ToolPermission.AUTO,
    "analyze_project": ToolPermission.AUTO, "get_project_info": ToolPermission.AUTO,
    "list_project_files": ToolPermission.AUTO, "validate_template": ToolPermission.AUTO,
    "validate_excel": ToolPermission.AUTO, "dry_run": ToolPermission.AUTO,
    "diff_compare": ToolPermission.AUTO,
    # 4.3 F3-4：只读/导出/预览 → auto
    "export_project": ToolPermission.AUTO, "preview_template": ToolPermission.AUTO,
    "create_project": ToolPermission.NOTIFY, "create_project_intelligent": ToolPermission.NOTIFY,
    "write_text_file": ToolPermission.NOTIFY, "write_excel": ToolPermission.NOTIFY,
    "update_template": ToolPermission.NOTIFY, "create_template": ToolPermission.NOTIFY,
    "generate_labels": ToolPermission.NOTIFY, "generate_label_md": ToolPermission.NOTIFY,
    "undo_render": ToolPermission.NOTIFY,
    # 4.3 F3-4：创建/导入/更新 → notify
    "create_from_template": ToolPermission.NOTIFY, "import_project": ToolPermission.NOTIFY,
    "update_project": ToolPermission.NOTIFY,
    "delete_project": ToolPermission.CONFIRM, "delete_files": ToolPermission.CONFIRM,
    "delete_labels": ToolPermission.CONFIRM, "template_delete": ToolPermission.CONFIRM, "render_config": ToolPermission.CONFIRM,
    "render_yaml": ToolPermission.CONFIRM, "reverse_engineer_config": ToolPermission.CONFIRM,
    # 4.3 F3-3：技能库工具（只读 auto / 写入 notify）
    "list_skills": ToolPermission.AUTO, "get_skill": ToolPermission.AUTO,
    "enable_skill": ToolPermission.NOTIFY, "disable_skill": ToolPermission.NOTIFY,
    "update_skill": ToolPermission.NOTIFY,
    # 5.0.3-503-b：技能自学习修订（写入技能定义 → notify）
    "skill_optimize": ToolPermission.NOTIFY,
    # 5.0.5-505-b：知识库工具（只读 auto / 沉淀 notify）
    "list_knowledge": ToolPermission.AUTO,
    "search_knowledge": ToolPermission.AUTO,
    "add_knowledge": ToolPermission.NOTIFY,
    # ------------------------------------------------------------------
    # 5.4.x 权限表补登（AG-4 复核）：此前下列工具**未登记**，而 MC 的
    # register_tool 从不显式传 permission（`grep -c "permission=" tools.py` = 0），
    # 一律走 get_tool_permission() 兜底 CONFIRM ⇒ 只读/编排类工具被误伤为高危，
    # semi 档下每次都要人工确认。此处按语义显式登记，消除误伤。
    # ⚠️ 注意：模型端（程序内 AI 助手）的 register_tool 走本表；MCP 侧经
    # capabilities.mcp_permission_meta() 亦读同一份 permission 值。
    # ------------------------------------------------------------------
    # 任务编排原语（只读轮询 AUTO / 提交与取消属编排动作 NOTIFY）
    "task_list": ToolPermission.AUTO,
    "task_query": ToolPermission.AUTO,
    "task_wait": ToolPermission.AUTO,
    "task_submit": ToolPermission.NOTIFY,
    "task_cancel": ToolPermission.NOTIFY,
    # 审计查询（只读）
    "audit_query": ToolPermission.AUTO,
    # 反馈写入（追加式，非破坏）
    "agent_feedback": ToolPermission.NOTIFY,
    # 源码态专用工具（编译态经 is_source_only_tool 屏蔽）：显式登记为 CONFIRM，
    # 不再依赖兜底，语义更明确（与 AL 的 register 显式 confirm 对齐）
    # 注：read_file 已在上方登记为 AUTO（MC 的 read_file 两模式可用，非源码态专用）
    "run_cli": ToolPermission.CONFIRM,
    "list_dir": ToolPermission.CONFIRM,
    "read_source": ToolPermission.CONFIRM,
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
    # 4.3 F3-4：项目/模板操作工具别名
    "export": "export_project", "export_project_package": "export_project",
    "import": "import_project", "import_project_package": "import_project",
    "create_from_tpl": "create_from_template", "from_template": "create_from_template",
    "preview": "preview_template", "preview_tpl": "preview_template",
    "update_project_meta": "update_project",
    # 4.3 F3-3：技能工具别名
    "skills": "list_skills", "list_skill": "list_skills",
    "skill_detail": "get_skill", "enable": "enable_skill", "disable": "disable_skill",
    "edit_skill": "update_skill",
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
    # 4.3 F3-4：项目/模板操作工具参数别名
    "zip_path": "zipPath", "zip": "zipPath", "zip_file": "zipPath",
    "target_dir": "targetDir", "output_dir": "targetDir",
    "template_path": "templatePath", "tpl_path": "templatePath",
    # 4.3 F3-3：技能工具参数别名
    "skill": "skillName", "skill_name": "skillName",
    # 5.0.5-505-b：知识库工具参数别名
    "tag": "tags", "tag_list": "tags", "top_k": "topK",
    "keyword": "query", "keywords": "query", "question": "query",
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