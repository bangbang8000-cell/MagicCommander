# AGENT.md — MagicCommander Client

> 面向 **AI 编程 Agent**（Claude Code / Codex / Cursor / 其他）的工程指南。
> 人读入口文档见 [`README.md`](README.md)；Claude Code 请同时读 [`CLAUDE.md`](CLAUDE.md)。
>
> **本仓在 MC-AL 联合工作区中**：与 `../AIDC AutoLink-Client`（AL）构成双端同构对，改动需对照；
> 工作区级长期约定在 `../.workbuddy/memory/MEMORY.md`。
>
> 历史遗留：本文件旧版曾指向 `D:\MyCoding\MagicCommander\MagicCommander3` 与版本 3.0.0，**已作废**。
> 当前路径 = 本仓根，当前版本 = `5.4.2`（见 `version.json`）。

---

## 1. 项目定位

**MagicCommander** = 网络设备配置批量生成工具。

把「用户维护的 **Excel 参数表**」与「用 **Jinja2 语法**编写的 **设备配置模板**」结合，
一键渲染出全部设备的标准化配置文件 + YAML 中间文件 + 可打印设备标签（Word / Markdown）。
内置 AI 对话面板（自然语言驱动渲染 / 分析 / 优化）。

**与 AL 的分工**：MC 负责「渲染」（Excel + 模板 → 设备配置），AL 负责「规划」（GPU 规模 → 组网与机房方案）。
两者以 **`plan:table v1.3`** 契约衔接：AL 导出的规划表可被 MC 消费。

---

## 2. 技术栈与版本

| 层 | 技术 |
|---|---|
| 桌面外壳 | Electron（主进程 `electron/`，preload 桥接） |
| 渲染层 | React 18 + TypeScript 5 + Vite + TailwindCSS；Jinja2 编辑器用 Monaco |
| 后端引擎 | Python 3.12（`backend/`）+ AI 中枢（`ai_hub/`），随包 PyInstaller 打包 |
| AI / Agent | 内建 AI 助手（`ai_hub/agent/`、`ai_hub/llm/`）+ 外部 Agent 接入 MCP（`ai_hub/mcp_server/`） |
| 测试 | vitest（renderer + electron 两套配置）+ pytest + Playwright |
| CI | GitHub Actions（`.github/workflows/ci.yml` + `build.yml`） |

**版本单源**：`version.json` → 由 `scripts/sync-version.js` 生成/校验 `VERSION.txt` + `package.json`。
```
version.json = { version: 5.4.2, build: 26092701, displayVersion: "V5.4.2 Build 26092701" }
```
校验：`npm run check-version`（`sync-version.js --check`）。发布说明抽取：`npm run release-notes`。

**版本号规则（长期）**：
- 对外显示：`MagicCommander V{MAJOR}.{MINOR}.{PATCH} Build {YYMMDDNN}`（如 `V5.4.2 Build 26092701`）。
- `package.json version` 只留语义化版本（`5.4.2`）。
- Git Tag 用 `v{MAJOR}.{MINOR}.{PATCH}`；**仅 MAJOR/MINOR/PATCH 变化才打 tag**，
  Build 号变化不打 tag（避免污染 Release 列表）。
- **不要把正式版写成 `5.4.2-26092701`** —— 连字符后缀会被语义化版本识别为预发布版，影响 Electron 自动更新。

---

## 3. 目录布局（只列重要项）

```
backend/                      Python 后端（Excel 解析 / 渲染 / 校验 / CLI）
  main.py                     ★ CLI 入口（手工 argparse 树，13 顶层 / 59 子命令）
  ExcelToLabel.py             设备标签生成
  analyzer.py / proofread.py  分析与校对
  validation/                 数据校验
  tests/                      后端测试
ai_hub/                       AI 中枢（Agent Connect 宿主）
  agent/                      程序内建 AI 助手（AgentSession，自主模式）
  mcp_server/                 ★ 与 AL 逐行同构，改动必须双端同步
  mcp/                        程序作为 MCP 客户端（连接外部 MCP Server）
  knowledge/ memory/ skills/  知识库 / 记忆 / 技能（自学习）
  llm/                        多供应商 LLM 接入
src/                          前端（renderer）
electron/                     主进程 + preload
example/                      模板中心（模板 + 项目示例）
tests/                        前端测试 + 覆盖率阈值/基线
e2e/                          Playwright 用例
scripts/                      门禁与工具脚本（见 §5）
docs/                         项目文档（cli.md / agent-connect/ 等）
memory/  workspace/  output/  运行时数据
```

---

## 4. 常用命令

```bash
# 依赖（首次）
npm ci --ignore-scripts
pip install -r backend/requirements.txt
pip install -r ai_hub/requirements.txt

# 开发（vite :5173 + electron）
npm run dev:all

# 构建 / 打包
npm run build                 # renderer + electron 主进程
npm run dist:all              # 三平台

# 类型 / 风格
npm run typecheck             # 含 electron/tsconfig.json 两套
npm run lint
npm run format:check

# 测试
npm test                      # vitest（renderer + electron 两套）
npm run test:renderer
npm run test:electron
npm run e2e

# 版本与门禁
npm run check-version
npm run release-notes
npm run golden:check
npm run validate-templates
npm run validate-samples
python scripts/check_cli_contract.py          # CLI 契约守卫 C1~C7
python scripts/check_doc_numbers.py
python scripts/validate_device_library.py
python scripts/validate_consistency.py --check
python scripts/check_coverage_baseline.py
```

---

## 5. 门禁与验证（**改代码前先想清楚要跑哪些**）

| 门禁脚本 | 作用 | 何时必跑 |
|---|---|---|
| `scripts/check_cli_contract.py` | **CLI 契约守卫 C1~C7**：①退出码常量取值 ②禁裸 `sys.exit(数字)`（130 白名单）③`--version` 禁硬编码 ④`print_error/warning` 须走 stderr ⑤epilog 无残留命令 ⑥`docs/cli.md` ↔ 顶层命令树对账 ⑦stdout JSON 顶层 `status` 白名单（`success/error/warning/progress/complete`） | **改 `backend/main.py` 必跑** |
| `scripts/sync-version.js --check` | 版本单源（`version.json` → `VERSION.txt` + `package.json`） | 任何版本改动 |
| `scripts/validate_templates.py` | 模板库有效性 | 改模板/渲染 |
| `scripts/validate_device_library.py` | 设备库校验（id 唯一/字段完整/protocol/角色映射/AL 对账） | 增删设备 |
| `scripts/gen_golden.py --check` | golden 基线比对（渲染文本 / 批次清单结构） | 改渲染输出 |
| `scripts/validate_samples.py` | AIDC 示例自动化验收（打开/渲染/导出/回灌幂等/golden 确定性） | 改示例 |
| `scripts/validate_consistency.py --check` | 数据准确性（一致性/导出核对/IP 规划，有 error 即失败） | 改数据链路 |
| `scripts/bench_perf.py` | 性能门禁（批量渲染 / 单项目全量渲染超阈值退出码 1） | 性能敏感改动 |
| `scripts/check_coverage_baseline.py` | **覆盖率棘轮（只升不降）** | 提交前 |
| `scripts/check_doc_numbers.py` | 以代码为唯一真值源反查文档数字 | 改文档数字 |
| `scripts/check_scenario_names.py` | 场景命名一致性 | 改场景/示例命名 |
| CI 内联 | **渲染层安全基线**：0 Node/主进程直连（`require`/`process.`/`ipcRenderer`/`child_process`/`spawn`）+ 网络请求白名单（MC 云平台集成合法使用 `fetch`，白名单 `src/api/`、`platform.store.ts`、`CloudStatusIndicator.tsx`、`SettingsPanel.tsx`、`jinja-textmate.ts`） | 改 `src/` |

**CI 结构**（三个 job）：
- `check`：typecheck → lint → format:check → check-version → release-notes → Security baseline → npm test →
  build → validate_templates → validate_device_library → doc numbers → validate_samples → gen_golden --check →
  bench_perf → validate_consistency → pytest(backend) → pytest(ai_hub)
- `coverage`：后端覆盖率门禁（阈值来自 `tests/coverage_thresholds.json`）+ 前端 vitest --coverage +
  棘轮 `check_coverage_baseline.py` + 质量报告
- `e2e`：Electron 启动 → 建项目 → 渲染 → 导出 冒烟三件套

---

## 6. 硬性纪律（违反会造成静默错误）

1. **不要 `git add -A`** —— 会静默纳入临时文件。**显式列路径**。
2. **双端同构**：`ai_hub/mcp_server/` ↔ `../AIDC AutoLink-Client/backend/autolink_hub/mcp_server/`
   逐行同构。改一端**必须**同步另一端，并各跑 10 个 `test_agent_connect_*.py`。
3. **打 tag 前先与远端对账**：`git fetch origin --tags` / `git ls-remote --tags origin`。
   **本地 `git tag` 缺失 ≠ 未发版**。
4. **大文档多处编辑必须串行**（同一文件并发 `Edit` 会互相覆盖且仍报 success）
   ⇒ 改完 `grep` 回看锚点；整篇 `Write` 重写更安全。
5. **不要手工改版本号** —— 用 `node scripts/sync-version.js`（`version.json` 是单源）。
6. **写 JSON 必须 `newline='\n'`**；批量改 markdown 表格用 `grep -n` 按行号替换，**禁 `sed`**。
7. **跨模块键名/口径耦合必须端到端验证**：单测手搓数据全绿也可能漏掉生产者/消费者键名不一致的静默失效。

### 6.1 领域级不变量

- **`write_gate.py` 是写入语义层**（L2 结构 + L3 幂等），**不管"是否允许执行"**；
  门禁顺序 `模式校验 → 权限门禁 → write_gate`。
- **渲染带输入指纹缓存** —— 参数与模板未变化时复用上次结果。改缓存键须评估失效策略。
- **MC 设备库规模远小于 AL**（仅 13 台，无 H200/B300/Q3400/Spectrum-X）；MC 模板中心 = `example/` 目录。
- **`project_single.py` 无条件产全部角色 j2** —— 若做「按协议跳过 j2」需改此处。

---

## 7. CLI（`backend/main.py`）

- **手工 argparse 树**：13 顶层命令 / 59 个 `add_parser` / 83 个 `add_argument`。
- **退出码**（与 AL **逐位一致**）：`EXIT_OK=0` / `EXIT_INTERNAL=1` / `EXIT_USAGE=2` / `EXIT_EXEC=3`。
  - 域级归类：参数/前置条件（不存在/非法/未加 `--force`）→ **2**；业务处理异常 → **3**；
    顶层未预期异常 → **1**；成功 / `[y/N]` 取消 → **0**；`KeyboardInterrupt` → **130**（SIGINT 惯例）。
- **stdout 纯净**：`_safe_print(text, file=None)` 是**唯一输出出口**；`print_error`/`print_warning` 固定
  `file=sys.stderr`。stdout 仅含命令业务输出。
- **`_product_version()` 三路径回退**：`<backend上级>/version.json` → `VERSION.txt` → `$MC_VERSION_FILE`。
  ⚠️ **打包态 `backend/` 在 `resources/backend/`、`version.json` 在 `app.asar` 内**
  ⇒ 开发态能读、打包态须靠 env 注入。**改「从上级读文件」逻辑前先查 `package.json` 的
  `extraResources` / `files`**。
- **`MC_CLI_VERSION = '1.0.0'`** 表达 **CLI 契约版本**，与产品版本解耦。
  `--version` 输出 `main.py <产品版> (mc-cli <契约版>)`。
- **`--format` vs `--naming`（批次 B 拆分）**：`render *` / `diff` 的**设备命名标识**用
  `--naming {device_name,device_sn}`；**输出形态**用 `--format {text,json,yaml}`（`project list/info`）
  或 `--format {text,json}`（`template list`）。两者语义不同，**改 CLI 时勿混用**。
- **status 契约（MC-CLI-A6）**：stdout JSON **顶层** `status` 仅 `success/error/warning/progress/complete`
  五种（常量 `STATUS_*`）⇒ Electron `render.handler.ts` 按此判定成败；`warning` 按成功处理。
  `pass/fail/warn` 仅在 `results[]` 嵌套项内。**由 C7 守卫**。
- CLI 文档契约在 `docs/cli.md`（与顶层命令树对账，由 `check_cli_contract.py` 守卫）。
- **审计日志（MC-CLI-A7）**：每次 CLI 执行写 `mc-audit.jsonl`（含脱敏 params/argv + `exitCode`）。
  路径优先级 `MC_AUDIT_PATH` > `$MC_USER_DATA/audit/mc-audit.jsonl` > `~/.magiccommander/audit/`；
  `MC_AUDIT_DISABLED=1` 关闭。**审计写入失败不阻塞主流程**。

---

## 8. Agent Connect（MCP Server，`ai_hub/mcp_server/`）

外部编程 Agent 通过 MCP 控制程序。**Agent 工具面：53 工具 / 11 域**（编译态可见 9 域）。

**启动参数（MC 与 AL 不同，写错会静默用空路径）**：
```bash
python -m ai_hub.mcp_server.run --workspace <工作区目录> \
       [--mode advisor|semi_auto|full_auto|compiled] [--audit <审计文件>] [--grant readonly|semi|full]
```
AL 侧对应是 `--user-data <dir>`（**不是** `--workspace`）。

**权限模型**：
- **工具档位**：`AUTO`（🟢）/ `NOTIFY`（🟡）/ `CONFIRM`（🔴）；未登记工具**兜底 CONFIRM**（保守）。
- **授权档 `--grant`**：
  - `readonly` —— 仅 AUTO 放行；
  - `semi`（**默认**）—— AUTO + NOTIFY 放行，CONFIRM 走门禁；
  - `full` —— 全放行（**必须**配 `--audit`，否则**拒绝启动**）。
  - 优先级：`--grant` > 环境变量 `MC_AGENT_GRANT` > 默认 `semi`。
- **⚠️ 铁律（AG-3 裁定）**：**`full` 档不豁免编译态屏蔽规则**。
  **授权管「要不要确认」，模式管「可不可见」，二者正交。**
  `delete_*` / `run_cli` / `read_file` / `list_dir` / `read_source` 在 `compiled` 模式下**仍然不可见**。
  守卫用例：`test_full_grant_does_not_unblock_destructive`。
- **长耗时工具在 MCP 层已自动异步** ⇒ 调用后拿 `task_id` + `task_wait`，**禁止**再套 `task_submit`。
- **MC 的 MCP 工具名不加前缀**（`list_projects` → `list_projects`）。

**跨端参数名不通用**（易错）：导入源 AL `source` / MC `zipPath`；导出目标 AL `outputPath` / MC `targetDir`；
技能名 AL `name` / MC `skillName`；知识条数 AL `top_k` / MC `topK`。

**同名工具跨端行为不同**：`create_project` AL→`project_create`、MC→`create_project_intelligent`；
`read_file` AL=🔴confirm 仅源码态、MC=🟢auto；`export_project` AL=🟡notify、MC=🟢auto。

**技能自学习机制与 AL 不同**：MC 用 per-skill `.meta.json` + `maybe_self_improve`（阈值驱动 + 修订版本）；
AL 用单状态文件。**两端不互通**。

**程序作为 MCP 客户端**（`ai_hub/mcp/manager.py`）：`mcp:<server>:<tool>` 命名空间，
所有外部工具一律 `permission=CONFIRM`（保守，方向与「程序被控制」相反但体现同一保守默认）。

**相关文档**：`docs/agent-connect/README.md`、`docs/agent-connect/claude_desktop_config.json`。
面向旁挂 Agent 的任务级 Skill 包在**工作区** `../agent-skills/`（**非本仓**）。

---

## 9. 发版流程

```bash
# 1) 版本 bump（改 version.json 单源，脚本派生）
#    编辑 version.json 的 version / build / displayVersion / releaseDate
node scripts/sync-version.js
npm run check-version
git add version.json VERSION.txt package.json README.md CHANGELOG.md   # 显式列路径
git commit -m "chore: bump 5.4.3"

# 2) 先推 main
git push origin main

# 3) 打带注释多行 tag（先与远端对账！）
git fetch origin --tags
git ls-remote --tags origin | tail -5
git tag -a v5.4.3 -m "MagicCommander v5.4.3" <commit>
git push origin v5.4.3                        # build.yml 仅 push tag v* 建 Release

# 4) 同步群晖镜像
git push syno main --tags
```

- **远端**：`origin` = GitHub（**唯一发版通道**，`git@github.com:bangbang8000-cell/MagicCommander.git`）+
  `syno` = 群晖 Gitea 镜像。
- `build.yml` 触发：`push tags: ['v*']`（也支持 `workflow_dispatch` 传 `version`）；
  `concurrency: release-<ref>`，`cancel-in-progress: true`。

---

## 10. 已知陷阱

1. **本地「假红灯」**：pytest 上千 errors（`UnicodeDecodeError ... 0xce`）在 **capture setup/teardown**
   （GBK 中文子进程），**不是测试失败**；vitest `Failed to start forks worker` 但 `Test Files passed` 同理。
   ⇒ **判回归必须 `git stash` 造干净树对比**。
2. **不要用 shell 抓 pytest summary** ⇒ `--junit-xml=` 写仓内路径 + Python 解析 XML。
3. **本机 `/tmp` 与 Windows 不通** ⇒ 临时目录用**仓内相对路径**，用完清理。
4. **环境（Windows + Bash 工具）**：PATH 可能损坏，命令前加
   `export PATH="/usr/bin:/bin:/c/Users/everg/.workbuddy/binaries/PortableGit/versions/1.2.0/usr/bin:$PATH";`
   `Glob` 对大仓会超时（优先修好的 PATH + `find`）；`grep -rn` 偶发挂起（改用 Grep 工具）。
5. **`AGENT.md` 与 `agent.md` 在本机是同一文件**（Windows 大小写不敏感），改动只会有一份。
6. **覆盖率是棘轮**：`tests/coverage_baseline.json` 只升不降，覆盖率下降即 CI 红。
7. **MC 打包态读版本文件受限**：优先用 env `MC_VERSION_FILE` 注入，别依赖从上级目录读。

---

## 11. 与 AL 端对照速查

| 项 | MC | AL |
|---|---|---|
| 包名 | `ai_hub` | `autolink_hub` |
| 引擎定位 | 渲染（Excel + Jinja2） | 规划（GPU 规模 → 组网） |
| CLI 入口 | `backend/main.py` | `backend/cli.py` |
| MCP 启动目录参数 | `--workspace` | `--user-data` |
| 授权环境变量 | `MC_AGENT_GRANT` | `AUTOLINK_AGENT_GRANT` |
| 版本派生脚本 | `scripts/sync-version.js` | `scripts/sync_version.py` |
| 契约守卫 | `check_cli_contract.py`（C1~C7） | `check_version.py` 等 |
| 产品版本 | 5.4.2 | 5.4.4 |
| 模板中心 | `example/` | `template/` |
