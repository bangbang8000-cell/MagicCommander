# MagicCommander 文档索引

> 本页是 MagicCommander **文档体系的地图与维护入口**。目录与命名细则见 [DOCUMENT_CONVENTIONS.md](DOCUMENT_CONVENTIONS.md)；新增文档前请先读本页「维护规约」。

## 一、按角色找文档

| 你是谁 | 建议阅读顺序 |
|--------|-------------|
| **新用户** | [README](../README.md) → [使用指南（中文）](../public/docs/user-guide.zh-CN.md) → 应用内「帮助」 |
| **运维 / 部署** | [部署指南](DEPLOYMENT.md) → [使用指南 · 软件更新与企业部署](../public/docs/user-guide.zh-CN.md) |
| **集成方（外部 AI Agent）** | [Agent Connect 接入样板](agent-connect/README.md) → [部署指南 · Agent Connect](DEPLOYMENT.md#agent-connect-部署) |
| **贡献者** | [文档管理规范](DOCUMENT_CONVENTIONS.md) → [工程协作约定](../AGENT.md) → [更新日志](../CHANGELOG.md) |

## 二、文档清单

### 面向使用者

| 文档 | 说明 |
|------|------|
| [../README.md](../README.md) | 产品门面：价值主张、工作原理、核心功能、快捷键、版本历史、FAQ |
| [../public/docs/user-guide.zh-CN.md](../public/docs/user-guide.zh-CN.md) | 全功能操作手册（中文，随安装包发布，应用内离线可看） |
| [../public/docs/user-guide.en.md](../public/docs/user-guide.en.md) | Full user guide (English) |

> `public/` 为**源目录**（入库）；`dist/` 是构建产物（已在 `.gitignore` 中排除），**不要直接改 `dist/docs/`**。

### 面向运维 / 开发者

| 文档 | 说明 |
|------|------|
| [DEPLOYMENT.md](DEPLOYMENT.md) | 环境要求、开发环境、构建测试、版本管理与发布、CI/CD、客户端安装、云平台部署、AI Hub 与 **Agent Connect** 部署、故障排查 |
| [../AGENT.md](../AGENT.md) | 工程协作约定（提交与门禁要求） |

### 面向集成方

| 文档 | 说明 |
|------|------|
| [agent-connect/README.md](agent-connect/README.md) | 启动命令、双场景模式、3 步接入、Claude Desktop / Codex CLI / Trae Work / VS Code 配置与排错 |
| [agent-connect/claude_desktop_config.json](agent-connect/claude_desktop_config.json) | Claude Desktop 可直接复制的配置 |
| [agent-connect/config.toml](agent-connect/config.toml) | Codex CLI 配置 |
| [agent-connect/mcp.json](agent-connect/mcp.json) | Trae Work / VS Code 配置 |

### 产品与规划（仓库根）

| 文档 | 说明 |
|------|------|
| [../CLIENT_CLOUD_INTEGRATION_PRD.md](../CLIENT_CLOUD_INTEGRATION_PRD.md) | 客户端与云平台集成 PRD |
| [../CLOUD_DEVELOPMENT_PLAN.md](../CLOUD_DEVELOPMENT_PLAN.md) | 云平台开发计划 |

### 历史归档（本地保留，不入库）

| 位置 | 内容 | 说明 |
|------|------|------|
| `docs/_archive/` | 2026-07 ～ 08 的 PRD / 实施计划 / 代码审查 / 阶段计划 | 已在 `.gitignore` 中排除，仅本地留存 |
| `docs/prd/` `docs/spec/` `docs/plan/` `docs/report/` `docs/temp/` | [DOCUMENT_CONVENTIONS.md](DOCUMENT_CONVENTIONS.md) 约定的标准分类目录 | 当前为空目录（未跟踪），新增长期文档请按规约放入对应目录 |

## 三、文档与代码的「真值」关系

数量类事实**以代码为唯一真值源**，由 [`scripts/check_doc_numbers.py`](../scripts/check_doc_numbers.py) 在 CI 中反向校验：

| 事实 | 真值来源 | 当前值 |
|------|---------|--------|
| Agent 工具数 | 运行时 `ai_hub/agent/tools.py` 的 `init_tools()` → `_tools` | **53** |
| 版本号 | `version.json`（单源）→ 生成 `VERSION.txt` / `package.json` | 见 `VERSION.txt` |
| 测试规模 | 实跑结果 | 前端 Vitest **802**（渲染 645 + Electron 157）+ pytest **843**（`backend/tests` 378 + `ai_hub/tests` 465） |

校验范围：`README.md` / `CHANGELOG.md`（CHANGELOG 只校验最新版本章节，历史条目保留当时真值）。

```bash
python scripts/check_doc_numbers.py     # 校验，漂移则 exit 1
node scripts/sync-version.js --check    # 版本一致性 + CHANGELOG 覆盖校验
```

## 四、维护规约

### 新增文档

1. **先归类**（对齐 [DOCUMENT_CONVENTIONS.md](DOCUMENT_CONVENTIONS.md)）：常青文档放 `docs/` 根；历史/阶段性文档按 `prd/` `spec/` `plan/` `wiki/` `report/` 归位。
2. **命名**：阶段性文档用 `{文档名}_{版本号}_{日期}.md`（如 `code-review_v1.0_2026-07-14.md`）；常青文档用固定短名，**不加版本号**。
3. **加索引**：在本页「文档清单」登记一行。
4. **不写死数字**：数量类事实写成受 `check_doc_numbers.py` 覆盖的表述，让 CI 自动校验。

### 修改文档（防漂移清单）

| 代码改动 | 需同步的文档 |
|---------|-------------|
| 增删 Agent 工具 | 跑 `check_doc_numbers.py` 会指出所有待改位置 |
| 构建 / 依赖 / 端口 / 发布流程 | `docs/DEPLOYMENT.md` |
| Agent Connect（模式 / 门禁 / 工具语义） | `docs/agent-connect/README.md`、`public/docs/user-guide.*.md`、`DEPLOYMENT.md` 的 Agent Connect 章节 |
| 面向用户的功能与操作路径 | `public/docs/user-guide.zh-CN.md` + `user-guide.en.md`（**中英必须同步**） |
| 版本号 | `version.json` → `npm run sync-version` |
| 快捷键 / 界面入口 | `README.md` 快捷键表 + 用户指南「快捷键」章节 |

### 禁止事项

- ❌ 只改中文指南不改英文指南（两份必须同步）
- ❌ 直接编辑 `dist/docs/*.md`（构建产物，改动会被覆盖；请改 `public/docs/`）
- ❌ 把 `docs/_archive/` 下的内容提交入库
- ❌ 在 `README.md` / `CHANGELOG.md` 最新章节写入未经代码校验的数量

---

## 附：修改记录

| 日期 | 版本 | 说明 |
|------|------|------|
| 2026-09-17 | v1.0 | 首版：按角色导航 + 文档清单 + 真值关系 + 维护规约（配套 v5.2.2 文档整理；补 Agent Connect 部署入口索引） |
