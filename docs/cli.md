# MagicCommander CLI 能力层（mc）

> 版本：`mc-cli` 1.0.0（CLI 契约版本，与产品版本解耦）
> 说明：MagicCommander 后端能力对外的显式命令行接口。GUI（Electron）与 CLI 共用同一后端脚本 `backend/main.py`；命令行为与图形界面一致。

## 1. 概览

- **命令树**：`backend/main.py` 手工构建 argparse 树（13 顶层命令 + 多级子命令）。完整清单见 `mc <命令> --help`。
- **唯一输出出口**：`_safe_print(text, file=None)`。**stdout 仅含命令业务输出**（成功信息 + JSON 结果）；**错误/警告走 stderr**，保证管道解析安全。
- **退出码契约**（MC-CLI-A1，对齐 AL）：见 §7。
- **status 契约**（MC-CLI-A6）：stdout JSON 顶层 `status` 只用 `success/error/warning/progress/complete` 五种，见 §8。
- **版本**：`mc --version` 输出 `main.py <产品版> (mc-cli <契约版>)`。
- **契约守卫**：`scripts/check_cli_contract.py`（C1–C7），CI 阻断。

## 2. 环境与运行

CLI 是 `backend/` 下的 Python 模块，与后端共用同一运行环境（Python 3.10+，依赖见 `backend/requirements.txt`）。

```bash
cd backend
python main.py --version        # main.py 5.4.2 (mc-cli 1.0.0)
python main.py --help           # 列出 13 个顶层命令
```

打包态由 Electron `render.handler.ts` 以子进程方式调用同一 `main.py`，参数与 CLI 完全一致。

## 3. 命令速查表（13 顶层命令）

| 命令 | 子命令 | 说明 |
|------|--------|------|
| `plan` | `import` / `analyze` / `validate` / `verify` | AIDC plan:table 导入与分析 |
| `project` | `list` / `create` / `delete` / `info` / `package` / `read-excel` / `write-excel` / `read-file` / `write-file` / `list-files` | 项目管理操作 |
| `device` | `library export` / `library import` | 设备库导入导出（跨端资产互灌） |
| `render` | `project` / `yaml` / `undo` / `dry-run` | 配置渲染 |
| `validate` | `template` / `excel` / `consistency` / `output` / `ip` / `all` / `manifest` | 校验 |
| `review` | `report` / `package` / `md` | 项目评审报告 / 评审包 |
| `share` | `snapshot` | 项目分享只读快照 |
| `diff` | （无子命令） | 对比 dry-run 输出与既有输出文件 |
| `analyze` | `project` | 分析项目模板与参数表 |
| `proofread` | `project` | 智能校对（模板语法 / 缺失列 / 数据空值） |
| `template` | `preview` / `list` / `save` / `update` / `delete` | 模板中心（`example/` 目录） |
| `label` | `print` / `md` / `delete` | 标签功能 |
| `file` | `delete` / `list` | 项目文件操作 |

> epilog（`mc --help` 尾部）由 `_build_epilog()` 生成，与本表对账；`check_cli_contract.py` C5 保证不含已移除命令。

## 4. 常用命令示例

### 4.1 project — 项目管理

```bash
mc project list                      # 列出所有项目（--format text|json|yaml，默认 text）
mc project info 1 --format json      # 项目信息
mc project create "test-project"     # 创建项目
mc project delete 3                  # 删除项目（🔴 confirm）
mc project list-files 1              # 列出项目文件（JSON）
mc project read-file 1 project_config.json
mc project write-file 1 config.json --content '...'
mc project package export 1 --output backup.zip
mc project package import backup.zip
```

### 4.2 render — 配置渲染

```bash
mc render project 1                  # 按 device_name 渲染项目配置
mc render project 1 --naming device_sn   # 按设备 SN 渲染（输出到 output-sn/）
mc render yaml 1,2,3                 # 渲染 YAML 文件
mc render yaml 1 --naming device_sn  # 按 SN 渲染 YAML
mc render dry-run 1                  # 渲染预览（不写文件，返回输出内容）
mc render undo 1                     # 撤销渲染（恢复最近一次备份）
```

> **`--naming` vs `--format`**：render/diff 的命名标识用 `--naming {device_name,device_sn}`；
> 输出形态用 `--format {text,json,yaml}`（project list/info）或 `--format {text,json}`（template list）。
> 两者语义不同，勿混用（MC-CLI-A5 批次 B 拆分）。

### 4.3 label — 标签

```bash
mc label print 1                     # 打印标签
mc label md 1                        # 生成 Markdown 标签
mc label delete 1                    # 删除标签
```

### 4.4 file — 文件操作

```bash
mc file list 1                       # 列出项目文件
mc file delete output 1              # 删除输出文件
```

### 4.5 diff — 输出对比

```bash
mc diff --project 1 --device gpu-1 --content '...'
mc diff --project 1 --device gpu-1 --naming device_sn --content '...'
```

### 4.6 plan — AIDC plan:table 桥接

```bash
mc plan import plan.json                          # plan:table → MC 项目
mc plan import plan.zip --project-dir my-project  # .zip 交付包
mc plan import plan.json --rehash                 # 导入前按 macro 重算 planHash
mc plan analyze 1                                 # j2 模板 ↔ 规划字段对齐检查
mc plan validate plan.json                        # 专业校验（设备名/IP/AS/VLAN/网关）
mc plan verify 1                                  # 渲染命令核对矩阵
```

### 4.7 validate — 校验

```bash
mc validate template 1               # 校验 Jinja2 模板语法
mc validate excel 1                  # 校验 Excel 数据完整性
mc validate consistency 1            # 一致性校验
mc validate output 1                 # 导出数据核对
mc validate ip 1                     # IP 规划校验
mc validate all 1                    # 全量校验
mc validate manifest 1               # 交付物清单校验
```

### 4.8 review / share / analyze / proofread / template / device

```bash
mc review report 1                   # 评审报告 JSON
mc review package 1 --output review.zip   # 评审包 zip
mc review md 1                       # 评审报告 → Markdown

mc share snapshot 1                  # 只读分享快照 JSON

mc analyze project 1                 # 模板 ↔ 参数表分析
mc proofread project 1               # 智能校对

mc template list                     # 列出示例模板
mc template preview <file>           # 调试沙盒：渲染指定模板
mc template save 1 --name my-template
mc template update <name> --content '...'
mc template delete <name>

mc device library export --output devices.zip
mc device library import devices.zip
```

## 5. 输出格式

`--format` 语义按命令分组（**MC-CLI-A5 已明确拆分**）：

| 命令 | `--format` 取值 | 默认 |
|------|----------------|------|
| `project list` / `project info` | `text` / `json` / `yaml` | `text` |
| `template list` | `text` / `json` | `json` |
| `render *` / `diff` | 命名标识 → 改用 `--naming`（`device_name` / `device_sn`） | `device_name` |

- `json`：结果整体 JSON 序列化。
- `text`：键值对逐行输出。
- `yaml`：YAML 序列化。

**stdout 纯净约定**：成功信息与 JSON 结果走 stdout；错误/警告走 stderr。

## 6. Electron 契约

GUI 经 `electron/ipc/render.handler.ts` 以子进程调用 `main.py`：

1. stdout 逐行解析 JSON → `queueProgress(parsed)`（进度事件）；
2. 进程退出码 0 时，用 `extractLastJson(output)` 提取**最后一个合法 JSON 对象**（支持跨行 + 进度消息混合）；
3. 依据该对象顶层 `status` 判定成功/失败（见 §8）。

## 7. 退出码

> **MC-CLI-A1 起为破坏性变更**：此前 MC 只有 0/1 两档，非法输入曾返回 0；新行为与 AL 四档统一。

| 码 | 含义 | 触发场景 |
|----|------|----------|
| 0 | 成功 | 命令正常完成；`[y/N]` 取消 |
| 1 | 内部异常（未预期） | 未捕获异常 |
| 2 | 参数或配置错误 | argparse 错误 / 缺必填 / 项目不存在 / 名称非法 / 路径越界 / 未加 `--force` |
| 3 | 执行失败 | 业务处理异常、部分项目失败、空结果 |
| 130 | 中断 | `KeyboardInterrupt`（SIGINT 惯例） |

## 8. status 取值契约（MC-CLI-A6）

stdout JSON **顶层** `status` 仅允许以下五种（`backend/main.py` 常量 `STATUS_*`）：

| 值 | 含义 | Electron 处理 |
|----|------|---------------|
| `success` | 业务成功 | 按成功 |
| `complete` | 渲染流水线终态（历史命名，`pre_processing.py`） | 按成功 |
| `warning` | 成功但有降级/跳过（如权限跳过目录） | **按成功**（此前被误判为失败） |
| `error` | 业务失败（配合退出码 3） | 按失败 |
| `progress` | 长任务进度事件（流式，非终态） | 呈现进度，不终结 |

> `pass` / `fail` / `warn` 仅出现在 `results[]` **嵌套项**内（校验项状态），**不属于顶层契约**。
> 守卫 `check_cli_contract.py` C7 扫描 `main.py` / `pre_processing.py` 阻断白名单外取值。

## 9. 审计日志（MC-CLI-A7）

每次 CLI 执行写一行 JSON 到 `mc-audit.jsonl`（命令 / 参数脱敏 / 结果 / 退出码）：

```json
{"ts": "2026-09-27T17:38:22.123456", "command": "template:update", "argv": ["template", "update", "x", "--content", "***"], "params": {"command": "template", "subcommand": "update", "content": "***"}, "ok": true, "exitCode": 0}
```

- **路径优先级**：`MC_AUDIT_PATH`（测试注入）＞ `$MC_USER_DATA/audit/mc-audit.jsonl`（Electron spawn 注入）＞ `~/.magiccommander/audit/mc-audit.jsonl`。
- **脱敏**：参数键名含 `password` / `secret` / `token` / `api_key` / `apikey` / `content` 时，值替换为 `***`（argv 与 params 双路径脱敏）。
- **失败留痕**：执行失败/异常也写入（`ok: false` + `error` + 实际 `exitCode`）。
- **不阻塞**：审计写入失败静默忽略，绝不阻断主流程。
- **开关**：`MC_AUDIT_DISABLED=1` 关闭（打包态默认开启）。

## 10. 与 AL CLI 的差异

| 维度 | AL（autolink-cli） | MC（mc） |
|------|-------------------|----------|
| 命令数 | 24 域 67 action（三级子命令） | 13 顶层命令（多级子命令） |
| 入口 | `python -m cli` | `python main.py` |
| 契约版本 | `CLI_VERSION = 1.0.0` | `MC_CLI_VERSION = 1.0.0` |
| 退出码 | 0/1/2/3 | 0/1/2/3（+130） |
| 审计 | `cli-audit.jsonl`（含脱敏） | `mc-audit.jsonl`（MC-CLI-A7，含脱敏） |
| status 契约 | 结构化 `{error, error_code}` | `{status: ...}` 五值白名单 |
| 参数 schema | `ACTION_PARAM_SCHEMA`（67/67 覆盖） | argparse 具名 flag |
| 契约守卫 | `check_cli_contract.py` C1–C4 | `check_cli_contract.py` C1–C7 |
