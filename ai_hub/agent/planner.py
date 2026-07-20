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