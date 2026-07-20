"""Agent v2 项目上下文管理器"""
import logging
from datetime import datetime
from pathlib import Path

logger = logging.getLogger(__name__)

class ProjectContext:
    def __init__(self, project_name: str = "", workspace_dir: str = ""):
        self.project_name = project_name
        self.workspace_dir = workspace_dir
        self.templates: list[str] = []
        self.excel_files: list[str] = []
        self.structure: dict = {}
        self.last_operation: str = ""
        self.last_operation_time: datetime | None = None

    def load(self, project_name: str, workspace_dir: str = ""):
        self.project_name = project_name
        self.workspace_dir = workspace_dir or self.workspace_dir
        self._refresh()

    def _refresh(self):
        if not self.project_name or not self.workspace_dir:
            return
        project_dir = Path(self.workspace_dir) / self.project_name
        if not project_dir.exists():
            return
        self.structure = {
            "dirs": [d.name for d in project_dir.iterdir() if d.is_dir() and not d.name.startswith('.')],
            "files": [f.name for f in project_dir.iterdir() if f.is_file()],
        }
        templates_dir = project_dir / "templates"
        if templates_dir.exists():
            self.templates = [f.name for f in templates_dir.glob("*.j2")]
        excel_dir = project_dir / "excel"
        if excel_dir.exists():
            self.excel_files = [f.name for f in excel_dir.glob("*.xlsx")]

    def record_operation(self, operation: str):
        self.last_operation = operation
        self.last_operation_time = datetime.now()
        self._refresh()

    def get_prompt_context(self) -> str:
        if not self.project_name:
            return ""
        parts = [f"## 当前项目上下文", f"- 项目名: {self.project_name}"]
        if self.templates:
            parts.append(f"- 模板: {', '.join(self.templates)}")
        if self.excel_files:
            parts.append(f"- 参数表: {', '.join(self.excel_files)}")
        if self.structure.get("dirs"):
            parts.append(f"- 目录: {', '.join(self.structure['dirs'])}")
        if self.last_operation:
            t = self.last_operation_time.strftime("%H:%M") if self.last_operation_time else ""
            parts.append(f"- 最近操作: {self.last_operation} ({t})")
        return "\n".join(parts)

_contexts: dict[str, ProjectContext] = {}

def get_project_context(session_id: str) -> ProjectContext:
    if session_id not in _contexts:
        _contexts[session_id] = ProjectContext()
    return _contexts[session_id]

def clear_project_context(session_id: str):
    _contexts.pop(session_id, None)