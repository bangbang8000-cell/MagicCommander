"""4.3 F3-5（测试计划 A-6）：AI 能力矩阵标准化评测（双端统一维度）

双端统一维度（MC/AL 一致，8 项）：
tool（工具）/ dialog（对话）/ stream（流式）/ permission（权限）/
autonomy（自主）/ skill（技能）/ memory（记忆）/ planner（规划器）

每维度一个测试用例，覆盖 MC 侧可测能力；矩阵结构固定，双端共用同一维度清单。
"""
import asyncio
import os
import sys
from unittest import mock
from unittest.mock import AsyncMock

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))))

from ai_hub.agent.schemas import ToolPermission, get_tool_permission, TOOL_PERMISSIONS
from ai_hub.agent.agent import AgentSession, get_or_create_session, clear_session
from ai_hub.agent.tools import init_tools, get_tool_definitions
from ai_hub.agent.planner import get_planner_prompt
from ai_hub.agent.validator import validate_tool_call
from ai_hub.prompts.loader import invalidate_system_prompt_cache, get_system_prompt_version
from ai_hub.skills.engine import SkillsEngine
from ai_hub.memory.engine import MemoryEngine

# ===== 双端统一维度清单（MC/AL 共用）=====

MATRIX_DIMENSIONS = [
    {"id": "tool", "label": "工具", "description": "工具注册/校验/错误可读/项目模板操作"},
    {"id": "dialog", "label": "对话", "description": "会话管理/摘要替换/截断/标题"},
    {"id": "stream", "label": "流式", "description": "SSE 流式产出/工具循环/确认流程"},
    {"id": "permission", "label": "权限", "description": "auto/notify/confirm 分级"},
    {"id": "autonomy", "label": "自主", "description": "advisor/semi_auto/full_auto 对确认的影响"},
    {"id": "skill", "label": "技能", "description": "技能库 CRUD/启用禁用/使用统计"},
    {"id": "memory", "label": "记忆", "description": "去抖写盘/flush/prompt 缓存失效"},
    {"id": "planner", "label": "规划器", "description": "规划指引 prompt"},
]

UNIFIED_DIMENSION_IDS = ["tool", "dialog", "stream", "permission", "autonomy", "skill", "memory", "planner"]

TOOL_CALL_DELETE_PROJECT = (
    "<tool_calls><invoke name=\"delete_project\">"
    "<parameter name=\"projectName\">projX</parameter>"
    "</invoke></tool_calls>"
)


def _run(coro):
    return asyncio.run(coro)


async def _collect(agen):
    parts = []
    async for chunk in agen:
        parts.append(chunk)
    return "".join(parts)


class MockStreamProvider:
    last_reasoning_content = ""

    def __init__(self, first: str, second: str = "已完成任务。"):
        self._responses = iter([first, second])

    async def chat_stream(self, messages, system_prompt="", temperature=0.7, max_tokens=4096):
        try:
            yield next(self._responses)
        except StopIteration:
            return


# ===== 矩阵结构一致性 =====

def test_matrix_dimensions_unified():
    """双端统一维度：8 项固定，id 顺序一致"""
    assert [d["id"] for d in MATRIX_DIMENSIONS] == UNIFIED_DIMENSION_IDS
    assert len(MATRIX_DIMENSIONS) == 8
    # 每维度有中文标签与说明
    for d in MATRIX_DIMENSIONS:
        assert d["label"] and d["description"]


# ===== 1. 工具维度 =====

def test_matrix_tool_registration_and_validation(tmp_path):
    init_tools()
    defs = get_tool_definitions()
    names = {d["function"]["name"] for d in defs}
    # F3-4 项目/模板操作 8 工具
    for name in ["list_projects", "create_project", "update_project", "delete_project",
                 "import_project", "export_project", "create_from_template", "preview_template"]:
        assert name in names, f"缺少工具: {name}"
    # F3-3 技能工具
    for name in ["list_skills", "get_skill", "enable_skill", "disable_skill"]:
        assert name in names
    # 工具定义含 JSON Schema 参数
    create_def = next(d for d in defs if d["function"]["name"] == "create_project")
    assert create_def["function"]["parameters"]["required"] == ["projectName"]


# ===== 2. 对话维度 =====

def test_matrix_dialog_session_management():
    clear_session("m-dialog")
    s1 = get_or_create_session("m-dialog")
    s1.add_message("user", "你好")
    s1.add_message("assistant", "你好，有什么可以帮你？")
    assert len(s1.messages) == 2
    # 摘要替换（新对话语义）
    s1.replace_history_with_summary("这是压缩后的摘要")
    assert len(s1.messages) == 1
    assert "摘要" in s1.messages[0]["content"]
    # 截断
    s2 = get_or_create_session("m-dialog-2")
    for i in range(150):
        s2.add_message("user", f"m{i}")
    s2.truncate_history(20)
    assert len(s2.messages) == 20
    clear_session("m-dialog")
    clear_session("m-dialog-2")


# ===== 3. 流式维度 =====

def test_matrix_stream_tool_loop_and_confirm_flow():
    session = AgentSession()
    session.provider = MockStreamProvider(TOOL_CALL_DELETE_PROJECT)
    session.autonomy_mode = "semi_auto"
    with mock.patch("ai_hub.agent.agent.execute_tool", new=AsyncMock(return_value={"success": True})) as exec_mock:
        out = _run(_collect(session.run_stream(max_tool_rounds=5)))
    # 流式产出包含确认提示（CONFIRM 流程），工具未执行
    assert "需要确认" in out
    assert session.pending_confirmation is not None
    exec_mock.assert_not_called()


# ===== 4. 权限维度 =====

def test_matrix_permission_levels():
    assert get_tool_permission("list_projects") == ToolPermission.AUTO
    assert get_tool_permission("create_project") == ToolPermission.NOTIFY
    assert get_tool_permission("delete_project") == ToolPermission.CONFIRM
    assert get_tool_permission("no_such_tool") == ToolPermission.CONFIRM  # 默认 confirm
    # 校验器带权限
    assert validate_tool_call("delete_project", {}, {"delete_project"}).permission == ToolPermission.CONFIRM


# ===== 5. 自主维度 =====

def test_matrix_autonomy_full_auto_skips_confirm():
    session = AgentSession()
    session.provider = MockStreamProvider(TOOL_CALL_DELETE_PROJECT)
    session.autonomy_mode = "full_auto"
    with mock.patch(
        "ai_hub.agent.agent.execute_tool",
        new=AsyncMock(return_value={"success": True, "result": "deleted"}),
    ) as exec_mock:
        out = _run(_collect(session.run_stream(max_tool_rounds=5)))
    assert "正在调用工具" in out
    exec_mock.assert_called_once_with("delete_project", {"projectName": "projX"})
    assert session.pending_confirmation is None


# ===== 6. 技能维度 =====

def test_matrix_skill_crud(tmp_path, monkeypatch):
    import ai_hub.skills.engine as skills_engine
    monkeypatch.setattr(skills_engine, "SKILLS_DIR", tmp_path)
    eng = SkillsEngine()
    eng.load_all()
    # 保存/查询/列表
    eng.save_skill("alpha", "技能A内容")
    assert eng.get_skill("alpha")["content"] == "技能A内容"
    assert [s["name"] for s in eng.list_skills()] == ["alpha"]
    # 启用禁用
    eng.disable_skill("alpha")
    assert eng.skills["alpha"].enabled is False
    eng.enable_skill("alpha")
    assert eng.skills["alpha"].enabled is True
    # 使用统计
    eng.record_usage("alpha")
    assert eng.skills["alpha"].use_count == 1
    # 删除
    assert eng.delete_skill("alpha") is True
    assert eng.get_skill("alpha") is None


# ===== 7. 记忆维度 =====

def test_matrix_memory_debounce_and_cache_invalidation(tmp_path):
    eng = MemoryEngine()
    eng.init_dir(str(tmp_path))
    # 去抖写盘：窗口内不落盘，flush 后落盘
    eng.record_operation("MP", "op1")
    fpath = tmp_path / "memory" / "project_history" / "MP.json"
    assert not fpath.exists()
    eng.flush()
    assert fpath.exists()
    # prompt 缓存失效
    v0 = get_system_prompt_version()
    eng.update_user_profile(preferred_vendors=["huawei"])
    assert get_system_prompt_version() == v0 + 1
    # 记忆 prompt
    prompt = eng.get_memory_prompt("MP")
    assert "用户记忆" in prompt


# ===== 8. 规划器维度 =====

def test_matrix_planner_prompt():
    prompt = get_planner_prompt()
    assert "任务规划指引" in prompt
    assert "执行计划" in prompt
    assert "工具" in prompt
