# Phase 3: 产品打磨与功能完善 开发计划

> 基于用户 2026-07-20 提出的 7 项综合需求，对 V3 产品进行最终打磨和完善。

## 1. 文档状态

| 项目 | 内容 |
|------|------|
| 文档版本 | v1.0 |
| 创建日期 | 2026-07-20 |
| 当前状态 | 待审批 |
| 应用基线 | MagicCommander V3.3.2 Build 26072003 |
| 前置条件 | Phase 0/1/2 全部完成，AI Hub 核心功能稳定 |

## 2. 需求总览

| 编号 | 需求 | 优先级 | 预估改动量 |
|------|------|--------|-----------|
| R1 | README 增强 AI 驱动相关介绍 | 高 | 1 文件 |
| R2 | 语言选择图标改为 "文/A" 文字风格 | 高 | 2 文件 |
| R3 | 语言选择、检查更新在设置面板中实现 | 高 | 3 文件 |
| R4 | 通用设置、高级设置规划和实现 | 高 | 4 文件 |
| R5 | 部署文档增加 AI 组件部署步骤 | 高 | 1 文件 |
| R6 | 小规模打磨项（LoadingState、模板元数据、模板分类、使用指南） | 中 | 5 文件 |
| R7 | 综合评估并更新开发计划文档 | 高 | 2 文件 |

## 3. 详细实施方案

---

### R1: README 增强 AI 驱动相关介绍

**现状**: README 已有 AI 智能助手一节，但偏向功能罗列，缺少 AI 驱动的工作流描述和场景化介绍。

**方案**:
1. 在 README 顶部增加 "AI 驱动" 标签和一句话定位
2. 扩展 AI 智能助手章节，增加：
   - AI 对话式工作流示例（自然语言 → 渲染 → 分析 → 优化）
   - 多 Provider 智能路由说明
   - 27 个 AI 工具能力列表
   - 项目分析引擎介绍
3. 在 "为什么选择 MagicCommander" 中增加 AI 优势条目

**涉及文件**:
| 文件 | 改动 |
|------|------|
| `README.md` | 重写 AI 章节，增加场景化描述和工作流示例 |

---

### R2: 语言选择图标改为 "文/A" 文字风格

**现状**: Header 中语言切换按钮使用 `<Globe size={14} />` 图标，13 种语言都显示同一个地球图标。

**方案**:
1. 创建 `LANGUAGE_ICON_CHARS` 映射表：根据当前语言显示对应文字标识
   - `zh-CN` → `文`, `zh-TW` → `繁`, `en` → `A`
   - `ja` → `あ`, `ko` → `한`, `fr` → `F`, `de` → `D`
   - `es` → `E`, `pt` → `P`, `ru` → `Р`, `ar` → `ع`
   - `vi` → `V`, `th` → `ท`
2. Header 中语言按钮改为显示当前语言字符（带边框的方形文字标识）
3. 保持 Popover 交互不变

**涉及文件**:
| 文件 | 改动 |
|------|------|
| `src/i18n/resources.ts` | 新增 `LANGUAGE_ICON_CHARS` 映射 |
| `src/components/layout/Header.tsx` | 语言按钮图标从 Globe 改为文字标识 |

---

### R3: 语言选择、检查更新在设置面板中实现

**现状**: 语言选择仅在 Header Popover 中可用，检查更新仅在 Header Popover 和菜单栏中可用。设置面板中缺少这两个功能入口。

**方案**:

#### R3-A: 语言选择集成到设置面板
1. 在 "通用设置" 区域展示当前语言，点击弹出语言选择器
2. 使用与 Header Popover 相同的语言列表（13 种）
3. 选择后同步更新 Header 中的语言状态

#### R3-B: 检查更新集成到设置面板
1. 在 "通用设置" 或独立区域展示当前版本号 + 更新状态
2. 提供 "检查更新" 按钮，触发与 Header 相同的更新检查流程
3. 显示更新状态（最新/可更新/下载中/已下载）
4. 有更新时显示版本号和 Release Notes

**涉及文件**:
| 文件 | 改动 |
|------|------|
| `src/components/sidebar/SettingsPanel.tsx` | 通用设置区域实现语言选择 + 更新检查 |
| `src/i18n/locales/zh-CN/common.json` | 新增翻译键值 |
| `src/i18n/locales/en/common.json` | 新增翻译键值 |

---

### R4: 通用设置、高级设置规划和实现

**现状**: 设置面板中 "通用设置" 和 "高级设置" 均为 `opacity-60` 的占位卡片，标注 "即将推出"。

**方案**:

#### R4-A: 通用设置
| 设置项 | 类型 | 说明 | 默认值 |
|--------|------|------|--------|
| 语言 | 下拉选择 | 13 种语言选择 | zh-CN |
| 自动保存 | 开关 | 编辑文件时自动保存 | 开启 |
| 自动保存间隔 | 数字输入 | 自动保存间隔（秒） | 30s |
| 工作区路径 | 只读文本 + 打开按钮 | 显示当前工作区路径 | 系统默认 |
| 启动时检查更新 | 开关 | 应用启动时自动检查更新 | 开启 |

#### R4-B: 高级设置
| 设置项 | 类型 | 说明 | 默认值 |
|--------|------|------|--------|
| Python 路径 | 文本输入 + 浏览按钮 | 指定 Python 解释器路径 | 自动检测 |
| 调试模式 | 开关 | 启用详细日志和开发者工具 | 关闭 |
| 代理设置 | 文本输入 | HTTP/HTTPS 代理地址 | 空 |
| AI Hub 端口 | 数字输入 | AI Hub 服务端口号 | 自动分配 |
| AI Hub 自动启动 | 开关 | 打开 Chat 时自动启动 AI Hub | 开启 |

#### R4-C: UI 状态管理
- 在 `ui.store.ts` 中新增 `GeneralSettings` 和 `AdvancedSettings` 类型
- 使用 Zustand persist 持久化到 localStorage
- 移除 "即将推出" 标签和 `opacity-60` 样式

**涉及文件**:
| 文件 | 改动 |
|------|------|
| `src/stores/ui.store.ts` | 新增 `GeneralSettings`、`AdvancedSettings` 接口和状态 |
| `src/components/sidebar/SettingsPanel.tsx` | 实现通用设置和高级设置表单 |
| `src/i18n/locales/zh-CN/common.json` | 新增 ~20 个翻译键值 |
| `src/i18n/locales/en/common.json` | 新增 ~20 个翻译键值 |

---

### R5: 部署文档增加 AI 组件部署步骤

**现状**: `docs/DEPLOYMENT.md` 已有 AI Hub 配置章节，但内容较简略，缺少独立性部署指导。

**方案**:
1. **AI Hub 架构说明**: 补充 AI Hub 作为独立 FastAPI 子进程的架构图
2. **AI Hub 依赖清单**: 完整列出 `backend/requirements.txt` 中 AI 相关依赖及用途
3. **AI Hub 独立部署**: 说明如何单独启动/停止/调试 AI Hub
4. **AI Hub 配置**: Provider 配置、API Key 管理、模型选择
5. **AI Hub 故障排查**: 常见问题（端口占用、依赖缺失、模型连接失败）
6. **CI/CD 中 AI 组件**: 构建时 AI Hub 目录的打包配置

**涉及文件**:
| 文件 | 改动 |
|------|------|
| `docs/DEPLOYMENT.md` | 新增 AI Hub 部署章节，扩展故障排查表 |

---

### R6: 小规模打磨项

#### R6-A: LoadingState 统一组件
**现状**: 无统一的 LoadingState 组件，各面板使用临时文本或空状态。

**方案**:
1. 创建 `src/components/ui/LoadingState.tsx`
2. 提供 `variant` 属性：`skeleton`（骨架屏）、`spinner`（旋转加载）、`inline`（行内加载）
3. 支持 `text` 属性显示加载文案
4. 支持 dark/light 主题

**涉及文件**:
| 文件 | 改动 |
|------|------|
| `src/components/ui/LoadingState.tsx` | 新增 |
| `src/i18n/locales/zh-CN/common.json` | 新增 loading 相关键值 |
| `src/i18n/locales/en/common.json` | 新增 loading 相关键值 |

#### R6-B: 模板元数据增强
**现状**: `example/` 下已有 `template.meta.json`，包含 name/description/scenario 等字段，但模板列表 UI 未展示这些信息。

**方案**:
1. 模板列表展示场景分类标签（交换机/路由器/防火墙等）
2. 模板卡片显示描述和输入要求摘要
3. 模板详情弹窗展示完整元数据

**涉及文件**:
| 文件 | 改动 |
|------|------|
| `src/components/sidebar/TemplateList.tsx` 或模板列表组件 | 展示场景标签和描述 |
| `example/example1/template.meta.json` | 已有，无需修改 |
| `example/example2/template.meta.json` | 已有，无需修改 |

#### R6-C: 模板分类
**现状**: 模板列表为平铺列表，无分类筛选。

**方案**:
1. 从 `template.meta.json` 的 `scenario` 字段提取分类
2. 模板列表顶部增加分类标签栏（全部/交换机/路由器/防火墙等）
3. 点击分类标签过滤模板列表

**涉及文件**:
| 文件 | 改动 |
|------|------|
| `src/components/sidebar/TemplateList.tsx` 或模板列表组件 | 新增分类筛选 |
| `src/i18n/locales/zh-CN/common.json` | 新增分类相关键值 |
| `src/i18n/locales/en/common.json` | 新增分类相关键值 |

#### R6-D: 使用指南更新
**现状**: `public/docs/user-guide.zh-CN.md` 和 `user-guide.en.md` 未包含 AI 功能。

**方案**:
1. 新增 "AI 智能助手" 章节：如何使用 Chat 对话完成配置管理
2. 新增 "AI 设置" 章节：配置 Provider、API Key、智能路由
3. 新增 "项目分析" 章节：使用 AI 分析项目模板和 Excel 质量
4. 更新截图（如需要）
5. 中英文同步更新

**涉及文件**:
| 文件 | 改动 |
|------|------|
| `public/docs/user-guide.zh-CN.md` | 新增 AI 章节 |
| `public/docs/user-guide.en.md` | 新增 AI 章节 |

---

### R7: 更新开发计划文档

**方案**:
1. 更新 `docs/plan/magiccommander-v3-actionable-plan_v1.0_2026-07-16.md` 进展记录
2. 新增 Phase 3 完成记录

**涉及文件**:
| 文件 | 改动 |
|------|------|
| `docs/plan/magiccommander-v3-actionable-plan_v1.0_2026-07-16.md` | 新增 Phase 3 进展记录 |
| `docs/plan/phase-3-polish-and-completeness_v1.0_2026-07-20.md` | 本文档 |

---

## 4. 实施顺序

```
步骤 1: R2 语言图标 (独立，无依赖)
步骤 2: R4 通用设置 + 高级设置 (需要新建 store 状态)
步骤 3: R3 语言选择 + 检查更新集成到设置 (依赖 R4 的通用设置框架)
步骤 4: R6-A LoadingState 组件 (独立)
步骤 5: R6-B/R6-C 模板元数据 + 分类 (依赖 R6-A 的加载状态)
步骤 6: R1 README 更新 (依赖以上功能完成后的截图/描述)
步骤 7: R6-D 使用指南更新 (依赖以上功能完成)
步骤 8: R5 部署文档更新 (依赖 AI 组件稳定)
步骤 9: R7 开发计划文档更新 (最后收尾)
```

## 5. 翻译键值清单

新增翻译键值（中英文同步）：

| 键路径 | 中文 | English |
|--------|------|---------|
| `settings.general.language` | 语言 | Language |
| `settings.general.autoSave` | 自动保存 | Auto Save |
| `settings.general.autoSaveInterval` | 自动保存间隔（秒） | Auto Save Interval (s) |
| `settings.general.workspacePath` | 工作区路径 | Workspace Path |
| `settings.general.openWorkspace` | 打开工作区 | Open Workspace |
| `settings.general.checkUpdateOnStart` | 启动时检查更新 | Check updates on startup |
| `settings.general.currentVersion` | 当前版本 | Current Version |
| `settings.advanced.title` | 高级设置 | Advanced |
| `settings.advanced.desc` | Python 路径、调试模式、代理配置 | Python path, debug mode, proxy |
| `settings.advanced.pythonPath` | Python 路径 | Python Path |
| `settings.advanced.pythonPathHint` | 留空使用系统默认 Python | Leave empty for system default |
| `settings.advanced.browse` | 浏览 | Browse |
| `settings.advanced.debugMode` | 调试模式 | Debug Mode |
| `settings.advanced.debugModeDesc` | 启用详细日志和开发者工具 | Enable verbose logs and DevTools |
| `settings.advanced.proxy` | 代理设置 | Proxy |
| `settings.advanced.proxyHint` | 例如: http://127.0.0.1:7890 | e.g.: http://127.0.0.1:7890 |
| `settings.advanced.aiHubPort` | AI Hub 端口 | AI Hub Port |
| `settings.advanced.aiHubAutoStart` | 自动启动 AI Hub | Auto-start AI Hub |
| `settings.advanced.aiHubAutoStartDesc` | 打开 Chat 时自动启动 | Auto-start when opening Chat |
| `settings.updates.title` | 软件更新 | Software Update |
| `settings.updates.checkButton` | 检查更新 | Check for Updates |
| `template.category.all` | 全部 | All |
| `template.category.switch` | 交换机 | Switch |
| `template.category.router` | 路由器 | Router |
| `template.category.firewall` | 防火墙 | Firewall |
| `loading.skeleton` | 加载中... | Loading... |

## 6. 验证门禁

完成后执行：

```bash
npm run typecheck
npm run lint
npm run build
npm run build:electron
```

## 7. 验收标准

| 编号 | 验收项 |
|------|--------|
| R1 | README 包含 AI 驱动工作流描述、场景化使用示例，badge 和版本号正确 |
| R2 | Header 语言按钮显示当前语言对应的文字标识，切换语言后文字同步更新 |
| R3 | 设置面板的通用设置区域可切换语言和检查更新，与 Header 状态同步 |
| R4 | 通用设置 5 项 + 高级设置 5 项全部可交互，设置持久化到 localStorage |
| R5 | 部署文档包含 AI Hub 架构说明、独立部署步骤、故障排查 |
| R6-A | LoadingState 组件支持 skeleton/spinner/inline 三种变体 |
| R6-B | 模板列表展示场景标签和描述摘要 |
| R6-C | 模板列表支持按场景分类筛选 |
| R6-D | 使用指南中英文包含 AI 功能使用说明 |
| R7 | 开发计划文档记录 Phase 3 完成状态 |
| i18n | 所有新增 UI 文本使用 `t()` 调用，中英文翻译键值完整 |
| 编译 | TypeScript 零错误，`npm run build` 通过 |