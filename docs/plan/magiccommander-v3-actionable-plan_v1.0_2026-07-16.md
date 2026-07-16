# MagicCommander V3 可落地开发计划与进展记录

> 基于已批准的 `.trae/specs/evaluate-v3-roadmap/spec.md`、`tasks.md`、`checklist.md` 落地。本文档只定义计划、验收与进展记录，不代表已进入业务代码开发。

## 1. 文档状态

| 项目 | 内容 |
|------|------|
| 文档版本 | v1.0 |
| 创建日期 | 2026-07-16 |
| 当前状态 | Phase 0 质量基线收口已完成本地验收，等待用户发布到 GitHub 并执行 Windows 安装包编译验证 |
| 应用事实基线 | MagicCommander V3.0.2 Build 26071410 |
| 技术栈事实基线 | Electron 28、React 18、TypeScript 5.3、Vite 5、Zustand 4、Python 3 |
| 计划来源 | `.trae/specs/evaluate-v3-roadmap/spec.md`、`.trae/specs/evaluate-v3-roadmap/tasks.md`、`.trae/specs/evaluate-v3-roadmap/checklist.md` |
| 约束 | 用户批准前不修改业务代码；重大 Phase 完成后必须更新本文档并提醒发布到 GitHub |

## 2. 基线修正

### 2.1 采用当前仓库事实基线

后续 V3 计划统一以当前仓库实现为准：

- 应用版本：V3.0.2 Build 26071410。
- `package.json` 版本：3.0.2。
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

### 5.3 Phase 0 任务顺序

1. 先确认项目创建链路当前实际行为，明确 Electron/Python 哪一侧拥有写入权责。
2. 再处理 stdout JSON 协议与 logging 边界，避免后续测试误判。
3. 补齐关键自动化测试，使后续重构有保护网。
4. 收口前端关键错误处理，优先覆盖用户会遇到的失败路径。
5. 清理 dead code/console，并执行阶段验收命令。

### 5.4 Phase 0 暂缓项

以下内容从旧 Phase 0 计划降级，不阻塞 Phase 0 完成：

- 渲染缓存机制：迁移至 Phase 1 准确率体验或性能优化子阶段。
- Ruff 全量门禁：等待仓库新增 Ruff 配置并获批准后再纳入。
- Electron/React/TypeScript 大版本升级：单独制定技术升级规格。
- 全量 print 替换：只处理会污染协议、影响诊断或阻塞验收的输出。
- 全量 ErrorService 化：先覆盖关键路径，后续逐步整理。

## 6. Phase 1：体验与准确率升级计划

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

### 6.3 Phase 1-C：AI UI 壳与品牌升级

| 工作项 | 内容 | 明确边界 |
|--------|------|----------|
| Chat UI 壳 | 输入栏、会话区、模式切换、占位响应 | 不接入真实 LLM |
| 品牌升级 | 提升 V3 视觉一致性和可用性 | 不因视觉升级破坏核心工作流 |
| 模板项目库 | 梳理示例项目与模板入口 | 不实现在线模板市场 |

### 6.4 Phase 1 禁止项

Phase 1 不做以下事项：

- 不接入真实 LLM 调用。
- 不做 API Key 管理。
- 不允许 AI 执行真实文件操作。
- 不把智能项目初始化、配置反向生成、模板推荐、自动优化前置到 Phase 1。

## 7. Phase 2：AI Hub MVP 计划

### 7.1 MVP 范围

| 工作项 | 内容 | 验收要点 |
|--------|------|----------|
| FastAPI 子进程生命周期 | Electron 启停 Python AI 服务，处理异常退出与重启策略 | 可启动、可停止、失败可提示 |
| 健康检查 | 提供 health endpoint 或等价 IPC 健康状态 | UI 可展示服务状态 |
| SSE streaming | 打通服务端流式输出到 ChatPanel | 用户可看到真实流式响应 |
| Provider 配置 | 至少覆盖 Ollama 与一个云端 Provider | 配置缺失时有明确提示 |
| Prompt 管理 | 管理系统提示词、场景提示词和版本 | Prompt 可追踪、可回退 |
| 密钥本地安全存储 | API Key 不明文暴露到日志或前端状态 | 不打印、不提交、不泄漏 |
| ChatPanel 真实响应 | Chat UI 壳升级为真实 AI 对话 | 错误、超时、取消可处理 |

### 7.2 Phase 2 后续子阶段

AI Hub MVP 完成后，再按子阶段推进：

1. 智能项目初始化。
2. 配置反向生成。
3. 模板推荐。
4. 自动优化建议。
5. 更高级的多 Provider 管理与策略路由。

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
| 2026-07-16 | 下一步 | 待用户指令 | 请发布到 GitHub，并执行 `npm run dist:win` 做 Windows 安装包编译验证；完成后再决定是否进入 Phase 1。 |

## 10. 执行原则

- 每次进入新 Phase 前，先确认上一个 Phase 的验收记录与用户继续开发指令。
- 修改业务代码前，先对目标文件周边实现、现有测试和命名风格进行确认。
- 不引入仓库未使用的新依赖，除非该依赖是当前任务必要项并获得用户认可。
- 安全相关变更默认禁止记录密钥、token、API Key、完整本地敏感路径或用户隐私数据。
- 文档与进展记录必须随重大阶段完成同步更新，避免计划与实际状态再次漂移。
