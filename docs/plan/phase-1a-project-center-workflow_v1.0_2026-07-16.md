# Phase 1-A：项目中心与工作流面板设计

> 文档类型：开发计划 / 设计方案  
> 文档版本：v1.0  
> 创建日期：2026-07-16  
> 适用版本基线：MagicCommander V3.0.4 Build 26071602

## 1. 背景

Phase 0 已完成质量基线收口，包括 Jinja2 TextMate 高亮、Markdown 标签生成、PDF 导出、统一 `output-label/时间戳/` 输出目录、搜索面板 Markdown 类型过滤，以及项目浏览器的初步多选和批量操作能力。

下一阶段进入 Phase 1：体验与准确率升级。Phase 1-A 的第一轮目标不是引入真实 AI 能力，也不是重写整体桌面框架，而是在现有 Electron + React + Zustand 架构上，优先解决两个直接影响大规模使用的问题：

1. 多项目场景下，几十个甚至几百个项目需要更容易搜索、筛选、批量处理和判断状态。
2. 工作台操作链路需要从“分散找按钮”整理为“选择范围、检查准备状态、执行动作、查看结果”的连续流程。

## 2. 已确认方案

采用“项目中心 + 工作流面板，分层重组”方案。

### 2.1 方案边界

保留现有左侧 ActivityBar、中栏 Sidebar、编辑区、底部面板结构，不新增独立 Dashboard 首页，不引入数据库或新的项目索引文件。第一轮只在现有侧边栏体系内重组项目管理和工作台流程。

### 2.2 为什么不采用其他方案

| 方案 | 结论 | 原因 |
|------|------|------|
| 轻量增强现有面板 | 不作为主方案 | 改动最小，但会继续把功能堆进 `ExplorerPanel` 和 `WorkbenchPanel`，中长期难以支撑几百项目和后续 AI 能力入口 |
| 项目中心 + 工作流面板 | 采用 | 可以同时优化多项目管理和流程闭环，且能分阶段迁移，风险可控 |
| 全新 Dashboard 首页 | 暂缓 | 产品感更强，但第一轮改动过大，容易打断现有成熟工作流 |

## 3. 用户体验目标

Phase 1-A 第一轮完成后，用户应该能在一个清晰流程中完成：

```text
定位项目或批量选择项目
  ↓
查看项目准备状态
  ↓
选择渲染/输出模式
  ↓
执行配置渲染、YAML 输出或标签生成
  ↓
查看最新输出或打开项目目录
```

关键体验目标：

- 面对大量项目时，用户能快速定位目标项目。
- 用户能清楚区分当前操作范围是单项目还是批量项目。
- 用户在执行前能看到 Excel、模板、参数、输出目录等准备状态。
- 用户不需要在多个面板之间反复跳转才能完成主要任务。
- 缺少关键文件或目录时，界面能给出明确提示。

## 4. 信息架构

### 4.1 项目中心

项目中心继续承载在 `ExplorerPanel` 中，但内部拆分为更清晰的子模块。

```text
项目中心
├─ 项目列表工具栏
│  ├─ 搜索
│  ├─ 排序：名称 / 最近 / ID
│  └─ 批量选择入口
├─ 项目分组列表
│  ├─ 收藏
│  ├─ 最近
│  └─ 全部
├─ 项目状态徽标
│  ├─ 缺参数
│  ├─ 缺模板
│  ├─ 可渲染
│  └─ 有输出
├─ 批量操作条
│  ├─ 批量渲染
│  ├─ 批量 YAML
│  ├─ 批量标签
│  └─ 删除输出
└─ 当前项目文件树
```

### 4.2 工作流面板

工作流面板继续承载在 `WorkbenchPanel` 中，但展示结构调整为流程化卡片。

```text
工作流面板
├─ 目标范围卡片
│  ├─ 当前项目
│  └─ 已选择 N 个项目
├─ 准备状态卡片
│  ├─ Excel
│  ├─ Templates
│  ├─ para.xlsx
│  ├─ output
│  ├─ yaml
│  └─ output-label
├─ 输出设置卡片
│  ├─ 配置文件 / YAML
│  └─ 设备名 / SN
├─ 执行动作卡片
│  ├─ 开始渲染
│  ├─ 生成 YAML
│  └─ 生成标签
├─ 结果入口卡片
│  ├─ 打开最新输出
│  └─ 打开项目目录
└─ 状态反馈卡片
   ├─ 进度
   ├─ 当前消息
   └─ 错误列表
```

## 5. 功能范围

### 5.1 第一轮纳入范围

#### 项目中心

- 保留项目搜索，并将搜索结果数量明确展示。
- 保留收藏、最近、普通项目分组。
- 项目排序支持名称、最近、ID。
- 项目项显示状态徽标。
- 项目多选与工作台的 `selectedProjectIds` 保持同步。
- 批量操作条支持批量渲染、批量 YAML、批量标签和删除输出。
- 文件树仍只显示当前选中项目，避免几百项目时展开过重。

#### 工作流面板

- 显示当前操作范围：单项目或批量项目。
- 显示准备状态：Excel、模板、para、output、yaml、output-label。
- 统一输出设置：配置文件/YAML，设备名/SN。
- 统一执行动作：渲染配置、生成 YAML、生成标签。
- 显示最近任务进度、成功消息和错误信息。
- 提供打开当前项目目录和打开最新输出的入口。

### 5.2 第一轮不纳入范围

- 不做全新 Dashboard 首页。
- 不改左侧 ActivityBar 主导航结构。
- 不接入真实 LLM 或 AI Hub。
- 不引入新的数据库、SQLite、项目索引文件或后台扫描服务。
- 不做跨项目文件树全量展开。
- 不做复杂项目标签体系。
- 不做云同步、权限、多用户协作。

## 6. 状态模型

### 6.1 项目准备状态

第一轮不引入持久化索引，状态只基于已有项目结构和必要目录判断。

| 状态 | 判断依据 | UI 语义 |
|------|----------|---------|
| 缺参数 | 未发现 `para.xlsx` | 无法确认渲染参数配置 |
| 缺模板 | 未发现 `templates/` 或模板目录为空 | 无可用模板 |
| 可渲染 | Excel、模板、参数关键结构存在 | 可以执行渲染 |
| 有输出 | 存在 `output/`、`yaml/` 或 `output-label/` | 可以查看或交付结果 |

### 6.2 批量范围

批量范围继续使用 `useRenderStore.selectedProjectIds`，项目中心负责选择，工作流面板负责消费。

规则：

- 当 `selectedProjectIds.length > 0` 时，工作流面板显示“已选择 N 个项目”。
- 当没有批量选择但存在 `selectedProject` 时，工作流面板显示“当前项目”。
- 执行动作优先使用批量选择范围，否则使用当前项目。

## 7. 组件拆分设计

为避免继续扩大 `ExplorerPanel.tsx` 和 `WorkbenchPanel.tsx`，第一轮引入轻量子组件。

```text
src/components/sidebar/project/
├─ ProjectListToolbar.tsx
├─ ProjectListItem.tsx
├─ ProjectBatchBar.tsx
└─ ProjectStatusBadge.tsx

src/components/sidebar/workbench/
├─ WorkbenchScopeCard.tsx
├─ WorkbenchReadinessCard.tsx
├─ WorkbenchActionGrid.tsx
└─ WorkbenchResultCard.tsx
```

### 7.1 ProjectListToolbar

职责：搜索、排序、全选入口、项目数量展示。

依赖：传入搜索值、排序值、项目数量和回调，不直接访问 Zustand。

### 7.2 ProjectListItem

职责：单个项目项展示、选择、收藏、打开目录、状态徽标。

依赖：项目信息、选中状态、收藏状态、状态徽标、事件回调。

### 7.3 ProjectBatchBar

职责：批量选择后的统一操作条。

依赖：已选数量、渲染/输出/标签/删除回调。

### 7.4 ProjectStatusBadge

职责：把项目准备状态显示为紧凑徽标。

依赖：项目状态枚举，不直接读取文件系统。

### 7.5 WorkbenchScopeCard

职责：显示当前操作范围，区分单项目和批量项目。

### 7.6 WorkbenchReadinessCard

职责：显示 Excel、模板、para、output、yaml、output-label 的准备状态。

### 7.7 WorkbenchActionGrid

职责：集中渲染主要动作按钮，包括渲染配置、生成 YAML、生成标签。

### 7.8 WorkbenchResultCard

职责：展示最新状态消息、错误列表、打开目录和查看输出入口。

## 8. 数据流

```text
ExplorerPanel
  ├─ 读取 useProjectStore.projects / selectedProject
  ├─ 维护搜索、排序、本地项目勾选状态
  ├─ 同步勾选结果到 useRenderStore.selectedProjectIds
  └─ 渲染 ProjectListToolbar / ProjectListItem / ProjectBatchBar

WorkbenchPanel
  ├─ 读取 useProjectStore.selectedProject
  ├─ 读取 useRenderStore.selectedProjectIds / config / progress / errors
  ├─ 根据选中范围计算执行 ids
  ├─ 根据项目参数接口读取当前项目结构
  └─ 渲染 Scope / Readiness / Action / Result 卡片
```

项目结构读取第一轮沿用现有 `window.electron.project.parameters(projectId)` 或已有结构接口，避免新增后端协议。若现有结构信息不足，再在实施阶段局部扩展 IPC 返回字段。

## 9. 错误处理

- 执行动作前，如果没有当前项目或批量选择，按钮置灰。
- 批量操作时，如果部分项目状态不完整，第一轮不阻塞执行，但在准备状态中提示风险。
- 渲染、YAML、标签生成失败时，继续使用 `useRenderStore.errors` 和 `currentMessage` 展示错误。
- 打开目录或输出失败时使用现有 Toast 提示。

## 10. 测试与验证

### 10.1 本地验证命令

```bash
npm run typecheck
npm run build
```

如改动影响渲染 store 或 IPC 类型，追加：

```bash
npm test
python -m pytest backend/tests/ -v
```

### 10.2 人工验收场景

1. 只有 1 个项目时，工作流面板显示当前项目范围，主要按钮可用。
2. 有 50+ 项目时，项目列表可搜索、排序、分组和批量选择。
3. 选择多个项目后，工作流面板显示“已选择 N 个项目”。
4. 执行批量渲染时，调用范围与勾选项目一致。
5. 没有选择任何项目时，工作台动作按钮置灰并给出明确提示。
6. 项目缺少模板或参数时，准备状态卡片能显示风险。
7. 渲染成功后，状态反馈显示完成消息。
8. 渲染失败后，错误信息在工作流面板中可见。

## 11. 实施顺序建议

1. 提取项目中心子组件，但保持现有行为不变。
2. 将项目多选状态与 `useRenderStore.selectedProjectIds` 做单向同步。
3. 增加项目状态徽标的轻量计算与展示。
4. 重组 `WorkbenchPanel` 为流程化卡片。
5. 统一工作台执行范围计算逻辑。
6. 增加结果入口和错误反馈区域。
7. 执行类型检查和构建验证。

## 12. 风险与缓解

| 风险 | 影响 | 缓解 |
|------|------|------|
| `ExplorerPanel` 和 `WorkbenchPanel` 已经偏大 | 修改容易引入回归 | 先提取纯展示子组件，保持 store 行为不变 |
| 项目状态需要额外文件系统信息 | 可能需要扩展 IPC | 第一轮只用现有结构字段，必要时小范围扩展 |
| 批量操作和当前项目操作范围混淆 | 可能误操作 | UI 明确显示“当前项目”或“已选择 N 个项目”，执行函数统一从一个 helper 取 ids |
| 多语言文案增加 | 可能出现缺 key | 第一轮优先补 zh-CN 和 en，其他语言使用短英文兜底或同步补齐 |

## 13. 验收结论

Phase 1-A 第一轮完成后，MagicCommander 应具备更清晰的多项目操作能力和工作台流程闭环，为后续 Phase 1-B 的渲染准确率检查、模板变量校验、输出历史对比，以及 Phase 2 AI Hub 的智能建议入口打基础。
