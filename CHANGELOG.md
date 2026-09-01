# MagicCommander 更新日志

本文件为发布说明的单一事实来源（`npm run sync-version -- --release-notes` 自动抽取当前版本段）。

## [4.0.0] - 2026-08-29

### 新增

- 4.0 系列启动 · 工程基座与质量门禁。
- 引入 Playwright Electron E2E（冒烟三件套：启动→建项目→渲染→导出）。
- 新增 golden 基线、模板校验、性能门禁、渲染安全基线四道 CI 门禁（对齐 AL 工程化）。
- 版本单源 + 发布说明自动抽取（`sync-version --release-notes`）。

### 改进

- 设计 token 单源扩展（按双端 4.0 契约：语义色/中性/surface/圆角/阴影/间距/动效/字体）+ 断言单测防漂移。
- 组件行为契约（Modal/Popover/ContextMenu/Select/Toast）补齐（ESC 关闭/焦点管理/受控）。
- 工程对齐：ESLint `no-unused-vars` 升 error，lint 0 error 门禁。

## [3.10.7] - 2026-08-29

### 新增

- 会话工具栏上下文摘要 + 长会话截断提示（上下文压缩）。
- 打磨轮（4.0 前最终打磨）用户体验增强。

### 改进

- 长对话上下文自动压缩，保持 AI 会话稳定与响应质量。
- 项目/模板/渲染链路稳定性优化。

### 修复

- 修复多处 3.10 系列打磨中发现的问题（详见各分项提交说明）。

### 质量门禁

- 引入 4.0.0 工程基座前置：E2E（Playwright Electron）、golden 基线、模板校验、性能门禁、渲染安全基线、版本/发布说明单源（对齐 AL）。
