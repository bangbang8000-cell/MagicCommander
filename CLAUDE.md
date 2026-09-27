# CLAUDE.md — MagicCommander Client

> **Claude Code 专用指令。** 完整工程指南见 [`AGENT.md`](AGENT.md)（本文件是其精简执行版，冲突时以 `AGENT.md` 为准）。
> 人读入口见 [`README.md`](README.md)。
>
> ⚠️ 本仓历史上 `AGENT.md` 曾指向 `D:\MyCoding\MagicCommander\MagicCommander3` 与版本 3.0.0 —— **已作废**。
> 当前路径 = 本仓根，当前版本 = `5.4.2`（`version.json` 单源）。

## 你是谁 / 在哪

你在 **MagicCommander Client** 仓库中工作 —— 网络设备配置批量生成工具。
把「Excel 参数表」+「Jinja2 模板」渲染成全部设备的配置文件 + 标签。
技术栈：Electron + React 18 + TS + Vite（`src/`、`electron/`）+ Python 3.12（`backend/` + `ai_hub/`）。

本仓是 **MC-AL 联合工作区**的双端之一，与 `../AIDC AutoLink-Client` 构成同构对。
工作区级长期约定在 `../.workbuddy/memory/MEMORY.md`，**动跨端改动物必先读**。

## 基本动作

```bash
npm ci --ignore-scripts && pip install -r backend/requirements.txt && pip install -r ai_hub/requirements.txt
npm run dev:all                # 开发（vite :5173 + electron）
npm run typecheck && npm run lint
npm test                       # vitest（renderer + electron 两套）
npm run check-version          # 版本单源
python scripts/check_cli_contract.py   # 改 backend/main.py 后必跑
```

## 硬约束（务必遵守）

1. **禁止 `git add -A`** —— 显式列路径提交。
2. **改 `ai_hub/mcp_server/` 必须同步 `../AIDC AutoLink-Client/backend/autolink_hub/mcp_server/`**
   （逐行同构），两端各跑 10 个 `test_agent_connect_*.py`。
3. **打 tag 前先 `git fetch origin --tags` / `git ls-remote --tags origin`**；
   **先推 main 再推 tag**；发版后 `git push syno main --tags`。
   仅 MAJOR/MINOR/PATCH 变化才打 tag，**Build 号变化不打 tag**。
4. **不要手工改版本号** —— 改 `version.json` 后跑 `node scripts/sync-version.js`。
5. **改 `backend/main.py` 后必跑 `python scripts/check_cli_contract.py`**（C1~C7 契约）。
6. **大文档多处修改要串行**（并发 `Edit` 会互相覆盖且报 success）——优先整篇 `Write`；改完 `grep` 回看。
7. **stdout 纯净**：`_safe_print(text, file=None)` 是唯一输出出口；错误/警告走 `sys.stderr`。
8. **退出码**：0 成功 / 1 内部异常 / 2 参数或配置错误 / 3 执行失败 / 130 KeyboardInterrupt
   （与 AL 逐位一致；`check_cli_contract.py` 会守）。

## 本地"假红灯"（别误判为回归）

- pytest 上千 `UnicodeDecodeError ... 0xce` 发生在 **capture setup/teardown**（GBK 子进程），**不是测试失败**；
  vitest `Failed to start forks worker` 但 `Test Files passed` 同理。
- 判回归：`git stash` 造干净树跑同一命令对比；**不要用 shell 抓 pytest summary**，用 `--junit-xml=` + 解析。
- **覆盖率是棘轮**：`tests/coverage_baseline.json` 只升不降。

## Agent Connect 要点

- MCP 启动：`python -m ai_hub.mcp_server.run --workspace <dir>`（**AL 是 `--user-data`**）。
- 授权档 `--grant readonly|semi|full`（默认 `semi`；`full` 必须配 `--audit` 否则拒绝启动）。
- **`full` 不豁免编译态屏蔽**：授权管「要不要确认」，模式管「可不可见」，二者正交。
- 长耗时工具**已在 MCP 层自动异步**，拿到 `task_id` 后用 `task_wait`，**不要再包 `task_submit`**。
- MC 的 MCP 工具名**不加前缀**。

## 验证清单（提交前）

```bash
npm run typecheck && npm run lint && npm run format:check
npm run check-version
npm test
python scripts/check_cli_contract.py          # 改 CLI 后
python scripts/validate_device_library.py     # 改设备库后
python scripts/gen_golden.py --check          # 改渲染输出后
python scripts/validate_consistency.py --check
python scripts/check_coverage_baseline.py
```
CI：`check`（含 Security baseline / 各校验 / pytest）→ `coverage`（阈值 + 棘轮）→ `e2e`。
