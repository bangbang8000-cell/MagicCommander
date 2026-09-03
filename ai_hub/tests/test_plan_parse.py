"""5.0.3-503-a：计划解析测试（planner.parse_plan / parse_tool_spec）。

覆盖：
- 编号行解析（与前端 PlanDisplay 对齐）：`1. 描述 — 使用工具: tool` / `- tool` / 无工具
- 工具参数解析：key=value / 引号 / 数字 / 布尔 / JSON 后缀
- ```plan``` / ```json``` 代码块步骤列表
- 空输入 / 无步骤文本 → 空列表
"""
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))))

from ai_hub.agent.planner import parse_plan, parse_tool_spec


def test_parse_line_steps_with_tool():
    text = (
        "📋 执行计划:\n"
        "1. 创建项目 demo — 使用工具: create_project_intelligent(projectName=demo, deviceType=switch)\n"
        "2. 渲染项目 — 使用工具: render_config(projectName=demo)\n"
    )
    steps = parse_plan(text)
    assert len(steps) == 2
    assert steps[0]["index"] == 1
    assert steps[0]["description"] == "创建项目 demo"
    assert steps[0]["tool"] == "create_project_intelligent"
    assert steps[0]["args"] == {"projectName": "demo", "deviceType": "switch"}
    assert steps[1]["tool"] == "render_config"
    assert steps[1]["args"] == {"projectName": "demo"}


def test_parse_line_dash_tool_syntax():
    text = "1. 列出项目 - list_projects\n2. 读取文件 - read_file"
    steps = parse_plan(text)
    assert len(steps) == 2
    assert steps[0]["tool"] == "list_projects"
    assert steps[1]["tool"] == "read_file"
    assert steps[1]["description"] == "读取文件"


def test_parse_line_without_tool():
    steps = parse_plan("1. 仅分析项目\n2. 给出建议")
    assert len(steps) == 2
    assert steps[0]["tool"] == ""
    assert steps[0]["args"] == {}
    assert steps[1]["description"] == "给出建议"


def test_parse_json_block_steps():
    text = (
        "```plan\n"
        '[{"description": "创建项目", "tool": "create_project_intelligent", '
        '"arguments": {"projectName": "p1", "deviceType": "switch"}},\n'
        '{"description": "渲染", "tool": "render_config", "arguments": {"projectName": "p1"}}]\n'
        "```"
    )
    steps = parse_plan(text)
    assert len(steps) == 2
    assert steps[0]["index"] == 1
    assert steps[0]["tool"] == "create_project_intelligent"
    assert steps[0]["args"] == {"projectName": "p1", "deviceType": "switch"}
    assert steps[1]["tool"] == "render_config"


def test_parse_tool_spec_pure_name():
    assert parse_tool_spec("list_projects") == ("list_projects", {})


def test_parse_tool_spec_json_suffix():
    tool, args = parse_tool_spec('create_project_intelligent {"projectName": "p1", "deviceType": "switch"}')
    assert tool == "create_project_intelligent"
    assert args == {"projectName": "p1", "deviceType": "switch"}


def test_parse_tool_spec_scalars():
    tool, args = parse_tool_spec("update_template(templateName=tpl, filePath=\"a.j2\", content='x', times=3, ok=true)")
    assert tool == "update_template"
    assert args["times"] == 3
    assert args["ok"] is True
    assert args["filePath"] == "a.j2"
    assert args["content"] == "x"


def test_parse_plan_empty_inputs():
    assert parse_plan("") == []
    assert parse_plan(None) == []
    assert parse_plan("   \n  ") == []
    assert parse_plan("没有步骤的普通文本") == []


def test_parse_plan_skips_notes():
    text = (
        "好的，以下是执行计划：\n"
        "1. 创建项目 — 使用工具: create_project_intelligent(projectName=p1, deviceType=switch)\n"
        "说明：以上为初步计划。\n"
    )
    steps = parse_plan(text)
    assert len(steps) == 1
    assert steps[0]["tool"] == "create_project_intelligent"
