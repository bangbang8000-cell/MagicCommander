"""Agent v2 工具校验器：工具名模糊匹配 + 参数校验 + 权限检查"""
import logging
from ai_hub.agent.schemas import ToolPermission, get_tool_permission, resolve_tool_name, normalize_params, PARAM_ALIASES

logger = logging.getLogger(__name__)

class ToolValidationResult:
    def __init__(self, name: str, args: dict, permission: ToolPermission,
                 corrections: list[str] | None = None):
        self.name = name
        self.args = args
        self.permission = permission
        self.corrections = corrections or []

    @property
    def has_corrections(self) -> bool:
        return len(self.corrections) > 0

    @property
    def correction_message(self) -> str:
        if not self.corrections:
            return ""
        return "\n".join(f"> 🔧 {c}" for c in self.corrections)


def validate_tool_call(tool_name: str, arguments: dict,
                       available_tools: set[str] | None = None,
                       current_project: str | None = None) -> ToolValidationResult:
    corrections: list[str] = []

    resolved_name = tool_name
    if available_tools and tool_name not in available_tools:
        new_name, msg = resolve_tool_name(tool_name)
        if new_name != tool_name:
            resolved_name = new_name
            if msg:
                corrections.append(msg)

    normalized_args = normalize_params(arguments)
    for wrong, correct in PARAM_ALIASES.items():
        if wrong in arguments and correct in normalized_args and wrong in arguments:
            corrections.append(f"参数 {wrong} → {correct}")

    if current_project and resolved_name in (
        "read_file", "write_text_file", "read_excel", "write_excel",
        "render_config", "render_yaml", "dry_run", "analyze_project",
        "get_project_info", "list_project_files", "validate_excel",
        "generate_labels", "generate_label_md", "delete_files", "delete_labels",
    ):
        if "projectName" not in normalized_args:
            normalized_args["projectName"] = current_project
            corrections.append(f"自动补充项目名: {current_project}")

    permission = get_tool_permission(resolved_name)
    return ToolValidationResult(name=resolved_name, args=normalized_args,
                                 permission=permission, corrections=corrections)