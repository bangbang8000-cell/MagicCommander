# MagicCommander 更新日志

本文件为发布说明的单一事实来源（`npm run sync-version -- --release-notes` 自动抽取当前版本段）。

## [4.2.0] - 2026-09-01

### 新增

- 4.2 稳定性与数据安全。
- 崩溃上报：本地转储 + 脱敏 errors.log（修复 Bearer/JWT 脱敏顺序）+ 渲染崩溃自动 reload + 未捕获异常兜底。
- 项目编辑自动保存（防抖 800ms + 关闭前 flush）+ 崩溃/关闭后恢复。

### 改进

- 编辑撤销命令栈（深拷贝快照 / 栈深 50 / Ctrl+Z+Y + 工具条，重启保留）。
- 项目版本回滚（`.mc_history/` 最近 10 版）+ 备份轮转（`.mc_backups/` 5 份）+ 一键恢复。
- 大项目性能：Web Worker 化大参数表数据准备 + 万行参数表虚拟化渲染 + 性能门禁场景 C（万行 ≤30s）。
- 性能仪表盘（操作耗时 / 内存 / 渲染长任务 / 基准对比）。

## [4.1.0] - 2026-09-01

### 新增

- 4.1 视觉与品牌统一。
- 主题系统 DTCG 化：light/dark/system/**high-contrast** 四主题，无闪变 + 持久化。
- 高对比主题（WCAG AA）：正文 21:1、次要 14.7:1、弱化 7.6:1、边界 4.8:1、主按钮 8.7:1。

### 改进

- 组件库视觉收敛到契约 token（Button/Input/Select/Modal/Table/Tabs/Popover/Toast/ContextMenu）。
- 品牌资产统一（启动画面/About/徽标/字体栈按契约）。
- 空态/加载/错误态统一（EmptyState/LoadingState/ErrorState）。

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
