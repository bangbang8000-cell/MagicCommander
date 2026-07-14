# MagicCommander 文档管理规范

> 本文档是项目文档管理的长期约定，所有文档的创建、命名、归档必须遵循以下规则。

---

## 1. 目录结构

```
docs/
├── prd/        # 产品需求文档 (Product Requirements Document)
├── spec/       # 技术规范与设计文档 (Technical Specification / Design Spec)
├── plan/       # 开发计划、实施规划、路线图 (Development Plan / Roadmap)
├── wiki/       # 发布公告、变更日志、FAQ (Release Notes / Changelog / Wiki)
├── report/     # 审查报告、测试报告、分析报告 (Review / Test / Analysis Report)
├── temp/       # 临时草稿、工作笔记 (Temporary drafts, will be cleaned up)
└── DOCUMENT_CONVENTIONS.md   # 本文档
```

### 各目录用途

| 目录 | 用途 | 示例 |
|------|------|------|
| `prd/` | 产品需求文档，定义产品功能范围 | PRD、功能需求规格 |
| `spec/` | 技术规范、架构设计、API 设计 | 技术规格、架构设计文档 |
| `plan/` | 开发计划、实施步骤、i18n/重构计划 | 开发路线图、阶段计划、重构方案 |
| `wiki/` | 发布说明、变更日志、使用指南 | Release Notes、Changelog、FAQ |
| `report/` | 代码审查、测试报告、质量报告 | Code Review 报告、测试覆盖率报告 |
| `temp/` | 临时文件，定期清理 | 会议笔记、临时草稿 |

---

## 2. 命名规范

### 格式

```
{文档名}_{版本号}_{日期}.{扩展名}
```

### 规则

- **文档名**：使用英文小写 + 连字符 (`-`)，简洁描述文档内容
  - 例：`magiccommander-prd`、`code-review`、`phase-0-quality-foundation`
- **版本号**：`v{主版本}.{次版本}`，从 `v1.0` 开始
  - 大版本递增：重大变更（重构范围、新增模块）
  - 小版本递增：小修改、补充内容
- **日期**：`YYYY-MM-DD` 格式（ISO 8601）
  - 取文档创建日期，非最后修改日期
- **扩展名**：`.md`（Markdown）、`.html`（富文档）、`.pdf`（导出）

### 正确示例

```
magiccommander-prd_v2.0_2026-07-07.html
code-review_v1.0_2026-07-14.md
phase-0-quality-foundation_v1.0_2026-07-14.md
release_v2.9.5_2026-07-01.md
```

### 错误示例

```
❌ magiccommander-v3-prd.html          (缺少版本号和日期)
❌ PRD_v2_final.html                   (中文命名、非标准格式)
❌ 2026-07-14-phase-0-quality-foundation.md  (日期在前，应为文档名在前)
❌ magiccommander-prd_v2.0_2026-07-07_final.html  (多余后缀)
```

---

## 3. 多文件文档（HTML 富文档）

对于包含多个资源文件的 HTML 文档（如 `_shared/` 字体、JS 库、`assets/` 图片），使用**同名文件夹**包裹：

```
docs/prd/magiccommander-prd_v2.0_2026-07-07/
├── magiccommander-prd_v2.0_2026-07-07.html   ← 主文档
├── _shared/                                   ← 共享资源
│   ├── fonts/
│   └── js/
└── assets/                                    ← 文档专属资源
    └── charts.js
```

**规则**：
- 文件夹名 = HTML 文件名（不含扩展名）
- 文件夹内只放该文档的资源，不跨文档共享
- 资源引用路径保持相对路径（`_shared/js/xxx.js`、`assets/xxx.png`）

---

## 4. 版本管理

### 更新现有文档

1. **小修改**（修正错别字、补充细节）→ 不升级版本，不更新日期
2. **内容变更**（新增章节、修改需求）→ 升级小版本 + 更新日期
3. **重大重写**（重构范围、推翻重来）→ 升级大版本 + 更新日期

### 保留旧版本

当需要保留旧版本作为参考时，旧版本保留在原目录，不做删除：

```
docs/prd/
├── magiccommander-prd_v1.0_2026-06-15.html
└── magiccommander-prd_v2.0_2026-07-07.html
```

### 废弃文档

- 不再需要的文档直接删除，不要保留"已废弃"的旧版本
- 如果 Git 历史已记录，无需保留本地副本

---

## 5. 应用版本号规则

MagicCommander 应用版本采用“语义化版本 + 日期型 Build 号”的双层规则：

```text
对外显示：MagicCommander V{MAJOR}.{MINOR}.{PATCH} Build {YYMMDDNN}
示例：MagicCommander V3.0.0 Build 26071401
package.json version：3.0.0
Git Tag：v3.0.0-build.26071401
```

### 字段含义

- `MAJOR`：大版本，架构级升级、产品方向变化、重大 UI/功能升级时递增。
- `MINOR`：中版本，新增重要模块或明显功能增强时递增。
- `PATCH`：修订版本，bug 修复、小功能优化、体验改进时递增。
- `YYMMDDNN`：日期型构建号，`YY` 年、`MM` 月、`DD` 日、`NN` 当天构建序号，从 `01` 开始。

### 强制约束

- `package.json` 的 `version` 只使用标准语义化版本，例如 `3.0.0`。
- 正式版不要使用 `3.0.0-26071401` 这类连字符后缀，避免被识别为预发布版本，影响 Electron 自动更新和版本比较。
- 对用户、发布说明、问题反馈统一展示完整版本，例如 `V3.0.0 Build 26071401`。
- 每次正式发布必须同步更新 `VERSION.txt`、`electron/config.ts` 中的版本信息，并创建对应 Git tag。

---

## 6. 创建新文档 Checklist

- [ ] 确认文档类型，放入正确的子目录
- [ ] 按 `{文档名}_{版本号}_{日期}.{扩展名}` 格式命名
- [ ] 如果是 HTML 富文档，使用同名文件夹包裹
- [ ] 更新 README.md 中的文档链接（如有必要）
- [ ] 如果是临时文档，放入 `temp/` 目录

---

## 6. 维护规则

- **`temp/` 目录**：每个版本发布前清理一次
- **`DOCUMENT_CONVENTIONS.md`**：本文档本身不受命名规范约束，始终位于 `docs/` 根目录
- **README.md**：始终指向最新版本的 PRD 和 Spec 文档