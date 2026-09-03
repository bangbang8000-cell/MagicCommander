"""Agent v2 任务规划器：通过 prompt 引导 LLM 先规划再执行（5.0.3-503-a 起含计划解析）"""
import json
import logging
import re

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


# ============================================================
# 5.0.3-503-a：计划解析（LLM 计划文本 → 结构化步骤列表）
# ============================================================

def parse_tool_spec(spec: str) -> tuple[str, dict]:
    """解析步骤中的工具规格字符串 → (tool, args)。

    支持格式（按优先级）：
    - ``tool_name`` → (tool_name, {})
    - ``tool_name(param=value, k2="v2", k3=123)`` → 键值对参数
    - ``tool_name {"key": "value"}`` → JSON 参数
    """
    spec = spec.strip()
    if not spec:
        return "", {}
    # JSON 后缀：tool_name {"..."} / tool_name {...}
    json_match = re.search(r'^([A-Za-z_][\w.]*)\s+(\{.*\})\s*$', spec, re.DOTALL)
    if json_match:
        tool = json_match.group(1)
        try:
            args = json.loads(json_match.group(2))
            return tool, args if isinstance(args, dict) else {}
        except ValueError:
            return tool, {}
    # 括号参数：tool_name(k=v, k2="v2", k3=123)
    paren_match = re.match(r'^([A-Za-z_][\w.]*)\s*\((.*)\)\s*$', spec, re.DOTALL)
    if paren_match:
        tool = paren_match.group(1)
        inner = paren_match.group(2).strip()
        args = {}
        if inner:
            for kv in re.split(r',(?![^()]*\))', inner):
                kv = kv.strip()
                if not kv:
                    continue
                m = re.match(r'([A-Za-z_][\w]*)\s*=\s*(.*)', kv)
                if not m:
                    continue
                key, raw = m.group(1), m.group(2).strip()
                args[key] = _coerce_scalar(raw)
        return tool, args
    # 纯工具名
    name_match = re.match(r'^([A-Za-z_][\w.]*)\s*$', spec)
    if name_match:
        return name_match.group(1), {}
    return spec, {}


def _coerce_scalar(raw: str):
    """将字符串参数值转为标量（int/float/bool/引号字符串/裸字符串）。"""
    if not raw:
        return ""
    if (raw.startswith('"') and raw.endswith('"')) or (raw.startswith("'") and raw.endswith("'")):
        return raw[1:-1]
    low = raw.lower()
    if low == "true":
        return True
    if low == "false":
        return False
    if re.fullmatch(r'-?\d+', raw):
        return int(raw)
    if re.fullmatch(r'-?\d+\.\d+', raw):
        return float(raw)
    return raw


def parse_plan(text: str) -> list[dict]:
    """从 LLM 计划文本解析步骤列表。

    支持两种来源：
    1) ```plan``` / ```json``` 代码块：``[{"description": "...", "tool": "...", "arguments": {...}}]``
    2) 编号行（与前端 PlanDisplay 对齐）：
       ``1. 描述 — 使用工具: tool_name(param=v, k2="v2")``

    返回 ``[{"index": 1, "description": "...", "tool": "tool_name", "args": {...}}]``；
    无任何可解析步骤返回空列表。
    """
    if not text or not text.strip():
        return []
    # 方式1：JSON 代码块（```plan / ```json / ```workflow_plan```）
    block_match = re.search(r'```(?:plan|json|workflow_plan)\s*\n(.*?)\n```', text, re.DOTALL)
    if block_match:
        try:
            data = json.loads(block_match.group(1).strip())
            if isinstance(data, list):
                return [_normalize_step(i, item) for i, item in enumerate(data, 1) if isinstance(item, dict)]
        except ValueError:
            pass
    # 方式2：编号行
    steps = []
    for line in text.splitlines():
        line = line.strip()
        m = re.match(r'^(\d+)[.、)]\s*(.+)$', line)
        if not m:
            continue
        index = int(m.group(1))
        desc_and_tool = m.group(2)
        # 提取「— 使用工具: xxx」/「- tool」尾段
        tool_spec = ""
        tm = re.search(r'[—-]\s*(?:使用工具[:：]?\s*)?(\S.*)$', desc_and_tool)
        if tm:
            tool_spec = tm.group(1).strip()
            description = desc_and_tool[:tm.start()].strip().rstrip("—-–")
        else:
            description = desc_and_tool
        tool, args = parse_tool_spec(tool_spec)
        steps.append({
            "index": index,
            "description": description,
            "tool": tool,
            "args": args,
        })
    return steps


def _normalize_step(index: int, item: dict) -> dict:
    """将 JSON 步骤条目归一为 {index, description, tool, args}。"""
    args = item.get("arguments") or item.get("args") or {}
    if not isinstance(args, dict):
        args = {}
    return {
        "index": index,
        "description": str(item.get("description") or item.get("step") or f"步骤 {index}"),
        "tool": str(item.get("tool") or ""),
        "args": args,
    }