"""AI Hub 规划器提示词测试

覆盖维度（PRD v3.0 AI-6 / 规划器）：
- get_planner_prompt 返回规划器提示词，包含"任务规划指引/执行计划/规则"等关键结构
- 多次调用输出稳定（无随机/状态依赖）
"""
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))))

from ai_hub.agent.planner import get_planner_prompt, PLANNER_PROMPT


def test_planner_prompt_contains_planning_sections():
    prompt = get_planner_prompt()
    assert "任务规划指引" in prompt
    assert "执行计划" in prompt
    assert "工具" in prompt


def test_planner_prompt_mentions_rules():
    prompt = get_planner_prompt()
    assert "读操作自动执行" in prompt
    assert "删除/渲染需确认" in prompt


def test_planner_prompt_nonempty():
    assert len(get_planner_prompt().strip()) > 0


def test_planner_prompt_stable_across_calls():
    assert get_planner_prompt() == get_planner_prompt()
    assert get_planner_prompt() == PLANNER_PROMPT


def test_planner_prompt_contains_common_task_templates():
    prompt = get_planner_prompt()
    assert "完善模板并渲染" in prompt
    assert "从模板创建项目" in prompt
