# MagicCommander Agent v2 实施计划

> **For agentic workers:** 按任务顺序执行，每个任务独立可验证。步骤使用 `- [ ]` 语法追踪。
> **Spec:** [agent-v2-architecture-prd_v1.0_2026-07-20.md](../spec/agent-v2-architecture-prd_v1.0_2026-07-20.md)

**Goal:** 构建 MagicCommander Agent v2 智能编排引擎，实现 Planner/Validator/Context/Recovery/Reporter + Skills 系统 + Memory 系统 + 前端 UI

**Architecture:** Python 后端新增 7 个模块 + 改造 agent.py/tools.py/prompts；React 前端新增自主模式切换 + 计划展示 + Skill 保存提示

**Tech Stack:** Python 3.11+ (async/await), TypeScript 5.3 + React 18 + Zustand 4, Tailwind CSS

**预估工期:** 5-7 天，共 22 个任务

---

## 新增文件
```
ai_hub/agent/schemas.py, validator.py, context.py, recovery.py, reporter.py, planner.py
ai_hub/skills/__init__.py, engine.py
ai_hub/skills/skills/ (7 个 .md)
ai_hub/memory/__init__.py, engine.py, schemas.py
src/components/chat/PlanDisplay.tsx
```

## 修改文件
```
ai_hub/agent/agent.py, tools.py
ai_hub/prompts/system.md, mc-tools.md, loader.py
src/types/chat.ts, src/stores/chat.store.ts
src/components/chat/ChatPanel.tsx, ChatMessageBubble.tsx
src/i18n/locales/zh-CN/chat.json, en/chat.json
```

---

### Task 1: schemas.py — 工具权限分级 + 类型定义

**Files:** Create `ai_hub/agent/schemas.py`

- [ ] **Step 1: 创建文件**

```python
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
```

- [ ] **Step 2: 验证**

```bash
cd ai_hub && python -c "from agent.schemas import ToolPermission, TOOL_PERMISSIONS, resolve_tool_name; print('OK:', len(TOOL_PERMISSIONS), 'perms, alias:', resolve_tool_name('list_templates'))"
```

Expected: `OK: 24 perms, alias: ('recommend_template', ...)`

---

### Task 2: validator.py — 工具校验器

**Files:** Create `ai_hub/agent/validator.py`

- [ ] **Step 1: 创建文件**

```python
"""Agent v2 工具校验器：工具名模糊匹配 + 参数校验 + 权限检查"""
import logging
from ai_hub.agent.schemas import ToolPermission, get_tool_permission, resolve_tool_name, normalize_params

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
    if normalized_args != arguments:
        for k in arguments:
            if k in normalize_params.__defaults__ if hasattr(normalize_params, '__defaults__') else False:
                pass
        # 检测实际变更
        for wrong, correct in PARAM_ALIASES.items():
            if wrong in arguments and correct in normalized_args:
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

from ai_hub.agent.schemas import PARAM_ALIASES
```

- [ ] **Step 2: 验证**

```bash
cd ai_hub && python -c "from agent.tools import init_tools, get_tool_definitions; init_tools(); from agent.validator import validate_tool_call; tools = {t['function']['name'] for t in get_tool_definitions()}; r = validate_tool_call('create_project', {'project': 'test'}, tools); print(f'Name: {r.name}, Corrections: {r.corrections}')"
```

Expected: `Name: create_project_intelligent, Corrections: [...]`

---

### Task 3: context.py — 项目上下文管理

**Files:** Create `ai_hub/agent/context.py`

- [ ] **Step 1: 创建文件**

```python
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
```

- [ ] **Step 2: 验证**

```bash
cd ai_hub && python -c "from agent.context import get_project_context; ctx = get_project_context('test'); ctx.load('test3', 'workspace'); print(ctx.get_prompt_context())"
```

---

### Task 4: recovery.py — 错误恢复

**Files:** Create `ai_hub/agent/recovery.py`

- [ ] **Step 1: 创建文件**

```python
"""Agent v2 错误恢复策略"""
import logging

logger = logging.getLogger(__name__)

class RecoveryAction:
    def __init__(self, action: str, message: str, modified_args: dict | None = None,
                 modified_tool: str | None = None):
        self.action = action      # "retry" | "ask_user" | "abort"
        self.message = message
        self.modified_args = modified_args
        self.modified_tool = modified_tool

def analyze_error(tool_name: str, arguments: dict, error: str,
                  available_tools: set[str]) -> RecoveryAction:
    error_lower = error.lower()

    if "未知工具" in error or "unknown tool" in error_lower:
        from ai_hub.agent.schemas import resolve_tool_name
        new_name, msg = resolve_tool_name(tool_name)
        if new_name != tool_name:
            return RecoveryAction(action="retry", message=msg or f"修正为 '{new_name}'",
                                  modified_tool=new_name)
        return RecoveryAction(action="ask_user",
            message=f"工具 '{tool_name}' 不存在。可用: {', '.join(sorted(available_tools)[:10])}...")

    if "项目" in error and "不存在" in error:
        pn = arguments.get("projectName", "")
        return RecoveryAction(action="ask_user",
            message=f"项目 '{pn}' 不存在。需要我帮你创建吗？")

    if "模板" in error and "不存在" in error:
        return RecoveryAction(action="ask_user",
            message="模板不存在。我可以帮你推荐模板或智能创建项目。")

    if any(kw in error_lower for kw in ["timeout", "connection", "network"]):
        return RecoveryAction(action="retry", message="AI 服务暂时不可用，正在重试...")

    return RecoveryAction(action="ask_user", message=f"操作失败: {error[:300]}")
```

- [ ] **Step 2: 验证**

```bash
cd ai_hub && python -c "from agent.recovery import analyze_error; r = analyze_error('create_project', {}, '未知工具: create_project', {'create_project_intelligent'}); print(f'Action: {r.action}, Tool: {r.modified_tool}')"
```

---

### Task 5: reporter.py — 结果汇总

**Files:** Create `ai_hub/agent/reporter.py`

- [ ] **Step 1: 创建文件**

```python
"""Agent v2 结果汇总器"""
import logging

logger = logging.getLogger(__name__)

class StepResult:
    def __init__(self, step: int, description: str, success: bool,
                 detail: str = "", tool_name: str = ""):
        self.step = step
        self.description = description
        self.success = success
        self.detail = detail
        self.tool_name = tool_name

class ExecutionReport:
    def __init__(self):
        self.steps: list[StepResult] = []

    def add_step(self, step: StepResult):
        self.steps.append(step)

    def generate_summary(self) -> str:
        total = len(self.steps)
        success_count = sum(1 for s in self.steps if s.success)
        fail_count = total - success_count
        lines = ["\n## 📊 执行报告\n"]
        if fail_count == 0:
            lines.append(f"✅ 全部 {total} 个步骤执行成功。\n")
        else:
            lines.append(f"⚠️ {success_count}/{total} 成功，{fail_count} 失败。\n")
        lines.append("| 步骤 | 操作 | 状态 | 详情 |")
        lines.append("|------|------|------|------|")
        for s in self.steps:
            status = "✅" if s.success else "❌"
            detail = s.detail[:100] if s.detail else "-"
            lines.append(f"| {s.step} | {s.description} | {status} | {detail} |")
        return "\n".join(lines)
```

- [ ] **Step 2: 验证**

```bash
cd ai_hub && python -c "from agent.reporter import ExecutionReport, StepResult; r = ExecutionReport(); r.add_step(StepResult(1, '读取模板', True, 'SWITCH.j2')); print(r.generate_summary())"
```

---

### Task 6: planner.py — 任务规划器

**Files:** Create `ai_hub/agent/planner.py`

- [ ] **Step 1: 创建文件**

```python
"""Agent v2 任务规划器：通过 prompt 引导 LLM 先规划再执行"""
import logging

logger = logging.getLogger(__name__)

PLANNER_PROMPT = """
## 任务规划指引

在开始执行任务之前，请先分析用户需求并生成执行计划。

**格式：**
```
📋 执行计划:
1. [步骤描述] — 使用工具: tool_name
2. [步骤描述] — 使用工具: tool_name
```

**规则：**
- 读操作自动执行，写操作自动但通知用户，删除/渲染需确认
- 如果某一步失败，自动修正并重试（最多 2 次）
- 如果用户指定了项目名，后续步骤自动使用

**常见任务模板：**
1. "完善模板并渲染": 读取模板 → 分析缺失 → 补充模块 → 更新Excel → 渲染(需确认)
2. "从模板创建项目": 推荐模板 → create_project_intelligent → 展示结构
3. "分析并优化": analyze_project → 建议 → 按确认执行
4. "反向生成": 确认配置 → reverse_engineer_config → 展示变量
"""

def get_planner_prompt() -> str:
    return PLANNER_PROMPT

def parse_plan_from_response(content: str) -> list[dict]:
    import re
    plan = []
    pattern = r'📋\s*执行计划[:\s]*\n((?:\s*\d+\.\s*.+\n?)+)'
    match = re.search(pattern, content)
    if not match:
        return plan
    for m in re.finditer(r'(\d+)\.\s*(.+?)(?:\s*—\s*使用工具[:\s]*(\w+))?\s*\n?', match.group(1)):
        plan.append({"step": int(m.group(1)), "description": m.group(2).strip(),
                      "tool": m.group(3).strip() if m.group(3) else ""})
    return plan
```

- [ ] **Step 2: 验证**

```bash
cd ai_hub && python -c "from agent.planner import parse_plan_from_response; text = '📋 执行计划:\n1. 读取模板 — 使用工具: read_file\n2. 分析缺失'; print(parse_plan_from_response(text))"
```

---

### Task 7: Skills Engine

**Files:** Create `ai_hub/skills/__init__.py`, `ai_hub/skills/engine.py`

- [ ] **Step 1: __init__.py**

```python
from ai_hub.skills.engine import SkillsEngine, get_skills_engine
__all__ = ["SkillsEngine", "get_skills_engine"]
```

- [ ] **Step 2: engine.py**

```python
"""Agent v2 技能引擎：Skill 加载/管理/半自动生成"""
import logging
from pathlib import Path

logger = logging.getLogger(__name__)
SKILLS_DIR = Path(__file__).parent / "skills"

class Skill:
    def __init__(self, name: str, file_path: Path, content: str):
        self.name = name
        self.file_path = file_path
        self.content = content
        self.enabled = True
        self.use_count = 0
        self.last_used: str = ""

    def get_prompt_text(self) -> str:
        return f"\n## 技能: {self.name}\n\n{self.content}\n"

class SkillsEngine:
    def __init__(self):
        self.skills: dict[str, Skill] = {}
        self._loaded = False

    def load_all(self):
        if self._loaded: return
        self._loaded = True
        if not SKILLS_DIR.exists(): return
        for md_file in SKILLS_DIR.glob("*.md"):
            try:
                content = md_file.read_text(encoding="utf-8")
                name = md_file.stem
                self.skills[name] = Skill(name=name, file_path=md_file, content=content)
            except Exception as e:
                logger.error(f"Failed to load skill {md_file}: {e}")
        logger.info(f"Loaded {len(self.skills)} skills")

    def get_skills_prompt(self) -> str:
        if not self.skills: return ""
        parts = ["\n## 可用技能\n"]
        for skill in self.skills.values():
            if skill.enabled:
                parts.append(skill.get_prompt_text())
        return "\n".join(parts)

    def reload(self):
        self.skills.clear()
        self._loaded = False
        self.load_all()

    def save_skill(self, name: str, content: str) -> Skill:
        safe_name = name.lower().replace(" ", "-").replace("/", "-")
        file_path = SKILLS_DIR / f"{safe_name}.md"
        file_path.write_text(content, encoding="utf-8")
        skill = Skill(name=safe_name, file_path=file_path, content=content)
        self.skills[safe_name] = skill
        return skill

    def record_usage(self, name: str):
        if name in self.skills:
            self.skills[name].use_count += 1
            from datetime import datetime
            self.skills[name].last_used = datetime.now().isoformat()

_engine: SkillsEngine | None = None

def get_skills_engine() -> SkillsEngine:
    global _engine
    if _engine is None:
        _engine = SkillsEngine()
        _engine.load_all()
    return _engine
```

- [ ] **Step 3: 验证**

```bash
cd ai_hub && python -c "from skills.engine import get_skills_engine; e = get_skills_engine(); print(f'Skills: {len(e.skills)}')"
```

---

### Task 8: 7 个预置 Skill 文件

**Files:** Create 7 files under `ai_hub/skills/skills/`

- [ ] **Step 1: create-from-template.md**

```markdown
# 从模板中心创建项目

## 触发条件
用户要求创建项目，且指定了设备类型和厂商。

## 执行步骤
1. 如果未提供项目名，先询问
2. 调用 create_project_intelligent(deviceType, vendor, projectName)
3. 展示项目结构和模板预览

## 注意事项
- **不要使用 create_project**，模板中心模板只能用 create_project_intelligent
- "华为交换机" → deviceType="switch", vendor="huawei"
```

- [ ] **Step 2: enhance-template.md**

```markdown
# 完善模板

## 执行步骤
1. read_file 读取模板
2. 分析缺失的标准模块（VLAN/SNMP/NTP/日志/AAA/SSH）
3. write_text_file 补充缺失模块

## 标准模块检查清单
- VLAN 配置、管理接口、SNMP、NTP、日志服务器、AAA/TACACS、本地用户+SSH
```

- [ ] **Step 3: update-excel-data.md**

```markdown
# 更新 Excel 示例数据

## 执行步骤
1. read_excel 读取表头
2. 根据模板变量生成真实示例数据
3. write_excel 写入

## 规范
- 管理IP 使用 192.168.x.x 或 10.x.x.x
- SNMP 使用 public_ro / private_rw
- NTP 使用 ntp.aliyun.com
```

- [ ] **Step 4: render-and-validate.md**

```markdown
# 渲染配置并校验

## 执行步骤
1. dry_run 预演渲染
2. render_config 执行渲染（需确认）
3. 展示结果摘要
```

- [ ] **Step 5: generate-labels.md**

```markdown
# 生成设备标签

## 执行步骤
1. generate_label_md 生成 Markdown 预览
2. generate_labels 生成 Word 标签（如需要）
```

- [ ] **Step 6: analyze-and-optimize.md**

```markdown
# 项目分析优化

## 执行步骤
1. analyze_project 分析项目
2. 解读结果，列出优化建议
3. 按确认执行优化
```

- [ ] **Step 7: reverse-engineer.md**

```markdown
# 配置反向生成

## 执行步骤
1. 确认配置文本完整
2. reverse_engineer_config 反向生成
3. 展示提取变量和生成模板
```

- [ ] **Step 8: 验证**

```bash
cd ai_hub && python -c "from skills.engine import get_skills_engine; e = get_skills_engine(); e.reload(); print(f'Skills: {len(e.skills)}'); [print(f'  - {s}') for s in sorted(e.skills.keys())]"
```

Expected: `Skills: 7` with all 7 names

---

### Task 9: Memory System

**Files:** Create `ai_hub/memory/schemas.py`, `__init__.py`, `engine.py`

- [ ] **Step 1: schemas.py**

```python
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
```

- [ ] **Step 2: __init__.py**

```python
from ai_hub.memory.engine import MemoryEngine, get_memory_engine
__all__ = ["MemoryEngine", "get_memory_engine"]
```

- [ ] **Step 3: engine.py**

```python
"""Agent v2 记忆引擎：用户画像 + 项目历史 + 操作习惯"""
import json, logging
from pathlib import Path
from ai_hub.memory.schemas import UserProfile, ProjectHistory, OperationHabit, now_iso

logger = logging.getLogger(__name__)

class MemoryEngine:
    def __init__(self):
        self.memory_dir = Path(".")
        self.user_profile = UserProfile()
        self.project_histories: dict[str, ProjectHistory] = {}
        self.habits = OperationHabit()
        self._loaded = False

    def init_dir(self, base_dir: str):
        self.memory_dir = Path(base_dir) / "memory"
        self.memory_dir.mkdir(parents=True, exist_ok=True)
        (self.memory_dir / "project_history").mkdir(parents=True, exist_ok=True)
        self._load_all()

    def _load_all(self):
        if self._loaded: return
        self._loaded = True
        for fname, attr in [("user_profile.json", "user_profile"),
                            ("habits.json", "habits")]:
            path = self.memory_dir / fname
            if path.exists():
                try:
                    data = json.loads(path.read_text(encoding="utf-8"))
                    setattr(self, attr, type(getattr(self, attr))(**data))
                except Exception as e:
                    logger.warning(f"Failed to load {fname}: {e}")
        ph_dir = self.memory_dir / "project_history"
        if ph_dir.exists():
            for f in ph_dir.glob("*.json"):
                try:
                    data = json.loads(f.read_text(encoding="utf-8"))
                    self.project_histories[f.stem] = ProjectHistory(**data)
                except Exception as e:
                    logger.warning(f"Failed to load {f}: {e}")

    def update_user_profile(self, **kwargs):
        for k, v in kwargs.items():
            if hasattr(self.user_profile, k):
                setattr(self.user_profile, k, v)
        self.user_profile.updated_at = now_iso()
        self._save_json("user_profile.json", self.user_profile.__dict__)

    def record_operation(self, project_name: str, operation: str):
        if project_name not in self.project_histories:
            self.project_histories[project_name] = ProjectHistory(project_name=project_name)
        ph = self.project_histories[project_name]
        ph.last_operations.append(operation)
        if len(ph.last_operations) > 20:
            ph.last_operations = ph.last_operations[-20:]
        ph.updated_at = now_iso()
        self._save_json(f"project_history/{project_name}.json", ph.__dict__)

    def get_memory_prompt(self, project_name: str = "") -> str:
        parts = []
        if self.user_profile.preferred_vendors:
            parts.append(f"- 常用厂商: {', '.join(self.user_profile.preferred_vendors)}")
        if project_name and project_name in self.project_histories:
            ph = self.project_histories[project_name]
            if ph.templates:
                parts.append(f"- 项目 {project_name} 模板: {', '.join(ph.templates)}")
        if parts:
            return "## 用户记忆\n" + "\n".join(parts)
        return ""

    def _save_json(self, rel_path: str, data: dict):
        try:
            path = self.memory_dir / rel_path
            path.parent.mkdir(parents=True, exist_ok=True)
            path.write_text(json.dumps(data, ensure_ascii=False, indent=2), encoding="utf-8")
        except Exception as e:
            logger.error(f"Failed to save {rel_path}: {e}")

_engine: MemoryEngine | None = None

def get_memory_engine() -> MemoryEngine:
    global _engine
    if _engine is None:
        _engine = MemoryEngine()
    return _engine
```

- [ ] **Step 4: 验证**

```bash
cd ai_hub && python -c "from memory.engine import get_memory_engine; m = get_memory_engine(); m.init_dir('.'); m.update_user_profile(preferred_vendors=['huawei']); print(m.get_memory_prompt())"
```

---

### Task 10: 改造 tools.py — 权限分级

**Files:** Modify `ai_hub/agent/tools.py`

- [ ] **Step 1: 修改 register_tool 函数**

在文件顶部导入处增加：
```python
from ai_hub.agent.schemas import ToolPermission, get_tool_permission
```

修改 `register_tool` 函数（约第 19 行）：
```python
def register_tool(name: str, description: str, parameters: dict, handler: callable,
                  permission: ToolPermission | None = None):
    _tools[name] = {
        "name": name,
        "description": description,
        "parameters": parameters,
        "handler": handler,
        "permission": permission.value if permission else get_tool_permission(name).value,
    }
```

- [ ] **Step 2: 修改 get_tool_definitions**

```python
def get_tool_definitions() -> list[dict]:
    return [
        {
            "type": "function",
            "function": {
                "name": t["name"],
                "description": t["description"],
                "parameters": t["parameters"],
                "permission": t.get("permission", "confirm"),
            },
        }
        for t in _tools.values()
    ]
```

- [ ] **Step 3: 修改 create_project 描述**

找到 `create_project` 注册（约第 965 行），将 description 改为：
```python
"⚠️ 仅用于从 example 目录复制模板项目。从模板中心创建项目请使用 create_project_intelligent。指定项目名称和可选的模板来源",
```

- [ ] **Step 4: 验证**

```bash
cd ai_hub && python -c "from agent.tools import init_tools, get_tool_definitions; init_tools(); tools = get_tool_definitions(); perms = {t['function']['name']: t['function'].get('permission') for t in tools}; print(f'Total: {len(perms)}, Auto: {sum(1 for v in perms.values() if v==\"auto\")}, Notify: {sum(1 for v in perms.values() if v==\"notify\")}, Confirm: {sum(1 for v in perms.values() if v==\"confirm\")}')"
```

Expected: `Total: 24, Auto: 12, Notify: 9, Confirm: 6`

---

### Task 11: 改造 prompts/loader.py — Skill 注入

**Files:** Modify `ai_hub/prompts/loader.py`

- [ ] **Step 1: 修改 get_system_prompt**

```python
def get_system_prompt(mode: Optional[str] = None, project_name: str = "") -> str:
    base = load_prompt("system")
    tools = load_prompt("mc-tools")

    from ai_hub.agent.planner import get_planner_prompt
    planner = get_planner_prompt()

    from ai_hub.skills.engine import get_skills_engine
    skills_prompt = get_skills_engine().get_skills_prompt()

    parts = [base, planner, tools, skills_prompt]

    if mode and mode in ("template", "config", "general"):
        mode_prompt = load_prompt(mode)
        if mode_prompt:
            parts.append(mode_prompt)

    if project_name:
        from ai_hub.agent.context import get_project_context
        ctx = get_project_context("")
        if ctx.project_name:
            parts.append(ctx.get_prompt_context())

    from ai_hub.memory.engine import get_memory_engine
    memory_prompt = get_memory_engine().get_memory_prompt(project_name)
    if memory_prompt:
        parts.append(memory_prompt)

    return "\n\n".join(parts)
```

- [ ] **Step 2: 验证**

```bash
cd ai_hub && python -c "from prompts.loader import get_system_prompt; p = get_system_prompt('general'); print(f'Prompt length: {len(p)} chars')"
```

---

### Task 12: 增强 prompts/system.md

**Files:** Modify `ai_hub/prompts/system.md`

- [ ] **Step 1: 在文件开头增加编排引导**

在现有内容前插入：
```markdown
你是 MagicCommander 的 AI 智能助手，专门帮助用户管理网络设备配置。

## 核心能力
- 创建和管理配置项目（华为/思科/H3C 交换机/路由器/防火墙）
- 编写和完善 Jinja2 配置模板、管理 Excel 参数表
- 渲染配置文件、生成设备标签、分析项目、反向生成模板

## 行为准则
1. **先规划，再执行**：对于复杂任务，先列出 📋 执行计划，再逐步执行
2. **主动修正**：如果工具名或参数有误，自动修正并继续
3. **上下文感知**：记住当前操作的项目，后续步骤自动使用
4. **分级执行**：读操作自动执行，写操作通知用户，删除/渲染需确认
5. **失败恢复**：工具调用失败时分析原因，尝试修正后重试（最多 2 次）
6. **经验沉淀**：完成任务后，如果流程可复用，建议保存为 Skill

## 回复格式
- 使用中文回复
- 工具调用使用 ```tool_call 格式
- 执行计划使用 📋 执行计划 格式
- 重要信息使用表格或列表展示
```

- [ ] **Step 2: 验证**

```bash
cd ai_hub && python -c "from prompts.loader import load_prompt; p = load_prompt('system'); print('Has planner:', '先规划' in p)"
```

---

### Task 13: 增强 prompts/mc-tools.md — 权限分级说明

**Files:** Modify `ai_hub/prompts/mc-tools.md`

- [ ] **Step 1: 在文件开头插入权限分级说明**

```markdown
## 工具权限分级

| 级别 | 符号 | 含义 | 行为 |
|------|------|------|------|
| auto | 🟢 | 只读操作 | 自动执行，无需用户确认 |
| notify | 🟡 | 非破坏性写入 | 自动执行，通知用户 |
| confirm | 🔴 | 破坏性操作 | 暂停，等待用户确认 |

**重要**: 工具调用失败时，请先分析错误原因，尝试修正参数后重试。如果工具不存在，检查是否有名称相似的替代工具。
```

- [ ] **Step 2: 验证**

```bash
cd ai_hub && python -c "from prompts.loader import load_prompt; p = load_prompt('mc-tools'); print('Has permission:', '权限分级' in p)"
```

---

### Task 14: 改造 agent.py — 集成 Orchestrator

**Files:** Modify `ai_hub/agent/agent.py`

- [ ] **Step 1: 在文件头部增加新模块导入**

在现有 import 之后（约第 13 行）增加：

```python
from ai_hub.agent.validator import validate_tool_call
from ai_hub.agent.recovery import analyze_error
from ai_hub.agent.context import get_project_context, clear_project_context
from ai_hub.agent.schemas import ToolPermission
from ai_hub.skills.engine import get_skills_engine
from ai_hub.memory.engine import get_memory_engine
```

- [ ] **Step 2: 修改 AgentSession.__init__**

```python
def __init__(self):
    self.messages: list[dict] = []
    self.system_prompt: str = get_system_prompt()
    self.provider: Optional[LLMProvider] = None
    self.mode: str = "general"
    self.autonomy_mode: str = "semi_auto"  # advisor | semi_auto | full_auto
    self.current_project: str = ""         # 当前操作的项目名
    self.session_id: str = ""              # 会话 ID
```

- [ ] **Step 3: 修改 set_mode 方法**

```python
def set_mode(self, mode: str, project_name: str = ""):
    self.mode = mode
    self.current_project = project_name
    self.system_prompt = get_system_prompt(mode, project_name)
```

- [ ] **Step 4: 修改 run_stream 中的工具调用逻辑**

找到 `run_stream` 方法中工具调用部分（约第 85-126 行），将工具调用逻辑替换为：

```python
            # 检测是否有 tool call
            tool_call = _parse_tool_call(full_content)
            if not tool_call:
                reason = _get_reasoning(self.provider)
                self.add_message("assistant", full_content, {"reasoning_content": reason} if reason else None)
                return

            cleaned_content = _strip_tool_call(full_content)
            tool_name = tool_call["name"]
            tool_args = tool_call["arguments"]

            # === Agent v2: 校验工具调用 ===
            available_tools = {t["function"]["name"] for t in tools}
            validation = validate_tool_call(tool_name, tool_args, available_tools, self.current_project)

            if validation.has_corrections:
                yield f"\n\n{validation.correction_message}\n\n"

            tool_name = validation.name
            tool_args = validation.args

            # === Agent v2: 权限分级检查 ===
            if validation.permission == ToolPermission.CONFIRM and self.autonomy_mode == "advisor":
                yield f"\n\n> ⚠️ 操作 `{tool_name}` 需要确认。请回复 '确认' 继续，或 '取消' 中止。\n\n"
                return

            tool_call_id = f"call_{uuid.uuid4().hex[:12]}"

            if validation.permission == ToolPermission.NOTIFY:
                yield f"\n\n> 🔧 正在调用工具: `{tool_name}`...\n\n"
            elif validation.permission == ToolPermission.AUTO:
                yield f"\n\n> 🔧 正在调用工具: `{tool_name}`...\n\n"
            else:
                yield f"\n\n> 🔧 正在调用工具: `{tool_name}`...\n\n"

            # === Agent v2: 执行工具 + 错误恢复 ===
            retry_count = 0
            max_retries = 2
            while retry_count <= max_retries:
                try:
                    result = await execute_tool(tool_name, tool_args)
                    break
                except Exception as e:
                    error_msg = _extract_error_message(e)
                    logger.error(f"Tool execution error: {e}")

                    if retry_count < max_retries:
                        recovery = analyze_error(tool_name, tool_args, error_msg, available_tools)
                        if recovery.action == "retry":
                            yield f"\n> {recovery.message}\n\n"
                            if recovery.modified_tool:
                                tool_name = recovery.modified_tool
                            if recovery.modified_args:
                                tool_args = recovery.modified_args
                            retry_count += 1
                            continue
                        else:
                            yield f"\n> {recovery.message}\n\n"
                            return
                    else:
                        yield f"\n> 工具执行失败（已重试 {max_retries} 次）: {error_msg}\n\n"
                        return

            # === Agent v2: 更新上下文和记忆 ===
            if self.current_project:
                ctx = get_project_context(self.session_id)
                ctx.record_operation(f"调用工具: {tool_name}")

            memory = get_memory_engine()
            memory.record_operation(self.current_project, f"调用 {tool_name}")

            # 将 tool 结果加入上下文（保持原有逻辑）
            tool_result_json = json.dumps(result, ensure_ascii=False)
            reason = _get_reasoning(self.provider)
            assistant_msg = {
                "role": "assistant",
                "content": cleaned_content if cleaned_content else None,
                "tool_calls": [{
                    "id": tool_call_id,
                    "type": "function",
                    "function": {
                        "name": tool_name,
                        "arguments": json.dumps(tool_args, ensure_ascii=False),
                    }
                }]
            }
            if reason:
                assistant_msg["reasoning_content"] = reason
            current_messages.append(assistant_msg)
            current_messages.append({
                "role": "tool",
                "tool_call_id": tool_call_id,
                "content": tool_result_json,
            })

            yield f"> 工具执行结果:\n```json\n{tool_result_json}\n```\n\n"
```

- [ ] **Step 5: 修改 get_or_create_session**

```python
def get_or_create_session(session_id: str) -> AgentSession:
    if session_id not in _sessions:
        session = AgentSession()
        session.set_provider()
        session.session_id = session_id
        _sessions[session_id] = session
    return _sessions[session_id]
```

- [ ] **Step 6: 修改 clear_session**

```python
def clear_session(session_id: str):
    _sessions.pop(session_id, None)
    clear_project_context(session_id)
```

- [ ] **Step 7: 验证**

```bash
cd ai_hub && python -c "from agent.agent import AgentSession, get_or_create_session; s = get_or_create_session('test'); print(f'Autonomy: {s.autonomy_mode}, Session: {s.session_id}')"
```

Expected: `Autonomy: semi_auto, Session: test`

---

### Task 15: 前端 — types/chat.ts 增加自主模式 + Skill 类型

**Files:** Modify `src/types/chat.ts`

- [ ] **Step 1: 增加自主模式类型**

在 `ChatMode` 类型定义后（约第 31 行），新增：

```typescript
export type AutonomyMode = 'advisor' | 'semi_auto' | 'full_auto'

export const AUTONOMY_MODE_CONFIG: Record<AutonomyMode, { labelKey: string; icon: string }> = {
  advisor: { labelKey: 'chat:autonomy.advisor', icon: '🛡️' },
  semi_auto: { labelKey: 'chat:autonomy.semiAuto', icon: '⚡' },
  full_auto: { labelKey: 'chat:autonomy.fullAuto', icon: '🚀' },
}
```

在 `ToolResult` 接口后（约第 58 行），新增：

```typescript
export interface SkillSavePrompt {
  taskDescription: string
  skillName: string
  skillContent: string
  messageId: string
}
```

- [ ] **Step 2: 验证**

```bash
npx tsc --noEmit
```

---

### Task 16: 前端 — chat.store.ts 增加自主模式状态

**Files:** Modify `src/stores/chat.store.ts`

- [ ] **Step 1: 增加导入和类型**

```typescript
import type { AutonomyMode, SkillSavePrompt } from '@/types/chat'
```

- [ ] **Step 2: 在 ChatState 接口中增加**

```typescript
  autonomyMode: AutonomyMode
  setAutonomyMode: (mode: AutonomyMode) => void
  pendingSkillPrompt: SkillSavePrompt | null
  setPendingSkillPrompt: (prompt: SkillSavePrompt | null) => void
```

- [ ] **Step 3: 在初始状态中增加默认值**

```typescript
autonomyMode: 'semi_auto' as AutonomyMode,
pendingSkillPrompt: null,
```

- [ ] **Step 4: 增加 setter 函数**

```typescript
setAutonomyMode: (mode) => set({ autonomyMode: mode }),
setPendingSkillPrompt: (prompt) => set({ pendingSkillPrompt: prompt }),
```

- [ ] **Step 5: 确保 persist partialize 包含 autonomyMode**

在 `persist` 配置的 `partialize` 中，确认 `autonomyMode` 在保留列表中。

- [ ] **Step 6: 验证**

```bash
npx tsc --noEmit
```

---

### Task 17: 前端 — PlanDisplay.tsx 计划展示组件

**Files:** Create `src/components/chat/PlanDisplay.tsx`

- [ ] **Step 1: 创建组件**

```tsx
import { useTranslation } from 'react-i18next'
import { CheckCircle2, Circle, Loader2, XCircle } from 'lucide-react'
import clsx from 'clsx'

export interface PlanStep {
  step: number
  description: string
  tool: string
  status: 'pending' | 'running' | 'done' | 'error'
}

interface PlanDisplayProps {
  steps: PlanStep[]
  isDark?: boolean
}

export function PlanDisplay({ steps, isDark }: PlanDisplayProps) {
  const { t } = useTranslation()
  if (!steps || steps.length === 0) return null

  return (
    <div className={clsx(
      'rounded-lg border p-3 my-2 text-sm',
      isDark ? 'border-gray-700 bg-gray-800/50' : 'border-gray-200 bg-gray-50'
    )}>
      <div className="font-medium mb-2 text-xs uppercase tracking-wide text-gray-500">
        📋 {t('chat:plan.title', '执行计划')}
      </div>
      <div className="space-y-1.5">
        {steps.map((step) => (
          <div key={step.step} className="flex items-center gap-2">
            {step.status === 'done' && <CheckCircle2 className="w-4 h-4 text-green-500" />}
            {step.status === 'running' && <Loader2 className="w-4 h-4 text-blue-500 animate-spin" />}
            {step.status === 'error' && <XCircle className="w-4 h-4 text-red-500" />}
            {step.status === 'pending' && <Circle className="w-4 h-4 text-gray-400" />}
            <span className={clsx(
              step.status === 'done' && 'line-through text-gray-500',
              step.status === 'error' && 'text-red-500',
              isDark ? 'text-gray-300' : 'text-gray-700'
            )}>
              {step.step}. {step.description}
            </span>
            {step.tool && (
              <code className={clsx(
                'text-xs px-1.5 py-0.5 rounded',
                isDark ? 'bg-gray-700 text-gray-400' : 'bg-gray-200 text-gray-600'
              )}>
                {step.tool}
              </code>
            )}
          </div>
        ))}
      </div>
    </div>
  )
}
```

- [ ] **Step 2: 验证**

```bash
npx tsc --noEmit
```

---

### Task 18: 前端 — ChatPanel.tsx 自主模式切换

**Files:** Modify `src/components/chat/ChatPanel.tsx`

- [ ] **Step 1: 增加导入**

```typescript
import type { AutonomyMode } from '@/types/chat'
import { AUTONOMY_MODE_CONFIG } from '@/types/chat'
```

- [ ] **Step 2: 从 store 获取自主模式状态**

在 ChatPanel 函数组件中增加：

```typescript
const autonomyMode = useChatStore((s) => s.autonomyMode)
const setAutonomyMode = useChatStore((s) => s.setAutonomyMode)
```

- [ ] **Step 3: 在 ChatPanel 顶部（模式选择器附近）增加切换按钮**

在 ChatPanel 顶部区域（约在模式选择器所在位置），增加自主模式切换标签：

```tsx
{/* 自主模式切换 */}
<div className="flex items-center gap-1 px-3 py-1.5">
  {(Object.entries(AUTONOMY_MODE_CONFIG) as [AutonomyMode, typeof AUTONOMY_MODE_CONFIG[AutonomyMode]][]).map(([mode, config]) => (
    <button
      key={mode}
      onClick={() => setAutonomyMode(mode)}
      className={clsx(
        'px-2 py-0.5 rounded text-xs transition-colors',
        autonomyMode === mode
          ? isDark ? 'bg-blue-600 text-white' : 'bg-blue-500 text-white'
          : isDark ? 'text-gray-400 hover:text-gray-200' : 'text-gray-500 hover:text-gray-700'
      )}
      title={t(config.labelKey)}
    >
      {config.icon}
    </button>
  ))}
</div>
```

- [ ] **Step 4: 在 sendMessage 中传递 autonomyMode**

在 `sendMessage` 函数调用中，将 `autonomyMode` 包含在请求参数中。

- [ ] **Step 5: 验证**

```bash
npx tsc --noEmit
```

---

### Task 19: 前端 — ChatMessageBubble.tsx Skill 保存提示

**Files:** Modify `src/components/chat/ChatMessageBubble.tsx`

- [ ] **Step 1: 增加 Skill 保存提示 UI**

在 ChatMessageBubble 组件中，当消息是 assistant 角色且任务完成后，检查是否有 Skill 保存提示。在消息内容下方增加：

```tsx
{/* Skill 保存提示 */}
{message.role === 'assistant' && skillPrompt && skillPrompt.messageId === message.id && (
  <div className={clsx(
    'mt-2 p-2 rounded border text-xs',
    isDark ? 'border-gray-600 bg-gray-700/50' : 'border-gray-200 bg-gray-50'
  )}>
    <p className="mb-1.5">{t('chat:skill.savePrompt', '是否将此流程保存为 Skill，以便下次复用？')}</p>
    <div className="flex gap-2">
      <button
        onClick={() => onSaveSkill(skillPrompt)}
        className="px-2 py-0.5 rounded bg-blue-500 text-white hover:bg-blue-600"
      >
        {t('chat:skill.save', '保存')}
      </button>
      <button
        onClick={() => onDismissSkill()}
        className="px-2 py-0.5 rounded bg-gray-300 dark:bg-gray-600 hover:bg-gray-400"
      >
        {t('chat:skill.ignore', '忽略')}
      </button>
    </div>
  </div>
)}
```

- [ ] **Step 2: 验证**

```bash
npx tsc --noEmit
```

---

### Task 20: i18n 翻译键值更新

**Files:** Modify `src/i18n/locales/zh-CN/chat.json`, `src/i18n/locales/en/chat.json`

- [ ] **Step 1: zh-CN/chat.json 增加**

```json
{
  "autonomy": {
    "advisor": "顾问模式",
    "semiAuto": "半自动模式",
    "fullAuto": "全自动模式"
  },
  "plan": {
    "title": "执行计划"
  },
  "skill": {
    "savePrompt": "是否将此流程保存为 Skill，以便下次复用？",
    "save": "保存",
    "ignore": "忽略",
    "saved": "Skill 已保存"
  }
}
```

- [ ] **Step 2: en/chat.json 增加**

```json
{
  "autonomy": {
    "advisor": "Advisor",
    "semiAuto": "Semi-Auto",
    "fullAuto": "Full-Auto"
  },
  "plan": {
    "title": "Execution Plan"
  },
  "skill": {
    "savePrompt": "Save this workflow as a Skill for future reuse?",
    "save": "Save",
    "ignore": "Ignore",
    "saved": "Skill saved"
  }
}
```

---

### Task 21: TypeScript 编译 + Python 语法验证

**Files:** 全量验证

- [ ] **Step 1: TypeScript 编译**

```bash
npx tsc --noEmit
```

Expected: 零错误

- [ ] **Step 2: Python 语法验证**

```bash
cd ai_hub && python -c "
from agent.schemas import ToolPermission, TOOL_PERMISSIONS, TOOL_NAME_ALIASES
from agent.validator import validate_tool_call
from agent.context import get_project_context
from agent.recovery import analyze_error
from agent.reporter import ExecutionReport, StepResult
from agent.planner import get_planner_prompt, parse_plan_from_response
from agent.tools import init_tools, get_tool_definitions
from skills.engine import get_skills_engine
from memory.engine import get_memory_engine
init_tools()
get_skills_engine()
get_memory_engine()
print('All modules OK')
"
```

Expected: `All modules OK`

- [ ] **Step 3: Electron 编译**

```bash
npm run build:electron
```

Expected: 零错误

---

### Task 22: 最终验证与提交

**Files:** 全量

- [ ] **Step 1: 验证现有工具不受影响**

```bash
cd ai_hub && python -c "
from agent.tools import init_tools, get_tool_definitions, execute_tool
import asyncio
init_tools()
tools = get_tool_definitions()
print(f'Total tools: {len(tools)}')
for t in tools:
    name = t['function']['name']
    perm = t['function'].get('permission', 'N/A')
    print(f'  {name} ({perm})')
"
```

Expected: 24 tools with correct permissions

- [ ] **Step 2: 验证 Skill 加载**

```bash
cd ai_hub && python -c "
from skills.engine import get_skills_engine
e = get_skills_engine()
e.reload()
print(f'Skills: {len(e.skills)}')
print(e.get_skills_prompt()[:500])
"
```

Expected: 7 skills with non-empty prompt

- [ ] **Step 3: 验证 Memory 初始化**

```bash
cd ai_hub && python -c "
from memory.engine import get_memory_engine
m = get_memory_engine()
m.init_dir('.')
m.update_user_profile(preferred_vendors=['huawei', 'cisco'], preferred_device_types=['switch'])
m.record_operation('test3', '创建项目')
print(m.get_memory_prompt('test3'))
"
```

- [ ] **Step 4: 最终编译**

```bash
npx tsc --noEmit && npm run build:electron
```

Expected: 全部零错误