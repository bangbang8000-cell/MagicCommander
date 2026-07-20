from dataclasses import dataclass, field
from datetime import datetime

@dataclass
class UserProfile:
    preferred_vendors: list[str] = field(default_factory=list)
    preferred_device_types: list[str] = field(default_factory=list)
    default_autonomy_mode: str = "semi_auto"
    updated_at: str = ""

@dataclass
class ProjectHistory:
    project_name: str = ""
    templates: list[str] = field(default_factory=list)
    excel_columns: list[str] = field(default_factory=list)
    last_operations: list[str] = field(default_factory=list)
    last_render_result: str = ""
    updated_at: str = ""

@dataclass
class OperationHabit:
    common_sequences: list[dict] = field(default_factory=list)
    failed_patterns: list[dict] = field(default_factory=list)
    tool_corrections: list[dict] = field(default_factory=list)
    updated_at: str = ""

def now_iso() -> str:
    return datetime.now().isoformat()