# MagicCommander Agent v2 — 智能 Agent 架构 PRD

> 版本: v1.0 | 日期: 2026-07-20 | 状态: Draft (待审批)
> 基于 Hermes Agent 核心理念，为 MagicCommander 定制的智能 Agent 系统

---

## 1. 项目背景与目标

### 1.1 背景

当前 AI Hub 的 Agent 架构采用 **LLM 直接调用工具** 的简单模式：

```
用户 → ChatPanel → SSE → AgentSession → LLM → 解析 tool_call → 执行工具 → 返回
```

这个模式在简单场景下可行，但存在明显的局限性：

| 痛点 | 表现 | 根因 |
|------|------|------|
| 无规划 | LLM 想到哪做到哪，动作机械 | 没有 Planner 先生成多步骤计划 |
| 选错工具 | `create_project("华为交换机")` 失败，应该用 `create_project_intelligent` | 没有工具名校验和智能修正 |
| 无上下文 | 每次对话需要重新说明项目名 | 缺少项目上下文记忆 |
| 错误恢复差 | 工具失败后直接终止，用户需重试 | 无错误分析和自动恢复 |
| 无经验沉淀 | Agent 每次都从零开始，重复犯同样的错误 | 无 Skill 系统 |
| 无记忆 | 关闭后忘记一切，无法跨会话累积经验 | 无长期记忆 |

### 1.2 目标

构建 **MagicCommander Agent v2**，参照 Hermes Agent 的核心理念，实现：

1. **智能编排**：Planner 先规划再执行，Validator 校验工具和参数，Recovery 自动修复错误
2. **领域 Skill 系统**：预置核心 Skill + 半自动生成框架，让 Agent 越用越聪明
3. **长期记忆**：三层结构化记忆（用户画像 / 项目历史 / 操作习惯），跨会话保持
4. **分级自主**：三种模式（顾问/半自动/全自动），可切换，适应不同场景
5. **流畅对话体验**：通过智能 Agent 对话完成项目创建、模板完善、配置渲染等全流程任务

---

## 2. 当前架构分析

### 2.1 现有架构

```
ChatPanel (React)
  ↓ SSE
chat.py (FastAPI)
  ↓
AgentSession (agent.py)
  ├── system_prompt (system.md + mc-tools.md + mode.md)
  ├── LLM Provider (OpenAI Compatible API, 9 providers)
  ├── Tools (24 个, tools.py)
  └── 循环: 解析 tool_call → 执行 → 结果回填 (max 5 轮)
```

### 2.2 现有文件结构

```
ai_hub/
├── agent/
│   ├── agent.py          # AgentSession: 会话管理、工具调用循环
│   └── tools.py          # 24 个工具注册 + 执行
├── api/
│   └── chat.py           # SSE 流式对话 API
├── llm/
│   └── provider.py       # OpenAI Compatible Provider (9 providers)
├── prompts/
│   ├── system.md         # 基础系统提示词
│   ├── mc-tools.md       # 工具调用规范
│   ├── general.md        # 通用助手模式
│   ├── template.md       # 模板模式
│   ├── config.md         # 配置模式
│   └── loader.py         # Prompt 加载
├── config.py             # 配置管理
└── main.py               # 入口
```

### 2.3 现有工具清单（24 个）

| 分类 | 工具 | 类型 |
|------|------|------|
| 项目管理 | list_projects, create_project, create_project_intelligent, delete_project, get_project_info, list_project_files | 读/写 |
| 配置渲染 | render_config, render_yaml, dry_run, undo_render | 写 |
| 文件操作 | read_file, write_text_file, read_excel, write_excel, delete_files, search_files | 读/写/删 |
| 模板标签 | create_template, update_template, reverse_engineer_config, recommend_template, generate_labels, generate_label_md, delete_labels | 读/写/删 |
| 校验对比 | validate_template, validate_excel, diff_compare, analyze_project | 读 |

---

## 3. Agent v2 架构设计

### 3.1 五层架构

```
┌─────────────────────────────────────────────────────────┐
│ 🖥️ 接入层：ChatPanel (React) + SSE                       │
│   用户输入 → 模式选择 → 附件上传 → 流式响应展示            │
├─────────────────────────────────────────────────────────┤
│ 🧭 编排层：Orchestrator（新增核心）                       │
│   Intent Router → Planner → 生成执行计划                  │
├──────────────────┬──────────────────────────────────────┤
│ 🔧 执行层         │ 🧠 知识层                             │
│   Tool Validator  │   Skills Engine                      │
│   Tool Executor   │   Memory System                      │
│   Error Recovery  │   Project Context                    │
│   Result Reporter │   Template Registry                  │
├──────────────────┴──────────────────────────────────────┤
│ 🤖 LLM 层 (9 providers)  │ 🔨 工具层 (24 tools + 权限分级) │
└─────────────────────────────────────────────────────────┘
```

### 3.2 对比：当前 vs Agent v2

```
当前: 用户 → LLM → 选工具 → 执行 → 回结果
      ❌ 无规划  ❌ 选错工具  ❌ 无记忆  ❌ 无经验  ❌ 失败即终止

v2:   用户 → Planner → Validator → Executor → Reporter
      ✅ 先规划  ✅ 自动修正  ✅ 上下文记忆  ✅ Skill沉淀  ✅ 自动恢复
```

### 3.3 完整数据流（示例："完善模板并渲染 test3"）

```
1. Intent Router 识别意图: 完善模板 + 渲染
2. Planner 生成计划: 读取 → 分析 → 更新模板 → 更新Excel → 渲染
3. Context 注入项目信息: test3 有 SWITCH.j2, parameter.xlsx
4. Validator 校验每个工具调用，自动修正参数
5. Executor 按权限分级: 读自动, 写通知, 渲染确认
6. Reporter 汇总结果: 新增3模块, 新增5列, 渲染成功
7. Memory 更新 + Skill 建议: "是否保存此流程为 Skill？"
```

---

## 4. 核心模块详细设计

### 4.1 Planner（规划器）

**职责**：将用户意图分解为多步骤执行计划

**输入**：用户消息 + 项目上下文 + 历史记忆
**输出**：结构化的步骤计划 `[{step, tool, args, reason}]`

**实现方案**：
- 利用 LLM 的推理能力，在 system prompt 中引导 LLM 先输出计划
- 计划格式：编号列表 + 每个步骤的意图说明
- Planner 不是独立 LLM 调用，而是通过增强 prompt 引导 LLM 在对话中先规划再执行

**示例**：
```
用户: "完善模板并渲染"
Agent 先输出:
  计划: ① 读取 SWITCH.j2 ② 分析缺失模块 ③ 补充 NTP/日志/AAA 
       ④ 更新 Excel ⑤ 渲染
然后按计划逐步调用工具
```

### 4.2 Validator（校验器）

**职责**：在工具调用前校验工具名和参数

**功能**：
- **工具名模糊匹配**：`create_project` 不存在 → 检查是否应使用 `create_project_intelligent`
- **参数名自动修正**：已有 `_PARAM_ALIASES` 机制，增强为自动匹配
- **参数类型校验**：检查必填参数、枚举值范围
- **上下文校验**：检查项目是否存在、模板是否可访问

**工具名修正映射**（新增）：
```python
TOOL_ALIASES = {
    "create_project": "create_project_intelligent",  # 当目标是模板中心模板时
    "render": "render_config",
    "read_template": "read_file",
    "list_templates": "recommend_template",
}
```

### 4.3 Context Manager（项目上下文）

**职责**：追踪当前项目状态，自动注入到 LLM prompt

**存储内容**：
- 当前项目名、项目结构
- 模板列表、参数表结构
- 最近操作历史
- 渲染输出状态

**实现**：
```python
class ProjectContext:
    project_name: str
    templates: list[str]
    excel_files: list[str]
    structure: dict
    last_operation: str
    last_operation_time: datetime
```

**注入方式**：在 system prompt 中动态追加：
```
## 当前项目上下文
- 项目名: test3
- 模板: SWITCH.j2 (华为交换机)
- 参数表: parameter.xlsx (含 19 列)
- 最近操作: 智能创建 (2026-07-20 16:17)
```

### 4.4 Error Recovery（错误恢复）

**职责**：工具执行失败时自动分析原因并尝试修复

**流程**：
```
工具执行失败
  ↓
分析错误类型
  ├── 工具不存在 → 模糊匹配 → 修正工具名 → 重试
  ├── 参数错误 → 修正参数 → 重试
  ├── 项目不存在 → 提示用户创建 → 等待确认
  ├── 模板不存在 → 推荐模板 → 智能创建 → 重试
  └── 其他 → 报告用户，提供建议
```

**重试策略**：最多 2 次，每次修正后重试，失败则报告用户

### 4.5 Reporter（结果汇总）

**职责**：将多步骤执行结果汇总为自然语言

**功能**：
- 汇总每个步骤的成功/失败状态
- 统计变更内容（新增模块、修改文件、渲染结果）
- 生成友好的总结报告

### 4.6 Skills Engine（技能引擎）

详见第 6 章。

### 4.7 Memory System（记忆系统）

详见第 7 章。

---

## 5. 自主模式设计

### 5.1 三种模式

| 模式 | 图标 | 说明 | 默认 |
|------|------|------|------|
| 顾问模式 | 🛡️ | Agent 出方案，用户拍板，Agent 执行 | - |
| 半自动模式 | ⚡ | 读操作自动，写操作通知，删/渲染确认 | ✅ |
| 全自动模式 | 🚀 | 自主规划、执行、纠错，仅关键节点通知 | - |

### 5.2 操作分级规则

| 级别 | 操作类型 | 示例工具 | 行为 |
|------|----------|----------|------|
| 🟢 自动 | 只读 | list_projects, read_file, read_excel, search_files, recommend_template, analyze_project, get_project_info, list_project_files | 无需确认，静默执行 |
| 🟡 自动+通知 | 写入（非破坏性） | create_project, create_project_intelligent, write_text_file, write_excel, update_template, create_template, generate_labels, generate_label_md | 自动执行，通知用户 |
| 🔴 需确认 | 删除/覆盖 | delete_project, delete_files, delete_labels, render_config, render_yaml, reverse_engineer_config | 暂停，等待用户确认 |

### 5.3 模式切换

- **全局切换**：ChatPanel 顶部 3 个标签按钮
- **临时切换**：对话中自然语言指令，如 "用顾问模式帮我处理这个" 或 "这个任务直接全自动完成"

---

## 6. Skill 系统设计

### 6.1 Skill 定义

Skill 是 Markdown 格式的领域经验文件，描述一个可复用的工作流程：

```markdown
# Skill: 从华为交换机模板创建项目

## 触发条件
用户要求创建华为交换机项目

## 执行步骤
1. 确认项目名称（如未提供则询问）
2. 调用 create_project_intelligent(deviceType="switch", vendor="huawei")
3. 读取生成的模板，检查是否包含标准模块
4. 如缺少模块，自动补充
5. 更新 Excel 示例数据
6. 展示项目结构和模板预览

## 注意事项
- 不要使用 create_project（普通创建）
- 模板中心模板只能通过 create_project_intelligent 使用
```

### 6.2 Phase 1 预置 Skill 列表（7 个）

| # | Skill 名称 | 用途 | 核心工具 |
|---|-----------|------|---------|
| 1 | create-from-template | 从模板中心创建项目 | recommend_template → create_project_intelligent |
| 2 | enhance-template | 完善模板（补充标准模块） | read_file → analyze → write_text_file |
| 3 | update-excel-data | 更新 Excel 示例数据 | read_excel → write_excel |
| 4 | render-and-validate | 渲染配置并校验 | render_config → validate_template → diff_compare |
| 5 | generate-labels | 生成设备标签 | generate_label_md → generate_labels |
| 6 | analyze-and-optimize | 项目分析优化 | analyze_project → 建议 → 修正 |
| 7 | reverse-engineer | 配置反向生成 | reverse_engineer_config |

### 6.3 Skill 生成流程（半自动）

```
1. Agent 完成复杂任务 → 自动分析执行过程
2. 识别可复用模式 → 弹出提示: "是否保存为 Skill？"
3. 用户确认 → LLM 生成 Skill 草稿 → 自动保存
4. 用户可在设置面板查看/编辑/删除
5. Skill 下次对话自动生效
```

### 6.4 Skill 加载机制

- 启动时扫描 `skills/` 目录
- 将 Skill 内容注入 system prompt 的 "可用技能" 部分
- 每个 Skill 作为独立段落，包含触发条件和执行步骤

### 6.5 分阶段规划

| Phase | 内容 | 时间 |
|-------|------|------|
| Phase 1 | 预置 7 个核心 Skill + 半自动生成框架 | 本次实施 |
| Phase 2 | Skill 使用统计、优先级排序、启用/禁用 | 后续 |
| Phase 3 | 全自动 Skill 进化、自动淘汰低效 Skill | 远期 |

---

## 7. 长期记忆系统设计

### 7.1 三层记忆结构

```
┌─────────────────────────────────┐
│ 用户画像层 (永久)                │
│ - 常用厂商/设备类型              │
│ - 语言偏好                      │
│ - 默认项目命名习惯               │
│ - 常用操作模式                   │
├─────────────────────────────────┤
│ 项目历史层 (按项目)              │
│ - 每个项目最近操作               │
│ - 模板结构快照                   │
│ - 参数表字段列表                 │
│ - 上次渲染结果                   │
├─────────────────────────────────┤
│ 操作习惯层 (全局)                │
│ - 常用操作序列                   │
│ - 失败经验（工具不适合场景）      │
│ - 工具修正记录                   │
└─────────────────────────────────┘
```

### 7.2 存储方案

- **格式**：JSON 文件，存储在 `userData/memory/` 目录
- **文件结构**：
  ```
  userData/memory/
  ├── user_profile.json    # 用户画像
  ├── project_history/     # 按项目存储
  │   ├── test1.json
  │   └── test3.json
  └── habits.json          # 操作习惯
  ```

### 7.3 记忆更新

- **自动更新**：每次对话结束后，Agent 自动更新相关记忆
- **手动清理**：设置面板中可查看和清除记忆

### 7.4 记忆注入

- 每次对话开始时，将相关记忆注入 system prompt
- 项目上下文：如果用户提到特定项目，自动加载该项目历史

### 7.5 分阶段规划

| Phase | 内容 | 时间 |
|-------|------|------|
| Phase 1 | 三层结构化记忆，JSON 文件存储 | 本次实施 |
| Phase 2 | 对话摘要 + 语义搜索 | 后续 |
| Phase 3 | 全量向量检索 + 自动压缩 | 远期 |

---

## 8. UI 变更范围

### 8.1 Phase 1（本次）：极简 UI — 3 个改动

| # | 改动 | 位置 | 说明 |
|---|------|------|------|
| 1 | 自主模式切换 | ChatPanel 顶部 | 3 个小标签按钮：🛡️顾问 / ⚡半自动 / 🚀全自动 |
| 2 | 计划展示 | 对话气泡内 | Agent 先输出步骤计划，再逐步执行 |
| 3 | Skill 保存提示 | 对话内联 | 任务完成后，显示 "是否保存为 Skill？" 带 [保存] [忽略] 按钮 |

### 8.2 Phase 2（后续）：设置面板增强

- 设置面板新增 "AI 智能体" 标签页
- Skill 管理：查看、启用/禁用、编辑、删除
- 记忆管理：查看用户画像、清除记忆
- 使用统计：Skill 调用次数、成功率

### 8.3 纯后端功能（不需要 UI）

以下功能完全在后端运行，用户通过对话感知：

- Planner（规划器）
- Validator（校验器）
- Context Manager（项目上下文）
- Error Recovery（错误恢复）
- Reporter（结果汇总）
- Memory 读写
- Skill 加载/管理

---

## 9. 文件结构规划

### 9.1 新增/修改文件

```
ai_hub/
├── agent/
│   ├── agent.py          ← 改造：集成 Orchestrator 调用
│   ├── planner.py        ← 新增：任务规划器
│   ├── validator.py      ← 新增：工具校验器（含 TOOL_ALIASES）
│   ├── context.py        ← 新增：项目上下文管理
│   ├── recovery.py       ← 新增：错误恢复策略
│   ├── reporter.py       ← 新增：结果汇总
│   ├── tools.py          ← 改造：集成权限分级标记
│   └── schemas.py        ← 新增：工具入参强类型 schema
├── skills/
│   ├── __init__.py
│   ├── engine.py         ← 新增：Skill 加载/管理/生成
│   └── skills/           ← 新增：Skill 文件目录
│       ├── create-from-template.md
│       ├── enhance-template.md
│       ├── update-excel-data.md
│       ├── render-and-validate.md
│       ├── generate-labels.md
│       ├── analyze-and-optimize.md
│       └── reverse-engineer.md
├── memory/
│   ├── __init__.py
│   ├── engine.py         ← 新增：记忆读写
│   └── schemas.py        ← 新增：数据结构定义
├── prompts/
│   ├── system.md         ← 改造：增强 Agent 编排引导
│   ├── mc-tools.md       ← 改造：增加工具权限分级标记
│   └── loader.py         ← 改造：支持 Skill 注入
├── llm/                  ← 不变
├── api/                  ← 不变
└── config.py             ← 不变（已有足够配置项）
```

### 9.2 前端改动

```
src/
├── components/
│   ├── sidebar/
│   │   ├── ChatPanel.tsx       ← 改造：新增自主模式切换标签
│   │   └── SettingsPanel.tsx   ← 改造：Phase 2 新增 AI 智能体标签页
│   └── chat/
│       ├── ChatMessage.tsx     ← 改造：Skill 保存提示按钮
│       └── PlanDisplay.tsx     ← 新增：计划步骤展示组件
├── stores/
│   └── chat.store.ts           ← 改造：新增自主模式状态
└── types/
    └── chat.ts                 ← 改造：新增 Skill 相关类型
```

---

## 10. 分阶段实施计划

### 10.1 Phase 1 — 核心 Agent 引擎（本次实施）

**目标**：完成 Agent v2 核心引擎，具备智能编排、Skill 和记忆能力

**任务清单**：

| # | 任务 | 模块 | 优先级 |
|---|------|------|--------|
| 1 | 实现 Planner 规划器 | planner.py | P0 |
| 2 | 实现 Validator 校验器（含 TOOL_ALIASES） | validator.py | P0 |
| 3 | 实现 Context Manager 项目上下文 | context.py | P0 |
| 4 | 实现 Error Recovery 错误恢复 | recovery.py | P0 |
| 5 | 实现 Reporter 结果汇总 | reporter.py | P0 |
| 6 | 实现 Skills Engine 技能引擎 | skills/engine.py | P0 |
| 7 | 编写 7 个预置 Skill 文件 | skills/skills/*.md | P0 |
| 8 | 实现 Memory System 记忆系统 | memory/engine.py | P0 |
| 9 | 改造 agent.py 集成 Orchestrator | agent.py | P0 |
| 10 | 改造 tools.py 增加权限分级 | tools.py | P1 |
| 11 | 增强 system prompt（编排引导） | prompts/system.md | P0 |
| 12 | 增强 mc-tools.md（权限分级） | prompts/mc-tools.md | P1 |
| 13 | ChatPanel 自主模式切换 UI | ChatPanel.tsx | P1 |
| 14 | 计划展示 UI 组件 | PlanDisplay.tsx | P1 |
| 15 | Skill 保存提示 UI | ChatMessage.tsx | P1 |
| 16 | 翻译键值更新 | zh-CN / en | P1 |
| 17 | TypeScript 编译 + Python 测试 | 全量 | P0 |

**预估工期**：5-7 天

### 10.2 Phase 2 — 增强与打磨（后续）

- Skill 使用统计、优先级排序、启用/禁用
- 设置面板 "AI 智能体" 标签页
- 对话摘要生成
- 记忆语义搜索
- 性能优化

### 10.3 Phase 3 — 进化（远期）

- 全自动 Skill 进化（自动生成、优化、淘汰）
- 全量向量检索记忆
- MCP Server 接口暴露
- 外部 Agent（如 Hermes）接入

---

## 11. 验收标准

### 11.1 功能验收

| # | 标准 | 验证方式 |
|---|------|---------|
| 1 | Agent 能自动规划多步骤任务并逐步执行 | 对话测试："完善模板并渲染 test3" |
| 2 | 选错工具名时自动修正 | 对话测试："用华为交换机创建项目" → 应自动使用 create_project_intelligent |
| 3 | 参数错误时自动修正 | 对话测试：用错误的参数名调用工具 |
| 4 | 7 个 Skill 全部可用 | 单元测试：每个 Skill 可被正确加载和触发 |
| 5 | 跨会话记忆保持 | 重启后对话测试：Agent 记得用户偏好 |
| 6 | 三种自主模式可切换 | UI 测试：切换标签后行为符合预期 |
| 7 | 工具权限分级正确 | 单元测试：🟢自动/🟡通知/🔴确认 |

### 11.2 非功能验收

| # | 标准 | 验证方式 |
|---|------|---------|
| 1 | TypeScript 编译零错误 | `npx tsc --noEmit` |
| 2 | Electron 编译零错误 | `npm run build:electron` |
| 3 | Python 无语法错误 | `python -m py_compile` 全量文件 |
| 4 | 现有工具不受影响 | 回归测试：全部 24 个工具可正常调用 |
| 5 | 流式响应体验不退化 | 对话测试：首字延时 < 3s |

---

## 附录 A：与 Hermes Agent 的差异对比

| 维度 | Hermes Agent | MagicCommander Agent v2 |
|------|-------------|------------------------|
| 定位 | 通用 AI Agent | 网络配置领域 Agent |
| 工具 | 40+ 通用工具 | 24 个配置管理工具 |
| Skill | 全自动进化 | 半自动 + 预置 |
| 记忆 | 向量检索 + FTS5 | 结构化 JSON 分层 |
| 入口 | CLI/TUI/Gateway/Desktop | Electron 桌面应用 |
| 部署 | 独立安装 | 内置 AI Hub |
| 安全 | 命令审批 | 操作分级权限 |

---

## 附录 B：关键设计决策记录

| 决策 | 选项 | 选择 | 理由 |
|------|------|------|------|
| 架构层次 | 保持 vs 五层重构 | 五层重构 | 痛点多，需要根本性改进 |
| 自主程度 | 顾问/半自动/全自动 | 半自动默认 + 可切换 | 平衡效率和安全 |
| Skill 系统 | 手动/半自动/全自动 | 半自动 + 分阶段 | MVP 可用 + 保留进化能力 |
| 长期记忆 | 会话级/结构化/全量 | 结构化 + 分阶段 | 实用且可控 |
| UI 范围 | 极简/平衡/全功能 | Phase 1 极简 | 快速验证核心价值 |
| Hermes 集成 | 内嵌/Sidecar/借鉴 | 借鉴理念，自研 | 避免过度依赖外部项目 |