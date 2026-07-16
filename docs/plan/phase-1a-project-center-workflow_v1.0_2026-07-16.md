# Phase 1-A：项目中心与工作流面板设计

> 文档类型：开发计划 / 设计方案  
> 文档版本：v1.0  
> 创建日期：2026-07-16  
> 适用版本基线：MagicCommander V3.0.4 Build 26071602

## 1. 背景

Phase 0 已完成质量基线收口，包括 Jinja2 TextMate 高亮、Markdown 标签生成、PDF 导出、统一 `output-label/时间戳/` 输出目录、搜索面板 Markdown 类型过滤，以及项目浏览器的初步多选和批量操作能力。

下一阶段进入 Phase 1：体验与准确率升级。Phase 1-A 的第一轮目标不是引入真实 AI 能力，也不是重写整体桌面框架，而是在现有 Electron + React + Zustand 架构上，优先解决三个直接影响规模化使用的问题：

1. 多项目场景下，几十个甚至几百个项目需要更容易搜索、筛选、批量处理和判断状态。
2. 工作台操作链路需要从“分散找按钮”整理为“选择范围、检查准备状态、执行动作、查看结果”的连续流程。
3. 项目模板需要从隐藏的“示例项目”能力升级为可展示、可介绍、可编辑、可复用的模板中心，形成“项目沉淀为模板、模板创建新项目”的资产闭环。

## 2. 已确认方案

采用“项目中心 + 模板中心 + 工作流面板 + 可调整布局 + 工作区索引现代化，分层重组”方案。

### 2.1 方案边界

保留现有左侧 ActivityBar、中栏 Sidebar、编辑区、底部面板结构，不新增独立 Dashboard 首页，不引入数据库。第一轮在现有侧边栏体系内重组项目管理、模板管理和工作台流程，同时补齐可拖动布局能力。现有 `listExamples`、`saveAsExample`、从 template 创建项目等“示例项目”能力将被产品化为模板中心能力，并通过兼容迁移逐步把 `example` 目录语义调整为 `template`。`workspace/MC_Para.xlsx` 不直接删除，先引入 `mc-workspace.json` 作为结构化索引并保持 Excel 兼容。

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
- 用户能查看可用项目模板的用途说明，并能从模板创建项目。
- 用户能把当前项目另存为模板，并维护模板名称、简介和适用场景等基础信息。
- 用户可以拖动调整侧边栏、底部面板、中栏内部区域大小，并在下次启动时保留偏好。
- 程序内部逐步使用结构化工作区索引，降低对 `MC_Para.xlsx` 的强耦合，同时保留旧项目兼容。

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

### 4.2 模板中心

模板中心将现有“示例项目”能力产品化，提供模板展示、介绍、编辑和复用入口。

```text
模板中心
├─ 模板列表工具栏
│  ├─ 搜索
│  ├─ 排序：名称 / 最近使用 / 来源项目
│  └─ 视图：卡片 / 紧凑列表
├─ 模板展示
│  ├─ 名称
│  ├─ 简介
│  ├─ 适用场景
│  ├─ 来源项目
│  ├─ 更新时间
│  └─ 结构摘要：templates / excel / para / label
├─ 模板操作
│  ├─ 从模板创建项目
│  ├─ 当前项目另存为模板
│  ├─ 编辑模板信息
│  └─ 删除模板
└─ 模板详情
   ├─ 模板说明
   ├─ 输入要求
   ├─ 输出结构
   └─ 文件结构预览
```

### 4.3 可调整布局

可调整布局作为 Phase 1-A 的横向能力，为项目中心、模板中心和工作流面板提供更灵活的空间管理。

```text
应用布局
├─ ActivityBar：固定宽度
├─ Sidebar：支持拖动调整宽度
├─ EditorArea：自适应剩余空间
└─ BottomPanel：支持拖动调整高度

中栏内部
├─ 项目列表 / 模板列表：可调整高度
├─ 文件树 / 模板详情：可调整高度
└─ 操作区：自适应
```

布局偏好写入 UI store，避免用户每次启动后重新调整。

### 4.4 工作区索引现代化

工作区索引现代化不直接移除 `MC_Para.xlsx`，而是引入结构化索引文件作为新能力基础。

```text
workspace/
├─ mc-workspace.json      # 新结构化索引
├─ MC_Para.xlsx           # 兼容保留
├─ project-a/
├─ project-b/
└─ template/              # 新模板目录，兼容旧 example/
```

第一轮目标是让项目中心和模板中心优先使用结构化索引与目录扫描结果，Python 渲染主流程继续兼容 `MC_Para.xlsx`。

### 4.5 工作流面板

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

#### 模板中心

- 展示模板列表，包含名称、简介、适用场景、来源项目、更新时间和结构摘要。
- 支持模板搜索、排序，以及卡片/紧凑列表两种展示方式。
- 支持从模板创建项目，复用现有 `project:create` 的 template 选项。
- 支持当前项目另存为模板，复用现有 `project:saveAsExample` 能力。
- 支持编辑模板基础信息，包括模板名称、简介、适用场景、输入要求和输出说明。
- 支持删除模板，但删除前必须二次确认。
- 支持模板详情查看，展示模板说明和文件结构预览。

#### 目录命名迁移

- 新增 `template/` 作为项目模板主目录。
- 保留 `example/` 作为兼容目录，旧用户数据和旧打包资源不立即失效。
- 新增 `getTemplateDir()`，旧 `getExampleDir()` 转为兼容入口。
- 新增 `listTemplates`、`saveAsTemplate`、`updateTemplateMeta`、`deleteTemplate` 等模板语义接口。
- 保留 `listExamples`、`saveAsExample` 作为兼容接口，内部转调新模板接口。

#### 可调整布局

- Sidebar 支持拖动调整宽度。
- BottomPanel 支持拖动调整高度。
- 项目中心、模板中心内部关键区域支持拖动分隔。
- 布局尺寸写入 UI store，并通过持久化机制保留。
- 提供合理最小/最大尺寸，避免拖动后界面不可用。

#### 工作区索引现代化

- 新增 `workspace/mc-workspace.json` 作为结构化索引文件。
- 项目列表优先使用结构化索引，不存在时从目录扫描或 `MC_Para.xlsx` 兼容恢复。
- 创建、删除、重命名或模板创建项目时同步更新索引。
- `MC_Para.xlsx` 继续保留，Python 渲染主流程第一轮不强制替换。
- 后续可逐步将 `MC_Para.xlsx` 变为兼容导入/导出格式。

#### 工作流面板

- 显示当前操作范围：单项目或批量项目。
- 显示准备状态：Excel、模板、para、output、yaml、output-label。
- 统一输出设置：配置文件/YAML，设备名/SN。
- 统一执行动作：渲染配置、生成 YAML、生成标签。
- 显示最近任务进度、成功消息和错误信息。
- 提供打开当前项目目录和打开最新输出的入口。
- 提供从模板创建项目和保存当前项目为模板的快捷入口，但详细展示与编辑仍由模板中心负责。

### 5.2 第一轮不纳入范围

- 不做全新 Dashboard 首页。
- 不改左侧 ActivityBar 主导航结构。
- 不接入真实 LLM 或 AI Hub。
- 不引入新的数据库、SQLite、项目索引文件或后台扫描服务。
- 不做跨项目文件树全量展开。
- 不做复杂项目标签体系。
- 不做模板版本管理、在线模板市场、模板评分、远程同步或社区分享。
- 不做模板内容的深度可视化编辑器，第一轮只维护模板元信息和文件结构预览。
- 不在第一轮彻底移除 `MC_Para.xlsx`，也不强制迁移所有 Python 渲染逻辑。
- 不引入 SQLite、外部数据库或后台常驻索引服务。
- 不做复杂的布局预设市场或多套布局方案，第一轮只做尺寸拖动和偏好持久化。
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

### 6.2 模板元信息

第一轮保留现有示例模板目录作为模板存储基础，在每个模板目录下新增轻量元信息文件，用于展示和编辑说明信息。

建议文件：`template.meta.json`

```json
{
  "name": "园区交换机标准模板",
  "description": "适用于园区接入交换机批量配置生成",
  "scenario": "园区网络 / 接入交换机 / 标准上线",
  "sourceProject": "project-a",
  "updatedAt": "2026-07-16T00:00:00.000Z",
  "inputRequirements": ["hostname 表", "connection 表", "parameter 表"],
  "outputDescription": "生成设备配置、YAML 中间文件和设备标签"
}
```

兼容规则：

- 没有 `template.meta.json` 的旧示例模板仍可展示，名称使用目录名，简介使用默认说明。
- 项目另存为模板时自动生成 `template.meta.json`。
- 编辑模板信息只修改 `template.meta.json`，不直接修改模板项目文件内容。

### 6.3 工作区索引

建议文件：`workspace/mc-workspace.json`

```json
{
  "version": 1,
  "updatedAt": "2026-07-16T00:00:00.000Z",
  "projects": [
    {
      "id": 1,
      "name": "test2",
      "path": "test2",
      "createdAt": "2026-07-16T00:00:00.000Z",
      "updatedAt": "2026-07-16T00:00:00.000Z",
      "lastOpenedAt": "2026-07-16T00:00:00.000Z",
      "status": {
        "hasExcel": true,
        "hasTemplates": true,
        "hasPara": true,
        "hasOutput": true,
        "hasYaml": true,
        "hasLabelOutput": true
      }
    }
  ],
  "templates": [
    {
      "id": "campus-switch-standard",
      "name": "园区交换机标准模板",
      "path": "template/campus-switch-standard",
      "description": "适用于园区接入交换机批量配置生成",
      "sourceProject": "test2",
      "updatedAt": "2026-07-16T00:00:00.000Z"
    }
  ]
}
```

兼容规则：

- 没有 `mc-workspace.json` 时，从项目目录扫描恢复基础索引。
- 发现 `MC_Para.xlsx` 时，可作为补充来源读取项目编号和名称。
- 新增、删除、从模板创建项目时同步写入索引。
- Python 渲染流程第一轮仍可以继续调用 `read_MC_para('MC_Para.xlsx')`，避免一次性破坏后端主流程。

### 6.4 布局尺寸偏好

布局尺寸建议写入 `useUIStore` 的持久化状态。

```ts
layoutSizes: {
  sidebarWidth: number
  bottomPanelHeight: number
  explorerProjectListHeight: number
  templateListHeight: number
}
```

约束：

- Sidebar 设置最小和最大宽度，避免覆盖编辑区。
- BottomPanel 设置最小和最大高度，避免遮挡主编辑区。
- 中栏内部拖动只影响当前面板，不影响其他 Activity 面板默认布局。

### 6.5 批量范围

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

src/components/sidebar/template/
├─ TemplateCenterPanel.tsx
├─ TemplateListToolbar.tsx
├─ TemplateCard.tsx
├─ TemplateDetail.tsx
└─ TemplateEditDialog.tsx

src/components/sidebar/workbench/
├─ WorkbenchScopeCard.tsx
├─ WorkbenchReadinessCard.tsx
├─ WorkbenchActionGrid.tsx
└─ WorkbenchResultCard.tsx

src/components/layout/
└─ ResizableAppLayout.tsx

src/services/
└─ workspaceIndexService.ts
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

### 7.5 TemplateCenterPanel

职责：模板中心容器，负责读取模板列表、维护搜索/排序/视图状态，并协调模板详情和编辑弹窗。

### 7.6 TemplateListToolbar

职责：模板搜索、排序、卡片/列表视图切换和模板数量展示。

### 7.7 TemplateCard

职责：展示模板名称、简介、适用场景、来源项目、更新时间、结构摘要和主要操作入口。

### 7.8 TemplateDetail

职责：展示模板说明、输入要求、输出结构和文件结构预览。

### 7.9 TemplateEditDialog

职责：创建或编辑 `template.meta.json` 中的基础信息。项目另存为模板时复用该弹窗收集名称、简介和适用场景。

### 7.10 WorkbenchScopeCard

职责：显示当前操作范围，区分单项目和批量项目。

### 7.6 WorkbenchReadinessCard

职责：显示 Excel、模板、para、output、yaml、output-label 的准备状态。

### 7.7 WorkbenchActionGrid

职责：集中渲染主要动作按钮，包括渲染配置、生成 YAML、生成标签。

### 7.8 WorkbenchResultCard

职责：展示最新状态消息、错误列表、打开目录和查看输出入口。

## 8. 数据流

```text
workspaceIndexService
  ├─ 读取 / 写入 workspace/mc-workspace.json
  ├─ 不存在索引时扫描 workspace 项目目录
  ├─ 兼容读取 MC_Para.xlsx 作为补充来源
  └─ 在项目增删、模板创建项目时同步索引

Template directory layer
  ├─ 优先使用 template/
  ├─ fallback 到 example/
  ├─ 新接口使用 Template 命名
  └─ 旧 Example 接口转调 Template 接口

ResizableAppLayout
  ├─ 从 useUIStore 读取布局尺寸
  ├─ 通过拖拽更新 Sidebar 宽度和 BottomPanel 高度
  └─ 将尺寸偏好持久化

ExplorerPanel
  ├─ 读取 useProjectStore.projects / selectedProject
  ├─ 维护搜索、排序、本地项目勾选状态
  ├─ 同步勾选结果到 useRenderStore.selectedProjectIds
  └─ 渲染 ProjectListToolbar / ProjectListItem / ProjectBatchBar

TemplateCenterPanel
  ├─ 读取模板列表和 template.meta.json
  ├─ 维护模板搜索、排序、视图状态
  ├─ 调用从模板创建项目接口
  ├─ 调用项目另存为模板接口
  ├─ 调用模板元信息编辑/删除接口
  └─ 渲染 TemplateToolbar / TemplateCard / TemplateDetail / TemplateEditDialog

WorkbenchPanel
  ├─ 读取 useProjectStore.selectedProject
  ├─ 读取 useRenderStore.selectedProjectIds / config / progress / errors
  ├─ 根据选中范围计算执行 ids
  ├─ 根据项目参数接口读取当前项目结构
  ├─ 提供模板快捷动作入口
  └─ 渲染 Scope / Readiness / Action / Result 卡片
```

项目结构读取第一轮沿用现有 `window.electron.project.parameters(projectId)` 或已有结构接口，避免新增后端协议。若现有结构信息不足，再在实施阶段局部扩展 IPC 返回字段。

模板读取第一轮复用现有 `project:listExamples` 作为列表基础，扩展为返回模板元信息的接口；复用 `project:create` 的 `{ template }` 选项作为从模板建项目的执行路径；复用并增强 `project:saveAsExample` 作为项目另存为模板的执行路径。

## 9. 错误处理

- 执行动作前，如果没有当前项目或批量选择，按钮置灰。
- 批量操作时，如果部分项目状态不完整，第一轮不阻塞执行，但在准备状态中提示风险。
- 渲染、YAML、标签生成失败时，继续使用 `useRenderStore.errors` 和 `currentMessage` 展示错误。
- 打开目录或输出失败时使用现有 Toast 提示。
- 从模板创建项目时，如果项目名重复或模板不存在，弹窗内显示错误并保留用户输入。
- 项目另存为模板时，如果模板名重复或非法，弹窗内显示错误并阻止覆盖。
- 删除模板必须二次确认，且第一轮不允许删除正在作为默认选项使用的模板。

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
9. 模板中心能展示旧示例模板，即使模板目录没有 `template.meta.json`。
10. 当前项目可以另存为模板，并生成可编辑的模板元信息。
11. 可以从模板创建新项目，新项目创建后能被项目中心选中并进入工作流。
12. 可以编辑模板名称、简介、适用场景、输入要求和输出说明。
13. 删除模板前有二次确认，删除后模板列表刷新。
14. `template/` 目录存在时优先读取模板，只有旧目录存在时仍能读取 `example/`。
15. 旧 `listExamples` / `saveAsExample` 调用路径仍可工作，新模板接口也可工作。
16. 首次启动没有 `mc-workspace.json` 的工作区时，可以自动从目录或 `MC_Para.xlsx` 恢复项目列表。
17. 新建项目、删除项目、从模板创建项目后，`mc-workspace.json` 会同步更新。
18. Sidebar 宽度、BottomPanel 高度和中栏内部区域支持拖动，重启后保持上次尺寸。

## 11. 实施顺序建议

1. 建立兼容迁移层：新增 `template/` 主目录、`getTemplateDir()` 和模板语义 IPC，保留 `example/` fallback 与旧接口。
2. 引入 `mc-workspace.json` 基础索引服务，支持不存在索引时从目录或 `MC_Para.xlsx` 恢复。
3. 实现可拖动应用布局：Sidebar 宽度、BottomPanel 高度、关键中栏区域高度，并持久化尺寸。
4. 提取项目中心子组件，但保持现有行为不变。
5. 将项目多选状态与 `useRenderStore.selectedProjectIds` 做单向同步。
6. 增加项目状态徽标的轻量计算与展示。
7. 扩展模板元信息模型和 IPC：列表、读取、编辑、删除、另存为模板。
8. 实现模板中心展示：搜索、排序、卡片/列表、详情、编辑弹窗。
9. 打通从模板创建项目和项目另存为模板的闭环。
10. 重组 `WorkbenchPanel` 为流程化卡片，并加入模板快捷动作入口。
11. 统一工作台执行范围计算逻辑。
12. 增加结果入口和错误反馈区域。
13. 执行类型检查和构建验证。

## 12. 风险与缓解

| 风险 | 影响 | 缓解 |
|------|------|------|
| `ExplorerPanel` 和 `WorkbenchPanel` 已经偏大 | 修改容易引入回归 | 先提取纯展示子组件，保持 store 行为不变 |
| 项目状态需要额外文件系统信息 | 可能需要扩展 IPC | 第一轮只用现有结构字段，必要时小范围扩展 |
| 批量操作和当前项目操作范围混淆 | 可能误操作 | UI 明确显示“当前项目”或“已选择 N 个项目”，执行函数统一从一个 helper 取 ids |
| 多语言文案增加 | 可能出现缺 key | 第一轮优先补 zh-CN 和 en，其他语言使用短英文兜底或同步补齐 |
| 旧示例模板没有说明信息 | 模板中心展示内容不足 | 缺少 `template.meta.json` 时使用目录名和默认说明兜底 |
| 模板编辑误改项目文件 | 影响模板可用性 | 第一轮只编辑 `template.meta.json`，不直接改模板内容文件 |
| 模板删除误操作 | 丢失可复用资产 | 删除前二次确认，后续可考虑回收站或备份机制 |
| `example` 改名影响旧用户数据 | 旧模板无法识别 | 新增 `template/` 优先、`example/` fallback 的兼容层，旧接口保留 |
| `MC_Para.xlsx` 直接替换风险高 | Python 主流程可能回归 | 第一轮只做 `mc-workspace.json` 旁路索引，后端渲染继续兼容 Excel |
| 布局拖动后界面异常 | 用户可能把关键区域拖到不可用 | 设置最小/最大尺寸，并提供默认尺寸兜底 |

## 13. 验收结论

Phase 1-A 第一轮完成后，MagicCommander 应具备更清晰的多项目操作能力、模板资产复用能力、可调整工作区布局和工作台流程闭环。项目可以沉淀为模板，模板可以快速创建新项目，`template/` 将成为新的模板主目录且兼容旧 `example/`，`mc-workspace.json` 将作为新的结构化工作区索引基础且兼容旧 `MC_Para.xlsx`。工作台可以围绕单项目或批量项目完成检查、执行和查看结果。这将为后续 Phase 1-B 的渲染准确率检查、模板变量校验、输出历史对比、模板资产质量评级、彻底弱化 `MC_Para.xlsx`，以及 Phase 2 AI Hub 的智能建议入口打基础。
