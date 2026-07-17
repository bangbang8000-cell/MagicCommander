# MagicCommander V3 可落地开发计划与进展记录

> 基于已批准的 `.trae/specs/evaluate-v3-roadmap/spec.md`、`tasks.md`、`checklist.md` 落地。本文档只定义计划、验收与进展记录，不代表已进入业务代码开发。

## 1. 文档状态

| 项目 | 内容 |
|------|------|
| 文档版本 | v1.2 |
| 创建日期 | 2026-07-16 |
| 当前状态 | Phase 1 全部完成并发布 v3.1.1；Chat UI 壳（含附件上传框架和 Agent Tool 接口预留）、品牌升级、模板库、UI/UX 优化（子页签、菜单栏重构、ActivityBar 精简）已实施。Phase 2 (AI Hub MVP) 已规划 Agent + 多 Provider 架构，等待用户批准。 |
| 应用事实基线 | MagicCommander V3.1.1 Build 26071703 |
| 技术栈事实基线 | Electron 28、React 18、TypeScript 5.3、Vite 5、Zustand 4、Python 3 |
| 计划来源 | `.trae/specs/evaluate-v3-roadmap/spec.md`、`.trae/specs/evaluate-v3-roadmap/tasks.md`、`.trae/specs/evaluate-v3-roadmap/checklist.md` |
| 约束 | 用户批准前不修改业务代码；重大 Phase 完成后必须更新本文档并提醒发布到 GitHub |

## 2. 基线修正

### 2.1 采用当前仓库事实基线

后续 V3 计划统一以当前仓库实现为准：

- 应用版本：V3.1.0 Build 26071702。
- `package.json` 版本：3.1.0。
- 技术栈：Electron 28、React 18、TypeScript 5.3、Vite 5、Zustand 4。
- 验证命令必须使用当前仓库存在的脚本和测试入口。

### 2.2 明确过时假设

以下内容来自旧 PRD、旧开发规范或旧 Phase 0 计划，后续不再作为默认执行前提：

- 不再以 V3.0.0/V3.0.1 作为实施基线。
- 不把 Electron 34、React 19、TypeScript 5.7 升级列为 V3.1/V3.2 默认任务。
- 不使用当前不存在的 `npm run build:win`。
- Ruff 暂不作为当前强制门禁，除非后续新增配置并获得用户批准。
- Phase 0 不追求 14 项技术债全部清零，只收口阻塞 Phase 1/Phase 2 的质量基线。
- 渲染缓存不作为 Phase 0 阻塞项，迁移到 Phase 1 准确率体验或后续性能优化。

## 3. 总体 Phase 路线

| Phase | 目标 | 范围边界 | 进入条件 | 完成标准 |
|-------|------|----------|----------|----------|
| Phase 0：质量基线收口 | 消除阻塞后续体验与 AI 能力建设的基础不稳定因素 | 项目创建权责统一、stdout JSON 协议与日志边界、核心测试门禁、前端关键错误处理、Electron dead code/console 清理 | 用户明确批准进入 Phase 0 | 关键路径测试与构建通过，计划进展已更新，提醒发布到 GitHub |
| Phase 1：体验与准确率升级 | 在不接入真实 LLM 的前提下提升工程使用体验、渲染准确率和界面可用性 | 布局基础、准确率体验、AI UI 壳、品牌升级、模板项目库；不做真实 LLM/API Key/AI 文件操作 | Phase 0 完成并获得继续开发指令 | 旧工作流可回退，新体验可本地验证，重大阶段进展已记录 |
| Phase 2：AI Hub MVP | 跑通真实 AI 基础链路，再扩展智能功能 | FastAPI 子进程、健康检查、SSE streaming、Provider 配置、Prompt 管理、密钥本地安全存储、ChatPanel 真实流式响应 | Phase 1 完成并获得继续开发指令 | AI Hub MVP 可启动、可健康检查、可流式响应，安全边界与验证完成 |

## 4. 验证命令门禁

### 4.1 前端、Electron 与打包验证

重大 Phase 完成时，默认执行或提醒执行：

```bash
npm run lint
npm run format:check
npm run test
npm run typecheck
npm run build
```

Windows 安装包验证使用：

```bash
npm run dist:win
```

### 4.2 Python 验证

```bash
python -m pytest backend/tests/ -v
```

### 4.3 Phase 内迭代验证

Phase 内小迭代完成时，以本地开发环境验证为主；不强制每个小迭代都发布到 GitHub。若小迭代触及构建、测试、依赖、IPC、Python CLI 或数据写入路径，则应追加对应的局部门禁验证。

## 5. Phase 0：质量基线收口计划

### 5.1 目标

Phase 0 只处理阻塞 Phase 1/Phase 2 的稳定性问题，避免把旧计划中的所有技术债一次性塞入当前阶段。核心目标是让现有项目、模板、Excel、渲染链路在后续体验升级和 AI Hub 接入前具备可测试、可回归、可定位问题的基础。

### 5.2 实施清单

| 编号 | 工作项 | 具体范围 | 不做内容 | 验收方式 |
|------|--------|----------|----------|----------|
| P0-1 | 项目创建权责统一 | 统一 Electron 与 Python 对项目目录、`MC_Para.xlsx`、`para.xlsx` 的创建/同步职责，优先消除双实现分歧 | 不引入模板市场，不改造项目模型为全新格式 | Electron 创建项目与 Python CLI 创建项目结构一致；关键路径测试覆盖 |
| P0-2 | stdout JSON 协议与日志边界 | 明确 Python stdout 中 JSON 事件输出与 logging 输出边界，保留协议输出，避免误替换 `_emit_progress` 等协议 print | 不要求一次性清理所有非关键 debug 输出 | 渲染进度事件仍可被 Electron 正确解析；日志输出不污染协议通道 |
| P0-3 | 核心测试门禁 | 增补 Electron 关键 IPC 测试、Python 项目/渲染端到端测试、撤销链路或等价安全回退测试 | 不追求全量覆盖率指标，不引入 Ruff 强制门禁 | `npm run test`、`python -m pytest backend/tests/ -v` 通过 |
| P0-4 | 前端关键错误处理 | 收口影响项目打开、渲染、保存、输出查看的关键错误处理路径 | 不全面替换所有 UI 提示体系 | 错误能被用户可见地反馈，并进入日志或状态记录 |
| P0-5 | Electron dead code/console 清理 | 清理确认未使用的 Electron 死代码和影响诊断质量的散落 console 输出 | 不进行框架大版本升级，不重构所有服务层 | `npm run lint`、`npm run typecheck` 通过 |
| P0-6 | J2 模板渲染改进 | 保留 Monaco Editor 框架，接入 Better Jinja (samuelcolvin/jinjahtml-vscode) 的 TextMate 语法文件，通过 `vscode-textmate` + `vscode-oniguruma` (WASM) 替换自定义 Monarch Tokenizer，实现与 VS Code 一致的 Jinja2 语法高亮 | 不替换 Monaco Editor 框架（CodeMirror 6 无 Jinja2 包，替换成本过高）；不引入非 Microsoft 官方的 TextMate 桥接库 | `.j2` 文件语法高亮与 VS Code Better Jinja 插件效果一致；`npm run build` 通过，WASM 文件正确打包 |
| P0-7 | 标签 MD 渲染 | 将标签生成从纯 Word 改为 MD 为主要输出格式，保留 Word 导出作为打印备选；更新输出目录、IPC 链路、前端状态管理 | 不删除现有 Word 生成能力，不改变标签数据源（Excel 主机表） | 点击"生成标签"后 `output-label-md/` 目录产出生效的 `.md` 文件；Word 导出仍可用 |
| P0-8 | MD 文件查看与打印导出 | 将 MarkdownViewer 集成到 EditorArea 编辑区路由；添加 `markdown` FileType；OutputPanel 展示标签 MD 文件；SearchPanel 支持 MD 文件类型过滤；LabelPanel 增加导出 Word/PDF 按钮 | 不引入 pandoc 等重型外部依赖 | 点击 `.md` 文件在编辑区渲染预览；搜索可过滤 MD 文件；输出面板可查看标签 MD 文件；标签面板可导出 Word/PDF |

### 5.3 Phase 0 任务顺序

1. 先确认项目创建链路当前实际行为，明确 Electron/Python 哪一侧拥有写入权责。
2. 再处理 stdout JSON 协议与 logging 边界，避免后续测试误判。
3. 补齐关键自动化测试，使后续重构有保护网。
4. 收口前端关键错误处理，优先覆盖用户会遇到的失败路径。
5. 清理 dead code/console，并执行阶段验收命令。
6. **（新增）** 修复 J2 模板 Monaco Tokenizer 语法高亮，解决 Jinja2 模板渲染不准确问题。
7. **（新增）** 实现标签 MD 渲染，将标签生成从纯 Word 改为 MD 为主要输出格式。
8. **（新增）** 集成 MD 文件查看器、添加搜索/输出面板 MD 支持、实现标签 Word/PDF 导出。

### 5.4 Phase 0 暂缓项

以下内容从旧 Phase 0 计划降级，不阻塞 Phase 0 完成：

- 渲染缓存机制：迁移至 Phase 1 准确率体验或性能优化子阶段。
- Ruff 全量门禁：等待仓库新增 Ruff 配置并获批准后再纳入。
- Electron/React/TypeScript 大版本升级：单独制定技术升级规格。
- 全量 print 替换：只处理会污染协议、影响诊断或阻塞验收的输出。
- 全量 ErrorService 化：先覆盖关键路径，后续逐步整理。

### 5.5 Phase 0 新增特性：详细分析与实施方案

#### 5.5.1 P0-6：J2 模板渲染改进（重新评估版）

**编辑器框架选型评估：**

| 方案 | J2 支持 | 依赖数 | 改动量 | 包体积 | 推荐 |
|------|---------|--------|--------|--------|------|
| **Monaco Editor + TextMate 语法** | ✅ VS Code 级 Jinja2 高亮（使用 Better Jinja 的 tmLanguage.json） | +2 (`vscode-oniguruma`, `vscode-textmate`) | 中（替换 Tokenizer 注册逻辑） | 新增 ~500KB WASM | ⭐ **推荐** |
| 修复 Monarch Tokenizer | ⚠️ 受限于 Monarch 能力，无法实现嵌套语言嵌入 | 0 | 小（仅改 Tokenizer 规则） | 无变化 | ❌（用户要求更好方案） |
| CodeMirror 6 替换 | ❌ 无现成 Jinja2 包，需自写 Lezer/StreamLanguage 解析器 | +10+ | 极大（全编辑器重写） | 减少 ~4MB | ❌（投入产出比低） |
| Ace / Prism.js / Highlight.js | ⚠️ 编辑器功能不足，仅语法高亮 | 不定 | 大 | 减少但功能降级 | ❌（不适合编辑器场景） |

**是否替换 Monaco Editor 的结论：不建议替换。**

理由：
1. Monaco Editor 是 VS Code 的编辑器引擎，业界标准，功能最完整
2. 当前项目已深度集成 Monaco（双屏滚动同步、光标追踪、ResizeObserver 自适应、Ctrl+S、i18n 工具栏等），替换成本极高
3. CodeMirror 6 虽然更轻量，但无 Jinja2 语言包，需自写解析器，且所有现有编辑器功能都需重写
4. 作为 Electron 桌面应用，Monaco 的包体积不是瓶颈
5. YAML、Markdown、JSON、Python 等语言 Monaco 内置支持已足够好

**最终技术方案：Monaco Editor + TextMate 语法高亮（Better Jinja 语法）**

利用 VS Code 生态中成熟的 Jinja2 TextMate 语法文件，通过 `vscode-textmate` + `vscode-oniguruma` (WASM) 接入 Monaco Editor，获得与 VS Code 完全一致的 Jinja2 语法高亮效果。

**TextMate 语法来源：** [samuelcolvin/jinjahtml-vscode](https://github.com/samuelcolvin/jinjahtml-vscode)（MIT License，164 Stars，VSCode 官方市场推荐插件）

该扩展提供以下能力：
- `source.jinja` 基础语法（`{% %}` / `{{ }}` / `{# #}` 三件套 + 关键字 + 过滤器）
- `text.html.jinja` 组合语法（Jinja2 + HTML 嵌套，即 `.j2` 文件最常用场景）
- 支持 20+ 种宿主语言的 Jinja2 组合语法（HTML、YAML、Markdown、JSON、Python、CSS、JS、XML、SQL 等）

**技术实现路径：**

1. **安装依赖**：`vscode-oniguruma`（WASM 正则引擎）、`vscode-textmate`（TextMate 语法解析器）
2. **下载语法文件**：从 `jinjahtml-vscode/syntaxes/` 获取 `jinja.tmLanguage.json` 和 `jinja-html.tmLanguage.json`
3. **创建 TokenizerProvider**：封装 `vscode-textmate` 的 `Registry` + `Grammar`，实现 Monaco 的 `EncodedTokensProvider` 接口
4. **注册到 Monaco**：通过 `monaco.languages.setTokensProvider('jinja', provider)` 替换现有 Monarch Tokenizer
5. **CSS 主题**：TextMate scope 到 CSS 颜色的映射（利用 Monaco 内置主题的 token 颜色）

**涉及文件：**

| 文件 | 改动内容 |
|------|----------|
| [MonacoEditor.tsx](file:///d:/MyCoding/MagicCommander/MagicCommander3/src/components/editor/MonacoEditor.tsx) | 移除 Monarch Tokenizer 注册代码（~130 行），替换为 TextMate TokenizerProvider 初始化 |
| `src/editor/jinja-textmate.ts`（新增） | TextMate Registry 封装、Grammar 加载、EncodedTokensProvider 实现 |
| `src/editor/jinja-html.tmLanguage.json`（新增） | 从 Better Jinja 扩展提取的语法文件（静态资源） |
| `src/editor/jinja.tmLanguage.json`（新增） | 从 Better Jinja 扩展提取的基础语法文件（静态资源） |
| `package.json` | 新增 `vscode-oniguruma`、`vscode-textmate` 依赖 |
| `vite.config.ts` | 配置 WASM 文件复制到构建输出 |

**新增依赖：**

| 包 | 版本 | 用途 | 大小 |
|----|------|------|------|
| `vscode-oniguruma` | ^1.7.0 | WASM 版 Oniguruma 正则引擎（Microsoft 官方维护） | ~200KB |
| `vscode-textmate` | ^9.1.0 | TextMate 语法解析器（Microsoft 官方维护） | ~100KB |

**验收标准：**
- `.j2` 文件打开后，Jinja2 语法高亮与 VS Code 中安装 Better Jinja 插件效果一致
- 以下元素有明确视觉区分：Jinja2 关键字（`if`/`for`/`set` 等）、变量表达式 `{{ }}`、语句块 `{% %}`、注释 `{# #}`、HTML 标签、属性、字符串、数字、过滤器管道符
- 暗色/亮色主题切换后所有 token 颜色正确
- 不影响 YAML、Markdown 等其他文件类型的编辑体验
- `npm run build` 通过，WASM 文件正确打包

---

#### 5.5.2 P0-7：标签 MD 渲染

**现状分析：**

当前标签生成使用 [ExcelToLabel.py](file:///d:/MyCoding/MagicCommander/MagicCommander3/backend/ExcelToLabel.py) 中的 `exceltolabel()` 函数，通过 `python-docx` 生成 `.docx` Word 文件。问题：
1. 程序内置的 WordViewer 依赖 `docx-preview` 库，渲染效果有限，无法完美展示表格。
2. 用户无法在程序内部直接查看标签内容，需要借助外部 Word 应用。

**技术方案：**

1. **Python 后端新增 `exceltomarkdown()`**：从 Excel 主机表读取设备数据，生成 Markdown 格式的标签文件（表格形式），保存到 `workspace/<项目名>/output-label-md/<时间戳>_label.md`。
2. **保留 Word 生成**：`exceltolabel()` 保持不变，作为 Word 导出的备选路径。
3. **新增 CLI 命令**：`python main.py label md <ids> [--config <json>]`，与现有 `label print` 并列。
4. **IPC 链路**：Electron 新增 `feature:label-md` IPC handler，前端新增 `labelMd` store action。

**MD 标签格式设计：**

```markdown
# 设备标签 - 项目名

## 设备名 (角色)
| 属性 | 值 |
|------|----|
| 设备名 | XXX |
| SN | XXX |
| 型号 | XXX |
| 角色 | XXX |
| 楼层 | XXX |
| 机柜 | XXX |
| U数 | XXX |
| 管理IP | XXX |
| 管理接口 | XXX |

---
```

**涉及文件：**

| 文件 | 改动内容 |
|------|----------|
| [ExcelToLabel.py](file:///d:/MyCoding/MagicCommander/MagicCommander3/backend/ExcelToLabel.py) | 新增 `exceltomarkdown()` 函数，生成 MD 表格格式标签 |
| [main.py](file:///d:/MyCoding/MagicCommander/MagicCommander3/backend/main.py) | 新增 `label md` 子命令解析 |
| [pre_processing.py](file:///d:/MyCoding/MagicCommander/MagicCommander3/backend/pre_processing.py) | 新增 `label-md` feature 类型调度 |
| [render.handler.ts](file:///d:/MyCoding/MagicCommander/MagicCommander3/electron/ipc/render.handler.ts) | 新增 `labelMd()` 方法 |
| [handlers.ts](file:///d:/MyCoding/MagicCommander/MagicCommander3/electron/ipc/handlers.ts) | 注册 `feature:label-md` IPC handler |
| [preload.ts](file:///d:/MyCoding/MagicCommander/MagicCommander3/electron/preload.ts) | 暴露 `labelMd` API |
| [render.store.ts](file:///d:/MyCoding/MagicCommander/MagicCommander3/src/stores/render.store.ts) | 新增 `labelMd` action |
| [render.ts](file:///d:/MyCoding/MagicCommander/MagicCommander3/src/types/render.ts) | 新增 MD 标签相关类型 |
| [ipc.ts](file:///d:/MyCoding/MagicCommander/MagicCommander3/src/types/ipc.ts) | 新增 `labelMd` API 声明 |
| 无新增依赖 | 使用 Python 标准库生成 MD，无需额外 npm/pip 包 |

**验收标准：** 点击"生成标签"后 `output-label-md/` 目录产出生效的 `.md` 文件；Word 导出仍可用；生成的 MD 文件在程序内可查看。

---

#### 5.5.3 P0-8：MD 文件查看与打印导出

**现状分析：**

1. [MarkdownViewer.tsx](file:///d:/MyCoding/MagicCommander/MagicCommander3/src/components/common/MarkdownViewer.tsx) 已实现完整的 MD 渲染组件（`react-markdown` + `remark-gfm`），包含目录导航、暗色/亮色主题、表格/代码块样式。但当前是**模态弹窗**组件，未被 [EditorArea.tsx](file:///d:/MyCoding/MagicCommander/MagicCommander3/src/components/editor/EditorArea.tsx) 编辑器路由引用。
2. `.md` 文件在 [getFileTypeFromPath](file:///d:/MyCoding/MagicCommander/MagicCommander3/src/types/editor.ts) 中映射为 `text` 类型，走 MonacoEditor 代码编辑模式，不是渲染预览。
3. [OutputPanel.tsx](file:///d:/MyCoding/MagicCommander/MagicCommander3/src/components/sidebar/OutputPanel.tsx) 的 `OUTPUT_DIR_NAMES` 不包含 `output-label-md`。
4. [SearchPanel.tsx](file:///d:/MyCoding/MagicCommander/MagicCommander3/src/components/sidebar/SearchPanel.tsx) 的 `FILE_TYPE_FILTERS` 将 `.md` 归入 `txt` 过滤组，没有独立的 MD 过滤组。
5. [LabelPanel.tsx](file:///d:/MyCoding/MagicCommander/MagicCommander3/src/components/sidebar/LabelPanel.tsx) 只有一个"打印标签"按钮，没有 Word/PDF 导出选项。

**技术方案：**

**A. MarkdownViewer 改造为内联编辑器组件**

1. 新增 `viewMode` prop：`preview`（渲染预览）/ `source`（Monaco 源代码编辑），默认为 `preview`。
2. 当 `viewMode='preview'` 时，渲染 Markdown 内容（复用 react-markdown 逻辑）。
3. 当 `viewMode='source'` 时，委托 MonacoEditor 进行源代码编辑。
4. 组件顶部添加工具栏：文件标题、预览/源码切换按钮、目录开关。
5. 移除模态弹窗的 `fixed inset-0` 定位，改为 `w-full h-full` 填充编辑器区域。

**B. 编辑器路由集成**

1. 添加 `markdown` 到 `FileType` 联合类型。
2. `getFileTypeFromPath` 中将 `.md` 映射为 `markdown`（而非 `text`）。
3. `EditorArea.tsx` 的 `renderEditor` 中新增 `case 'markdown'` 路由到 `MarkdownViewer`。
4. `FILE_TYPE_ICONS` 中添加 `markdown` 图标（使用 `FileText` 或 `ScrollText`）。
5. 安全白名单 `.md` 已存在，无需修改。

**C. 输出面板与搜索集成**

1. `OutputPanel.tsx` 的 `OUTPUT_DIR_NAMES` 添加 `output-label-md`，图标使用 `Tag`。
2. `SearchPanel.tsx` 的 `FILE_TYPE_FILTERS` 添加独立 `md` 过滤组：`exts: ['md', 'markdown']`。

**D. Word/PDF 导出**

**Word 导出**：LabelPanel 新增"导出 Word"按钮，触发 `feature:label-print` IPC（复用现有 `exceltolabel()` 生成 .docx）。

**PDF 导出**：利用 Electron 内置打印能力：
1. 在 MarkdownViewer 渲染 MD 内容后，使用 Electron `webContents.printToPDF()` 生成 PDF。
2. 或通过 IPC 调用主进程打开打印对话框（`webContents.print()`），用户选择"另存为 PDF"。
3. 优先采用方案：LabelPanel 新增"导出 PDF"按钮，触发 IPC 读取 MD 文件内容，在主进程创建隐藏 BrowserWindow 渲染 MD 为 HTML，调用 `printToPDF()` 保存。

**涉及文件：**

| 文件 | 改动内容 |
|------|----------|
| [MarkdownViewer.tsx](file:///d:/MyCoding/MagicCommander/MagicCommander3/src/components/common/MarkdownViewer.tsx) | 重构为内联编辑器组件，支持 preview/source 模式切换，通过 IPC 读取文件 |
| [EditorArea.tsx](file:///d:/MyCoding/MagicCommander/MagicCommander3/src/components/editor/EditorArea.tsx) | 新增 `case 'markdown'` 路由，导入 MarkdownViewer |
| [editor.ts](file:///d:/MyCoding/MagicCommander/MagicCommander3/src/types/editor.ts) | `FileType` 添加 `'markdown'`；`getFileTypeFromPath` 映射 `.md` 为 `'markdown'` |
| [icons.ts](file:///d:/MyCoding/MagicCommander/MagicCommander3/src/config/icons.ts) | `FILE_TYPE_ICONS` 添加 `markdown` 图标 |
| [OutputPanel.tsx](file:///d:/MyCoding/MagicCommander/MagicCommander3/src/components/sidebar/OutputPanel.tsx) | `OUTPUT_DIR_NAMES` 添加 `'output-label-md'`，配置图标和中英文标签 |
| [SearchPanel.tsx](file:///d:/MyCoding/MagicCommander/MagicCommander3/src/components/sidebar/SearchPanel.tsx) | `FILE_TYPE_FILTERS` 添加独立 `md` 过滤组 |
| [LabelPanel.tsx](file:///d:/MyCoding/MagicCommander/MagicCommander3/src/components/sidebar/LabelPanel.tsx) | 新增"导出 Word"和"导出 PDF"按钮 |
| [handlers.ts](file:///d:/MyCoding/MagicCommander/MagicCommander3/electron/ipc/handlers.ts) | 新增 `label:export-pdf` IPC handler |
| [preload.ts](file:///d:/MyCoding/MagicCommander/MagicCommander3/electron/preload.ts) | 暴露 `exportPdf` API |
| 无新增依赖 | 利用现有 `react-markdown`、`remark-gfm`、Electron 内置 API |

**验收标准：**
- 点击 `.md` 文件在编辑区以渲染预览模式打开，可切换到源码模式编辑。
- 搜索面板可独立过滤 MD 文件类型。
- 输出面板可查看 `output-label-md` 目录下的标签 MD 文件。
- 标签面板可导出 Word（.docx）和 PDF。

### 6.1 Phase 1-A：布局基础

| 工作项 | 内容 | 验收要点 |
|--------|------|----------|
| 三列布局基础 | 建立左侧项目/资源区、中间编辑/预览区、右侧上下文/输出区 | 旧布局可回退或通过 feature flag 控制 |
| 右侧面板 | 输出、日志、属性、帮助等上下文信息可承载 | 不破坏现有渲染与文件查看路径 |
| feature flag | 新旧体验切换，降低回归风险 | 本地开发环境可验证切换行为 |

### 6.2 Phase 1-B：准确率体验

| 工作项 | 内容 | 验收要点 |
|--------|------|----------|
| Jinja2 校验 | 提前发现模板语法错误、变量缺失风险 | 错误定位可读，避免只在渲染后失败 |
| Excel 数据校验 | 校验必要 sheet、列、空值、类型异常 | 常见数据问题有明确提示 |
| dry-run | 预演渲染，不写入最终输出或明确标记临时结果 | 不破坏真实输出目录 |
| diff 对比 | 展示本次渲染与已有输出差异 | 支持人工确认变更 |
| 搜索能力 | 项目、模板、输出内容基础搜索 | 结果定位可用 |

### 6.3 Phase 1-C：AI Chat UI 壳与品牌升级

| 工作项 | 内容 | 明确边界 |
|--------|------|----------|
| Chat UI 壳 | 输入栏、消息列表、模式切换、占位响应、附件上传 UI | 不接入真实 LLM；附件上传仅做 UI 框架，不实现后端分析 |
| 品牌升级 | 提升 V3 视觉一致性和可用性，统一 Loading/Empty 状态 | 不因视觉升级破坏核心工作流 |
| 模板项目库 | 梳理示例项目与模板入口 | 不实现在线模板市场 |

#### 6.3.1 Chat UI 壳详细设计

**设计目标：** 搭建现代化 Chat 面板框架，为 Phase 2 的 Agent + LLM 打下 UI 和数据基础。

**Chat 界面布局（参考 Trae Work 风格）：**

```
┌─────────────────────────────────────────┐
│  Chat                          [新建] [清空] │  ← 工具栏
├─────────────────────────────────────────┤
│  [模板帮助] [配置问答] [通用助手]          │  ← 模式切换
├─────────────────────────────────────────┤
│                                         │
│  ┌─────────────────────────────┐        │
│  │ 用户: 帮我创建一个ASW交换机配置  │        │  ← 用户消息
│  │ 📎 ASW_template.xlsx        │        │  ← 附件标记
│  └─────────────────────────────┘        │
│                                         │
│  ┌─────────────────────────────┐        │
│  │ AI: 好的，我来帮你分析...     │        │  ← AI 消息（含代码块）
│  │ ```yaml                      │        │
│  │ project: ASW_config          │        │
│  │ template: asw_switch_v2      │        │
│  │ ```                          │        │
│  └─────────────────────────────┘        │
│                                         │
├─────────────────────────────────────────┤
│  📎 上传附件  │ 输入消息...      │ 发送 → │  ← 输入栏
└─────────────────────────────────────────┘
```

**Phase 1-C 实现范围：**

| 子任务 | 内容 | 接口预留 |
|--------|------|----------|
| ChatPanel 主组件 | 消息列表 + 用户/AI 气泡 + 代码块渲染 + markdown 渲染 | 消息数据结构含 `attachments` 字段 |
| ChatInput 输入栏 | 文本输入 + 附件上传按钮 + 发送按钮 | 附件类型枚举：`template`/`excel`/`yaml`/`config`/`document` |
| AttachmentPreview 附件预览 | 附件卡片显示文件名、类型图标、大小 | `ChatAttachment` 接口定义完整 |
| ChatModeSwitch 模式切换 | 3 种预置模式（模板帮助/配置问答/通用助手） | 模式与 `systemPrompt` 映射 |
| ChatStore 状态管理 | 消息列表、会话管理、附件列表 | 会话持久化到 localStorage |
| 占位响应 | 根据模式返回硬编码示例回复 | 模拟 Agent 响应格式 |

**为 Phase 2 预留的数据结构：**

```typescript
// 消息结构（Phase 1-C 定义，Phase 2 不变）
interface ChatMessage {
  id: string
  role: 'user' | 'assistant' | 'system'
  content: string                    // Markdown 格式
  attachments?: ChatAttachment[]     // 附件列表（Phase 2 对接后端）
  timestamp: number
  mode: ChatMode
  metadata?: {
    tools?: string[]                 // Phase 2: Agent 调用的工具列表
    toolResults?: ToolResult[]       // Phase 2: 工具执行结果
  }
}

// 会话结构
interface ChatSession {
  id: string
  title: string
  messages: ChatMessage[]
  mode: ChatMode
  createdAt: number
  updatedAt: number
}

// 模式定义
type ChatMode = 'template' | 'config' | 'general'

// 附件类型
interface ChatAttachment {
  id: string
  name: string
  type: 'template' | 'excel' | 'yaml' | 'config' | 'document' | 'other'
  path: string
  size: number
  preview?: string                   // Phase 2: 文件内容预览
}
```

**实施顺序：**

| 步骤 | 内容 | 涉及文件 |
|------|------|----------|
| C-1.1 | ChatStore + 类型定义 | `src/stores/chat.store.ts`、`src/types/chat.ts`（新增） |
| C-1.2 | ChatPanel + ChatMessage + ChatInput 组件 | `src/components/chat/` 目录（新增 4 个文件） |
| C-1.3 | 右侧面板集成 Chat 标签 | `src/components/layout/RightPanel.tsx` |
| C-1.4 | i18n 翻译键值 | `src/i18n/locales/zh-CN/common.json`、`en/common.json` |

#### 6.3.2 品牌升级

| 子任务 | 内容 |
|--------|------|
| LoadingState 统一组件 | 骨架屏/Spinner，替换各面板临时加载文本 |
| EmptyState 统一组件 | 图标 + 描述 + 操作按钮，统一空状态视觉 |
| 颜色/间距一致性 | 检查 Tailwind 使用，确保 dark/light 主题可读性 |

#### 6.3.3 模板项目库梳理

| 子任务 | 内容 |
|--------|------|
| 模板元数据增强 | 补充 `template.meta.json`（场景、输入要求、输出说明） |
| 模板分类 | 按场景分类（交换机/路由器/防火墙等）

### 6.4 Phase 1-D：产品打磨与发布就绪

| 工作项 | 内容 | 验收要点 |
|--------|------|----------|
| README 文档更新 | 更新版本号、新增功能特性（模板中心、dry-run、校验、diff）、截图、路线图 | 版本号与 badge 一致，功能描述覆盖 Phase 1-A/1-B/1-C 新增能力 |
| 使用指南完善 | 更新 `public/docs/user-guide.zh-CN.md` 和 `user-guide.en.md`，补充模板中心、dry-run 预览、Jinja2/Excel 校验、diff 对比、从模板创建项目、搜索过滤、标签 MD/PDF 导出等新功能 | 中英文使用指南覆盖所有已实现功能；内容准确、步骤可操作 |
| 关于对话框优化 | 将 About 弹窗从 Header.tsx 抽取为独立组件 `AboutDialog.tsx`；补充开源许可、第三方依赖声明、GitHub 链接 | 关于对话框信息完整，组件可复用 |
| 自动检查更新 | 启动时自动检查更新（静默检查，有更新时通知）；`autoDownload` 改为 `true` 实现自动下载；下载完成后弹出提示框询问是否立即重启升级 | 启动后自动检查不阻塞；下载进度可见；下载完成有明确的重启提示 |

**自动更新详细设计：**

**现状：** `electron/services/update.service.ts` 已基于 `electron-updater` 实现检查/下载/安装链路，但 `autoDownload = false`（需手动触发下载），且无启动时自动检查。

**改造方案：**

1. `autoDownload` 改为 `true`，发现新版本后自动开始下载
2. 在 `app.whenReady()` 后延迟 3 秒调用 `updateService.checkForUpdates()` 进行启动时静默检查
3. 下载完成后通过 IPC 向渲染进程发送 `update-downloaded` 事件，渲染进程弹出确认对话框："新版本已下载，是否立即重启升级？"
4. 用户确认后调用 `quitAndInstall()`；用户取消则在下次启动时自动安装（`autoInstallOnAppQuit = true` 已设置）

**涉及文件：**

| 文件 | 改动内容 |
|------|----------|
| [README.md](file:///d:/MyCoding/MagicCommander/MagicCommander3/README.md) | 更新版本号 badge、功能列表、版本历史 |
| [user-guide.zh-CN.md](file:///d:/MyCoding/MagicCommander/MagicCommander3/public/docs/user-guide.zh-CN.md) | 补充新功能使用说明 |
| [user-guide.en.md](file:///d:/MyCoding/MagicCommander/MagicCommander3/public/docs/user-guide.en.md) | 英文版同步更新 |
| [update.service.ts](file:///d:/MyCoding/MagicCommander/MagicCommander3/electron/services/update.service.ts) | `autoDownload = true`；新增 `startupCheck()` 方法 |
| [main.ts](file:///d:/MyCoding/MagicCommander/MagicCommander3/electron/main.ts) | `app.whenReady()` 后调用启动时自动检查 |
| [Header.tsx](file:///d:/MyCoding/MagicCommander/MagicCommander3/src/components/layout/Header.tsx) | 抽取 AboutDialog 为独立组件；下载完成时弹出重启确认对话框 |
| `AboutDialog.tsx`（新增） | 独立的关于对话框组件 |

### 6.5 Phase 1 禁止项

Phase 1 不做以下事项：

- 不接入真实 LLM 调用。
- 不做 API Key 管理。
- 不允许 AI 执行真实文件操作。
- 不把智能项目初始化、配置反向生成、模板推荐、自动优化前置到 Phase 1。

## 7. Phase 2：AI Hub MVP 计划

### 7.0 架构总览

```
┌─────────────────────────────────────────────────────────┐
│                     ChatPanel (UI)                       │
│  Phase 1-C 已实现：消息列表、附件上传、模式切换、占位响应   │
├─────────────────────────────────────────────────────────┤
│                   IPC (main process)                     │
│  chat:send  chat:stream  chat:uploadAttachment           │
├─────────────────────────────────────────────────────────┤
│                Agent Layer (Python)                      │
│  ┌───────────────────────────────────────────────────┐  │
│  │  Hermes / Agent Framework                          │  │
│  │  - 工具调用编排 (Tool Calling)                      │  │
│  │  - 上下文管理 (附件 + 历史消息 + 项目上下文)          │  │
│  │  - 多步骤推理 (Chain-of-Thought)                   │  │
│  │  - 结果验证与回退                                   │  │
│  └───────────────────────────────────────────────────┘  │
│  ┌──────────┐  ┌──────────┐  ┌──────────────────────┐  │
│  │ DeepSeek │  │ OpenAI   │  │  Ollama (本地)        │  │
│  └──────────┘  └──────────┘  └──────────────────────┘  │
│  ┌───────────────────────────────────────────────────┐  │
│  │  Agent Tools (现有功能包装为 Tool)                   │  │
│  │  create_project    validate_template               │  │
│  │  create_template   render_config                   │  │
│  │  update_template   dry_run                         │  │
│  │  diff_compare      read_file                       │  │
│  │  search_files      validate_excel                  │  │
│  └───────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────┘
```

**设计原则：**
- Agent 层负责编排，LLM 层负责推理，Tools 层负责执行
- 附件内容作为上下文注入 Agent 的 system prompt / user prompt
- Agent 可选择调用多个 Tool 完成复杂任务（如：校验→修改→渲染→对比）
- Provider 可插拔切换（DeepSeek / OpenAI / Ollama），Agent 层不感知 Provider 差异

**Agent Tool 定义（Phase 2 实现，Phase 1-C 定义接口）：**

```typescript
interface AgentTool {
  name: string
  description: string       // LLM 用于判断何时调用此工具
  parameters: {             // JSON Schema 格式
    type: 'object'
    properties: Record<string, { type: string; description: string }>
    required: string[]
  }
}

// 预置工具集
const AGENT_TOOLS: AgentTool[] = [
  { name: 'create_project',      description: '创建新的配置项目，指定项目名称和模板来源' },
  { name: 'create_template',     description: '将现有项目保存为可复用模板' },
  { name: 'update_template',     description: '修改模板文件内容' },
  { name: 'render_config',       description: '执行配置渲染，生成设备配置文件' },
  { name: 'dry_run',             description: '预演渲染，预览结果但不写入文件' },
  { name: 'validate_template',   description: '校验 Jinja2 模板语法' },
  { name: 'validate_excel',      description: '校验 Excel 参数文件' },
  { name: 'diff_compare',        description: '对比渲染结果与已有输出差异' },
  { name: 'read_file',           description: '读取项目中的文件内容' },
  { name: 'search_files',        description: '按名称或内容搜索项目文件' },
  { name: 'list_projects',       description: '列出所有项目及其结构' },
]
```

### 7.1 MVP 范围

| 工作项 | 内容 | 验收要点 |
|--------|------|----------|
| FastAPI 子进程生命周期 | Electron 启停 Python AI 服务，处理异常退出与重启策略 | 可启动、可停止、失败可提示 |
| 健康检查 | 提供 health endpoint 或等价 IPC 健康状态 | UI 可展示服务状态 |
| Agent 框架集成 | 接入 Hermes 或等价 Agent 框架，实现 Tool Calling 编排 | Agent 可调用多个 Tool 完成复杂任务 |
| Provider 配置 | 支持 DeepSeek + OpenAI + Ollama 三种 Provider，可切换 | 配置缺失时有明确提示，切换不丢会话 |
| 附件上下文注入 | 上传的附件内容自动注入 Agent 上下文 | 用户上传 Excel/模板文件后 Agent 可读取分析 |
| SSE streaming | 打通服务端流式输出到 ChatPanel | 用户可看到真实流式响应 |
| Prompt 管理 | 管理系统提示词、场景提示词和版本 | Prompt 可追踪、可回退 |
| 密钥本地安全存储 | API Key 不明文暴露到日志或前端状态 | 不打印、不提交、不泄漏 |
| ChatPanel 真实响应 | Chat UI 壳升级为真实 AI 对话 | 错误、超时、取消可处理 |

### 7.2 Provider 接入顺序

| 优先级 | Provider | 说明 |
|--------|----------|------|
| 1 | **DeepSeek** | 国产模型，中文能力强，API 兼容 OpenAI 格式，成本低 |
| 2 | **OpenAI** | 全球标杆，生态成熟，作为备选 |
| 3 | **Ollama** | 本地部署，离线可用，数据不外传 |

### 7.3 Phase 2 后续子阶段

AI Hub MVP 完成后，再按子阶段推进：

1. 智能项目初始化（Agent 根据对话生成项目结构）。
2. 配置反向生成（从已有配置反推模板和参数表）。
3. 模板推荐（根据项目特征推荐合适的模板）。
4. 自动优化建议（Agent 分析模板和参数表，提出优化方案）。
5. 更高级的多 Provider 管理与策略路由（按任务类型自动选择最优 Provider）。

## 8. 重大 Phase 完成制度

每个重大 Phase 完成时必须执行以下收尾动作：

- 更新本文档的进展记录，标记最新完成内容、验证结果、遗留风险。
- 执行或提醒执行编译验证与测试门禁。
- 提醒用户发布到 GitHub。
- 若进入正式发布，提醒同步 `VERSION.txt`、`electron/config.ts`、`package.json`、安装包 artifactName 与 Git tag。
- 记录是否需要更新 README、PRD、Spec 或发布说明。

## 9. 当前进展记录

| 日期 | 阶段 | 状态 | 记录 |
|------|------|------|------|
| 2026-07-16 | 规格落地 | 已完成 | 已按批准规格创建 V3 可落地计划与进展记录；未修改业务代码。 |
| 2026-07-16 | 基线固化 | 已完成 | 已统一采用 V3.0.2 Build 26071410、Electron 28、React 18、TypeScript 5.3、Vite 5、Zustand 4 作为后续实施基线。 |
| 2026-07-16 | 验证命令固化 | 已完成 | 已明确使用 `npm run lint`、`npm run format:check`、`npm run test`、`npm run typecheck`、`npm run build`、`npm run dist:win`、`python -m pytest backend/tests/ -v`；不使用 `npm run build:win`。 |
| 2026-07-16 | Phase 0 范围收口 | 已完成 | 已将 Phase 0 收敛为质量基线阻塞项；渲染缓存、Ruff 全量门禁、框架升级不阻塞 Phase 0。 |
| 2026-07-16 | Phase 0 代码实施 | 已完成 | 已完成项目创建权责统一、Python stdout JSON 协议与 logging 边界收口、核心测试门禁、前端关键错误处理、Electron dead code/console 清理。 |
| 2026-07-16 | Phase 0 测试门禁 | 已通过 | `npm run lint` 通过，剩余历史 warning 不阻断；`npm run format:check` 通过；`npm run test` 通过；`npm run typecheck` 通过；`npm run build` 通过；`python -m pytest backend/tests/ -v` 45 项通过。 |
| 2026-07-16 | Phase 0 遗留风险 | 已记录 | ESLint 9 flat config 已补齐并保持接近旧 `.eslintrc.cjs` 的门禁强度；Vite 仍提示 CJS Node API 与 package type warning；构建提示主包 chunk 超过 500k，后续可在 Phase 1/性能优化中处理。 |
| 2026-07-16 | Phase 0 新增特性规划 | 待审批 | 完成 P0-6 (J2 渲染改进 - 重新评估为 Monaco + TextMate 方案)、P0-7 (标签 MD 渲染)、P0-8 (MD 文件查看与打印导出) 的详细分析与实施方案。P0-6 已重新评估：保留 Monaco Editor 框架，接入 Better Jinja 的 TextMate 语法文件，通过 vscode-textmate + vscode-oniguruma (WASM) 实现 VS Code 级 Jinja2 高亮。等待用户批准后执行。 |
| 2026-07-17 | Phase 1-A 实施 | 已完成 | 完成项目中心、模板中心、工作流卡片、三列布局基础。 |
| 2026-07-17 | Phase 1-B 实施 | 已完成 | 完成 dry-run（预演渲染，不写入文件）、Jinja2 模板语法校验（`env.parse()`）、Excel 数据校验（sheet/列/空值检查）、diff 对比（`unified_diff`）、搜索增强（输出文件类型过滤）。新增 IPC handler：`render:dry-run`、`validate:template`、`validate:excel`、`diff:compare`。 |
| 2026-07-17 | Bug 修复 | 已完成 | 修复 ResizeHandle 拖拽抖动回弹（stale closure 问题，改用 `useRef` 模式）；修复模板中心不显示示例模板（`initializeWorkspace()` 开发模式下未从 `example/` 复制，且空目录导致跳过复制，改为检查目录为空时也触发复制）。 |
| 2026-07-17 | v3.1.0 发布 | 已完成 | 版本号 3.1.0 Build 26071702。提交包含 Phase 1-A + Phase 1-B + Bug 修复，共 19 个文件变更（+953/-24）。Tag `v3.1.0` 已推送到 GitHub，触发 GitHub Actions 编译 Windows/macOS/Linux 三平台安装包。 |
| 2026-07-17 | Phase 1-C 规划 + Phase 2 架构重构 | 已规划 | Phase 1-C 扩展：Chat UI 壳增加附件上传框架（ChatAttachment 接口）、消息数据结构预留 Agent Tool 调用字段；Chat 界面设计参考 Trae Work 风格。Phase 2 重构为 Agent + 多 Provider 架构：Agent 层（Hermes）负责工具调用编排和上下文管理，LLM 层（DeepSeek/OpenAI/Ollama）可插拔切换；预定义 11 个 Agent Tool（create_project/validate_template/render_config 等）。等待用户批准。 |
| 2026-07-17 | Phase 1-D 实施 | 已完成 | 完成 README 更新（v3.1.0 badge、新功能列表、版本历史）；使用指南中英文同步更新（补充模板中心、dry-run、校验、diff、搜索过滤、标签打印等新功能）；AboutDialog 从 Header.tsx 抽取为独立组件并补充 GitHub 链接和 MIT 许可；自动更新 upgrade：`autoDownload=true` + 启动时自动检查 + 下载完成弹出重启确认对话框。共 8 个文件变更。 |
| 2026-07-17 | i18n 国际化修复 | 已完成 | 全面排查 16 个组件文件中约 90 处硬编码中文文本，全部替换为 react-i18next 调用。新增 i18n 键值：template、workbench、label、projectBatch、projectList、excel、editor 命名空间。修复后切换语言所有 UI 文本同步更新。 |
| 2026-07-17 | UI/UX 优化重构 | 已完成 | <b>AI对话位置调整</b>：Chat 移至 ActivityBar 第 2 位（搜索和项目浏览器之间）；<b>标签打印合并</b>：LabelPanel 功能合并到 RenderPanel 的"打印标签"子页签，删除独立 LabelPanel.tsx；<b>RenderPanel 子页签</b>：参照 ExplorerPanel 模式，拆分为 渲染配置 / 打印标签 / 清理文件 三个子页签；<b>OutputPanel 子页签</b>：拆分为 文件浏览 / 批量导出 两个子页签，导出页签预留 ZIP 和目录导出功能；<b>菜单栏重构</b>：从 3 组（文件/视图/帮助）扩展为 5 组（文件/编辑/视图/工具/帮助），补充撤销/重做/复制/粘贴/快捷键列表/检查更新/终端/日志查看器/退出/保存文件等菜单项，移除已废弃的标签打印入口；<b>ActivityBar 精简</b>：从 7 项减至 6 项（搜索/Chat/项目/渲染/输出/工作台），补齐工作台图标和快捷键（Ctrl+Shift+W）；<b>i18n</b>：新增 ~20 个菜单/渲染/输出子页签相关键值，删除 labelPrint 键值。共删除 1 个文件，新增 0 个文件，修改 6 个文件。`npm run build` 通过。 |

## 10. 执行原则

- 每次进入新 Phase 前，先确认上一个 Phase 的验收记录与用户继续开发指令。
- 修改业务代码前，先对目标文件周边实现、现有测试和命名风格进行确认。
- 不引入仓库未使用的新依赖，除非该依赖是当前任务必要项并获得用户认可。
- 安全相关变更默认禁止记录密钥、token、API Key、完整本地敏感路径或用户隐私数据。
- 文档与进展记录必须随重大阶段完成同步更新，避免计划与实际状态再次漂移。
- **i18n 强制约束：所有新增功能涉及的 UI 文本（按钮、标签、提示、占位符、错误信息、toast 消息等）必须使用 `react-i18next` 的 `t()` 调用，同步添加中英文翻译键值到 `src/i18n/locales/` 目录下的对应 JSON 文件中。禁止硬编码任何用户可见的文本。**
