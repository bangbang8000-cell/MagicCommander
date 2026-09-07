# MagicCommander 使用指南

> 适用于 MagicCommander v5.0.10（含 5.1 系列 Agent Connect）

## 简介

MagicCommander 是一款专业的网络设备配置管理工具。它将设备参数（Excel 表格）与配置模板（Jinja2 语法）结合，一键批量生成标准化网络设备配置文件，并自动生成可打印的设备标签。支持 AI 对话式操作、云端团队协作，全程本地离线运行，数据安全可控。

5.1 系列起，MagicCommander 还能以标准 MCP Server（Agent Connect）形式接入 Claude / Codex / Trae Work / VS Code 等外部 AI Agent，让 Agent 直接查询、创建、更新、渲染项目、模板、设备库与输出。

---

## 快速开始

### 1. 创建项目

1. 点击左侧活动栏 **项目浏览器** 图标（`Ctrl+Shift+E`）
2. 点击顶部 **新建项目**，输入项目名称
3. 项目自动生成 `templates / excel / output / yaml` 四个目录
4. 也可在 **模板中心** 从内置示例模板一键创建（推荐新手）

### 2. 填写设备参数

1. 在项目浏览器中展开 `excel` 目录，双击打开 `hostname.xlsx` 等参数表（内建 Excel 编辑器，所见即所得）
2. 填写设备名、角色、管理 IP、接口、VLAN 等信息
3. 在 `para.xlsx` 中声明要读取哪些 Excel / Sheet 及读取类型
4. 保存文件（`Ctrl+S`）

### 3. 编写配置模板

1. 在 `templates` 文件夹中新建 `.j2` 模板文件
2. 使用 Jinja2 语法引用参数：`{{ info['字段名'] }}`
3. **智能补全**：输入 `info['` 时会自动提示项目 Excel 中的字段名，控制块（if/for）与过滤器也有补全
4. 模板编辑器（Monaco）支持语法高亮、多标签切换（切换不丢撤销历史）

### 4. 执行渲染

1. 切换到 **工作台** 面板（`Ctrl+Shift+W`）——工作台按三步分组：①**配置与就绪** ②**渲染材料与操作** ③**校对与输出**
2. 在 ①配置与就绪 中核对项目/参数就绪状态，在 ②渲染材料与操作 中配置输出格式（配置 / YAML，是否含 SN）并做 dry-run / 校验
3. 点击 **开始渲染**，进度实时可见
4. 输出文件生成到 `output/`（或 `yaml/`），可在 **输出结果** 面板（`Ctrl+Shift+O`）查看，③校对与输出 中可对结果进行分页浏览/导出

> 💡 **渲染缓存**：参数与模板未变化时，再次渲染直接复用上次结果，秒级完成。修改任一参数或模板后自动失效。

---

## 界面介绍

### 活动栏（左侧图标，从上到下）

| 顺序 | 功能 | 说明 | 快捷键 |
|------|------|------|--------|
| 1 | 搜索 | 按文件名/内容搜索，支持单项目或全部项目 | `Ctrl+Shift+F` |
| 2 | 云平台 | Cloud Connect 云端协作（模板市场/项目同步） | `Ctrl+Shift+C` |
| 3 | AI 对话 | AI 智能助手 | `Ctrl+Shift+H` |
| 4 | 项目浏览器 | 项目管理、文件树、模板中心入口 | `Ctrl+Shift+E` |
| 5 | 工作台 | 三步分组（①配置与就绪 ②渲染材料与操作 ③校对与输出）：渲染、标签打印、dry-run、校验 | `Ctrl+Shift+W` |
| 6 | 输出结果 | 渲染输出文件浏览、批量导出 | `Ctrl+Shift+O` |
| 7 | 设置 | 应用 / AI / 平台 / 高级设置 | `Ctrl+,` |

### 菜单栏

经典菜单栏（文件 / 编辑 / 视图 / 工具 / 帮助）：

- **文件**：新建项目、打开项目目录、**最近项目**（最近 5 个历史项目一键打开）、另存为模板、保存、退出
- **编辑**：撤销、重做、剪切/复制/粘贴、快捷键列表
- **视图**：快速切换各活动视图（AI 对话 / 工作台 / 输出结果等）、切换侧边栏/底部面板、切换主题（亮色/暗色/跟随系统）
- **工具**：检查更新、终端、日志查看器
- **帮助**：使用指南、MCP 接入指南、快捷键列表、关于

---

## 核心功能

### 项目管理

- 创建 / 打开 / 删除项目（删除有二次确认）
- 从模板创建项目（模板中心）
- 将项目另存为模板，供团队复用
- 在文件管理器中打开项目目录
- 渲染输出支持撤销（渲染前自动备份最近 5 份）

### 模板中心

1. 在 **项目浏览器** 中进入模板中心标签
2. 浏览模板列表，每个模板带有 **质量评级徽章（A/B/C/D）**
   - 评级基于变量复杂度、Excel 数据质量、交叉引用自动打分
   - 悬停可查看分数
3. 点击 **从模板创建项目**，输入名称即生成标准目录结构
4. 支持将现有项目保存为模板

### 示例项目（AIDC）

MagicCommander 内置 4 个 AIDC（AI 数据中心）示例项目，覆盖 64 / 128 台 H100 集群的 **IB（InfiniBand）** 与 **RoCE（RoCEv2）** 两种组网，每个示例均为「四网合一」（业务&管理 / 参数 / 存储 / 带外）：

| 示例项目 | 规模 | 组网协议 | 收敛比 | 设备数 |
|----------|------|----------|--------|--------|
| 64H100-IB | 64 台 H100 | InfiniBand（NVIDIA Quantum） | 1:1 | 22 |
| 64H100-RoCE | 64 台 H100 | RoCEv2（H3C S9827） | 3:1 | 22 |
| 128H100-IB | 128 台 H100 | InfiniBand（NVIDIA Quantum） | 1:1 | 24 |
| 128H100-RoCE | 128 台 H100 | RoCEv2（H3C S9827） | 3:1 | 24 |

- **IB 与 RoCE 的区别**：IB 使用 NVIDIA Quantum 无损交换机构建专用计算网络，收敛比 1:1，适合低延迟、高吞吐的 HPC/AI 训练；RoCE 基于以太网（H3C S9827 等），启用 PFC/CNP 无损队列，收敛比 3:1，兼顾成本与通用性
- 每个示例含 8 类角色模板（SPINE / LEAF / STO_SPINE / STO_LEAF / BIZ_AGG / BIZ_ACCESS / OOB_AGG / OOB_ACCESS）与完整的 excel 四表、宏观参数（PFC/CNP 队列、BGP、地址段、命名规范）
- 在 **模板中心** 选择示例 → 点击 **从模板创建项目** 即可生成独立副本；副本支持渲染、dry-run 预演，以及 **项目包导出 / 导入**（与其他项目互通）

> 💡 示例资产同样验证了「AL 规划 → MC 渲染」闭环：AL 侧生成的 plan:table 经导入后生成上述项目结构，可打开 / 渲染 / 导出 / 导入。

### 参数配置（Excel 编辑器）

支持的格式：
- `.xlsx` - Excel 2007+ / `.xls` - Excel 97-2003

内建 Excel 编辑器支持：多 Sheet 切换、单元格直接编辑、新增/删除行、保存后写入项目。`para.xlsx` 的 `project_para` sheet 声明渲染管线要读取哪些工作表。

### 模板渲染

模板语法示例：

```jinja2
sysname {{ info['设备名'] }}
#
interface {{ info['网关接口'] }}
 description {{ info['备注'] }}
 ip address {{ info['网关IP'] }} {{ info['网关掩码'] }}
#
{% if info['SSH使能'] == 'yes' %}
ssh server enable
{% endif %}
```

支持的语法：
- `{{ info['字段'] }}` - 变量引用
- `{% for ... %}...{% endfor %}` - 循环
- `{% if ... %}...{% endif %}` - 条件判断
- 过滤器：`| default`、`| length`、`| join` 等

### 渲染预演（Dry-Run）与校验

- **dry-run 预演**：工作台中点击设备旁的预览图标，渲染但不写文件，实时查看每台设备将生成的配置
- **模板校验**：解析全部 `.j2` 文件，提前发现语法错误
- **Excel 校验**：检查文件是否存在、sheet 是否为空、列名是否规范
- **Diff 对比**：dry-run 结果与已有输出一键 diff（绿色=新增，红色=删除），变更一目了然

### 输出类型

| 类型 | 输出目录 | 说明 |
|------|---------|------|
| 配置 | `output/<时间戳>/` | 标准配置文件 (.txt) |
| SN 配置 | `output-sn/<时间戳>/` | 以 SN 命名 (.cfg) |
| YAML | `yaml/<时间戳>/` | YAML 中间数据 |
| YAML+SN | `yaml-sn/<时间戳>/` | SN 命名 YAML |

### 搜索与过滤

- 支持**按文件名**和**按文件内容**两种模式
- **全部项目**开关：跨项目全文搜索（结果带项目名前缀）
- 文件类型过滤：模板 / Excel / 输出 / 文本 / YAML / Markdown
- 结果支持一键跳转到文件编辑

### 标签打印

从设备参数表自动生成设备标签：

1. 在 **工作台** 的标签页中勾选项目
2. 点击 **生成标签**，自动输出 Markdown（`output-label-md/`）与 Word（`output-label/`）格式
3. 支持导出 Word（.docx）和 PDF，可在程序内直接预览
4. 支持 A4/A5 纸张、横纵向、每页标签数量自定义

---

## AI 智能助手

MagicCommander 内建 AI Hub，通过自然语言即可完成项目管理、配置渲染、模板分析等操作。

### 配置 AI 服务

1. 打开 **设置**（`Ctrl+,`）→ **AI** 标签
2. 选择 Provider：DeepSeek / OpenAI / Claude / Gemini / Qwen / GLM / Grok / Ollama / 自定义
3. 填写 API Key 与接口地址（**Ollama 本地部署无需 Key**）
4. 点击 **测试连接** 验证；点击 **获取模型** 选择模型
5. 在高级设置中可配置 AI Hub 端口、自动启动等

### 智能路由

启用智能路由后，按任务类型自动选择最优模型：
- **编码任务**（创建项目、渲染配置）→ 擅长编码的模型
- **分析任务**（模板质量评估）→ 擅长分析的模型
- **问答任务**（帮助、指南）→ 擅长问答的模型
- **推理任务**（复杂优化建议）→ 擅长推理的模型

### 使用 AI 对话

1. 点击活动栏 **AI 对话**（`Ctrl+Shift+H`）
2. AI Hub 自动启动（首次需安装依赖，约 30 秒）
3. 输入自然语言，例如：
   - "列出所有项目"
   - "渲染 test1 项目"
   - "分析 test1 项目的模板质量"
   - "帮我清空 test1 的渲染输出"
   - "从现有配置反向生成模板"
4. AI 自动调用内置工具完成任务并实时展示进度

### 工具权限分级

AI 工具按风险分级，保护你的数据：

| 级别 | 行为 | 示例 |
|------|------|------|
| 自动 | 直接执行 | 列出项目、分析、校验、dry-run |
| 通知 | 执行后通知 | 创建项目、写文件、生成标签 |
| 确认 | 需你回复"确认"后才执行 | 删除项目、渲染配置 |

### 项目分析

AI 可分析项目质量：模板复杂度（变量数、嵌套深度）、Excel 数据质量（空行、重复列、类型异常）、模板与 Excel 交叉引用（缺失/未用列），并给出优化建议。

### 技能库与知识库

AI Hub 内置**技能库**与**知识库**，让 AI 越用越懂你的工作方式：

- **技能（Skills）**：把可复用的操作步骤（如"新项目标准开局流程"）保存为技能，AI 会按技能执行任务；支持启用/禁用、查看详情，并可在使用反馈达到阈值时**自学习修订**（`skill_optimize`）。
- **知识（Knowledge）**：沉淀领域事实（如"某型号设备的推荐配置基线"），AI 在对话中自动检索注入上下文，回答更准确。
- 在 AI 对话中可直接调用：`list_skills` / `get_skill` / `update_skill` / `skill_optimize`、`list_knowledge` / `search_knowledge` / `add_knowledge`。

---

## Cloud Connect 云平台集成

连接自建 MagicCommander Platform 实现团队协作。

### 连接配置

1. **设置** → **平台** 标签
2. 填写服务器地址（如 `http://evergreenzhou.com`）
3. 点击 **测试连接**
4. 点击活动栏云平台图标登录

### 主要功能

| 功能 | 说明 |
|------|------|
| QR 扫码登录 | 飞书 / QQ / 微信扫码，JWT Token 自动刷新 |
| 模板市场 | 浏览/搜索/安装云端模板，按分类筛选 |
| 项目同步 | Push 推送 / Pull 拉取 / 冲突检测 |
| 通知中心 | 平台公告和版本更新提醒 |
| 用户档案 | 个人信息管理、平台账号绑定 |

---

## 软件更新与企业部署

### 更新体验（5.0.9）

- **断点续传**：下载中断后从断点继续，网络不稳也不怕
- **SHA-512 强校验**：安装包下载后校验完整性，防篡改
- **版本回滚**：安装前自动留存上一版本安装包，可在设置中回滚
- **灰度通道**：stable（正式）/ beta（预览）双通道切换（设置 → 更新）

### 企业部署（5.0.9）

企业内网环境可开启「企业部署」模式（默认关闭、隐藏）：

- 配置内网 **updateUrl 镜像** 与代理下载
- 平台 **版本锁定**：按平台 `min_required_version` 强制最低版本

---

## Agent Connect：AI Agent 互联（5.1 系列）

5.1 系列（5.1.1–5.1.10）将 MagicCommander 封装为标准 **MCP Server（Agent Connect）**，让外部 AI Agent / 编程智能体通过标准协议与产品能力交互：查询、创建、更新、渲染项目、模板、设备库与输出；开发场景可追加 CLI 与源码直读。

### 5.1 系列能力地图

| 版本 | 能力 |
|------|------|
| 5.1.1 | Agent Connect 框架：开关 / 双模式 / 状态机 / 审计 / stdio |
| 5.1.2 | 编译态只读能力域 + 入参契约（L1）+ 黄金用例 |
| 5.1.3 | 写入语义层：结果校验（L2）+ 幂等事务（L3） |
| 5.1.4 | 异步任务：task_id + 进度轮询 / 等待 / 取消，渲染导出自动异步 |
| 5.1.5 | 语义完善：幂等重放 + 审计增强（脱敏/耗时/模式）+ 契约测试 |
| 5.1.6 | 接入样板（Claude/Codex/Trae/VS Code）+ 自检 + 结构化错误码 |
| 5.1.7 | 源码态通道：白名单 CLI 透传 + 沙箱文件系统 |
| 5.1.8 | 远程模式试点：平台网关（TLS/强鉴权/按域授权/远程写默认关闭） |
| 5.1.9 | 反馈自优化 + 修复闭环 + 无代码写入约束 |
| 5.1.10 | 双场景黄金回归 + 文档收官 |

### 双场景模型

| 模式 | 场景 | 能力 |
|------|------|------|
| **编译态**（默认） | 产品使用 | 标准 MCP 查询 / 创建 / 更新 / 渲染项目、模板、设备库、输出；**不修改软件本体** |
| **源码态** | 开发者（`npm run dev:all`） | 追加 CLI 透传与源码直读，无限制交互 |

### 编译态工具集

| 能力域 | 常用工具 |
|--------|----------|
| 项目 | `list_projects` `get_project_info` `create_project` `create_project_intelligent` `update_project` `import_project` `export_project` |
| 模板 | `template_list` `create_template` `update_template` `preview_template` |
| 渲染 | `render_config` `render_yaml` `dry_run` `undo_render` `diff_compare`（长耗时自动异步） |
| 输出 | `generate_labels` `generate_label_md` |
| 校验 | `validate_template` `validate_excel` `analyze_project` |
| 知识 / 技能 | `list_knowledge` `search_knowledge` `add_knowledge`；`list_skills` `get_skill` `update_skill` `skill_optimize` |
| 任务 / 审计 / 反馈 | `task_submit` `task_query` `task_list` `task_wait` `task_cancel`；`audit_query`；`agent_feedback` |

> 删除类 / CLI / 文件系统工具在编译态不暴露（源码态可用）。

### 源码态通道（5.1.7）

以 `npm run dev:all` 源码运行、`--mode source` 启动即解锁无限制通道：

- `run_cli`：白名单 CLI 透传（project / template / render / validate / diff / label / analyze / file）
- `read_file(path)` / `list_dir(path)` / `read_source(path)`：沙箱内文件系统（工作区 + 仓库根），越权拒绝
- 写入权限放宽为 NOTIFY 为主，但业务数据校验（L2/L3）不豁免

### 接入外部 Agent（3 步）

> 💡 **程序内指引**：帮助菜单 → **MCP 接入指南** 可直接在工作区打开完整指南（顶部「复制接入配置」一键复制）；设置页 Agent Connect 区块也提供「复制接入配置 / 打开 MCP 接入指南」按钮，无需手动记配置。

1. **开启**：设置 → Agent Connect，打开开关（可切换 `compiled` / `source` 模式）
2. **复制配置**：按下方你的 Agent 客户端粘贴对应配置（`<工作区目录>` 替换为你的 workspace，`<仓库根>` 为 MagicCommander-Client 绝对路径）
3. **自检**：设置页点击「自检」逐项绿灯即接入成功

#### Claude Desktop（`claude_desktop_config.json`）

```json
{
  "mcpServers": {
    "magiccommander": {
      "command": "python",
      "args": ["-m", "ai_hub.mcp_server.run", "--mode", "compiled", "--workspace", "<工作区目录>"],
      "cwd": "<仓库根>"
    }
  }
}
```

#### Codex CLI（`.codex/config.toml`）

```toml
[mcp_servers.magiccommander]
command = "python"
args = ["-m", "ai_hub.mcp_server.run", "--mode", "compiled", "--workspace", "<工作区目录>"]
cwd = "<仓库根>"
```

#### Trae Work / VS Code（`.mcp.json`）

```json
{
  "servers": {
    "magiccommander": {
      "type": "stdio",
      "command": "python",
      "args": ["-m", "ai_hub.mcp_server.run", "--mode", "compiled", "--workspace", "<工作区目录>"],
      "cwd": "<仓库根>"
    }
  }
}
```

> 详细样板、命令参数与排错见 `docs/agent-connect/README.md`。

### 确定性语义层

- **入参契约（L1）**：每个工具定义 JSON Schema，入参非法返回结构化错误（`AC_ERR_INVALID_ARGS` 等错误码 + 可读提示）
- **语义校验（L2）**：写入结果结构校验，不合法不落盘
- **幂等事务（L3）**：相同请求（projectId + planHash）重复提交返回"已存在"与原结果，不重复写入

### 异步任务

渲染 / 导出等长耗时工具自动异步化：调用立即返回 `task_id`，用 `task_query` 轮询进度（percent / message），支持 `task_wait`（同步等待）与 `task_cancel`。Agent 长任务不再超时。

### 操作审计

Agent 对项目/模板/设备的每次改动均记录（Agent / 工具 / 脱敏入参摘要 / 结果 / 耗时），默认关闭、配置后启用；可用 `audit_query` 工具查询，也可汇聚到平台 `/api/v1/agent-connect/audit`。

### 远程模式（试点，5.1.8）

平台提供远程网关 `POST /api/v1/agent-connect/remote/invoke`：TLS + 强 token + 按域授权 + 审计全开；**远程写默认关闭**（仅试点只读/低风险域），需显式放行才能执行写操作。

### Agent 反馈自优化（5.1.9）

`agent_feedback` 沉淀 Agent 交互反馈为知识库条目并产出优化建议；平台 `POST /api/v1/agent-connect/feedback` 汇聚分析，形成"校验 → 建议 → 修复 → 复核"闭环。

### 自检与排错

| 现象 | 检查项 | 修复 |
|------|--------|------|
| 连接失败「MCP SDK 未安装」 | `pip show mcp` | `pip install "mcp>=1.2.0"` 后重启应用 |
| 工具列表为空 | 设置开关 | 开启 Agent Connect 后再连接 |
| 权限提示频繁 | `--mode` | 编译态写入需确认属预期；开发场景切 `--mode source` |
| 审计缺失 | 审计开关 | 设置中开启审计；`--audit <path>` 指定路径 |

---

## 快捷键

| 快捷键 | 功能 |
|--------|------|
| `Ctrl+Shift+F` | 搜索 |
| `Ctrl+Shift+E` | 项目浏览器 |
| `Ctrl+Shift+W` | 工作台 |
| `Ctrl+Shift+O` | 输出结果 |
| `Ctrl+Shift+H` | AI 对话 |
| `Ctrl+Shift+C` | 云平台 |
| `Ctrl+Shift+P` | 命令面板 |
| `Ctrl+B` | 切换侧边栏 |
| `Ctrl+J` | 切换底部面板 |
| `Ctrl+S` | 保存当前文件 |
| `Ctrl+W` | 关闭当前标签页 |
| `Ctrl+Shift+T` | 重新打开最近关闭标签 |
| `Ctrl+,` | 打开设置 |
| `Ctrl+K Ctrl+S` | 快捷键列表 |

---

## 常见问题

**Q: 如何导入设备参数？**
在 `excel/` 目录编辑对应的 `.xlsx` 参数表（内建编辑器），并通过 `para.xlsx` 声明读取关系。

**Q: 模板文件放在哪里？**
放在项目的 `templates` 文件夹，文件后缀为 `.j2`。

**Q: 输出文件在哪里查看？**
在 **输出结果** 面板查看 `output`、`output-sn`、`yaml`、`yaml-sn` 目录，按时间戳组织。

**Q: 如何配置 AI 助手？**
设置 → AI 标签 → 选 Provider → 填 API Key → 测试连接。Ollama 本地部署无需 Key。

**Q: AI Hub 启动失败怎么办？**
Windows 发布版已内嵌 Python。若从源码运行，请确保 Python 3.8+ 并 `pip install -r backend/requirements.txt`。

**Q: 支持哪些 AI 模型？**
DeepSeek、OpenAI、Claude、Gemini、Qwen、GLM、Grok、Ollama 本地模型，以及自定义兼容 OpenAI 接口的 Provider。

**Q: 数据存在哪里？安全吗？**
所有项目数据在本地 `workspace/` 目录。AI 对话与渲染均在本机执行，API Key 本地加密存储。

**Q: 如何让外部 AI Agent（Claude / Codex / Trae / VS Code）操作 MagicCommander？**
5.1 系列起支持 Agent Connect：设置 → Agent Connect 开启 → 按"Agent Connect"章节复制 MCP 配置到你的 Agent 客户端，再运行自检即可。帮助菜单的 **MCP 接入指南** 可在工作区打开完整接入文档并一键复制配置。编译态不修改软件本体，源码态（`npm run dev:all`）可追加 CLI 与源码直读。

---

## 近期版本亮点

### 5.1 系列（Agent Connect，开发完成）

- **Agent Connect（MCP Server）**：双场景（编译态 / 源码态）接入外部 AI Agent（Claude / Codex / Trae / VS Code）
- **确定性语义层**：入参契约 / 语义校验 / 幂等事务，外部 Agent 操作可测可回滚
- **异步任务**：渲染 / 导出长任务自动异步化（task_id + 进度轮询 / 等待 / 取消）
- **操作审计**：Agent 改动全记录（脱敏），可查询、可汇聚平台
- **远程模式试点**：平台网关 TLS + 强鉴权 + 按域授权，远程写默认关闭
- **反馈自优化**：Agent 交互反馈沉淀知识库并产出优化建议

### 5.0 系列（性能 / 质量 / 交付 / 内容资产）

- **5.0.9 升级体验**：断点续传、SHA-512 强校验、版本回滚、灰度通道、企业部署（内网镜像 + 版本锁定）
- **5.0.7 性能**：批量渲染并发自适应（按设备内存收敛防 OOM）、Monaco 编辑器按需加载
- **5.0.5 知识库**：领域知识沉淀，AI 对话自动检索注入
- **5.0.3 技能库自学习**：技能达阈值自动修订，AI 质量持续提升
- **5.0.1-5.0.2 质量**：全量示例重测、AI 工具参数校验与错误可读化

### v3.9.0

#### 安全加固（M1）

- `escapePythonArg` 修复 Windows 路径转义问题
- 修复 zip-slip 路径穿越，`file:` 协议读取限界
- `isTrustedSender` 消息来源校验全覆盖
- `will-navigate` 导航拦截 + 语言白名单
- `MC_Para` 增量写入，避免全量重写

#### 国际化（M2）

- AidcImportDialog 125 处文案全量接入 i18n
- 6 种语言补齐，新增 i18n 门禁（缺失键阻断构建）

#### 导入 UX + 菜单栏 + 工作台重构（M3）

- **导入自动流转**：导入 → 校验 → 细化 一条龙
- 导入/结果分页浏览，支持**真 ZIP 导出**
- tunable 扩展：BGP / 地址段 / 命名
- **经典菜单栏**：文件 / 编辑 / 视图 / 工具 / 帮助（文件含最近项目）
- **工作台三步分组**对齐 AL，无项目空态引导
- ActivityBar 语义色对齐、nav 命名空间统一、Monaco 布局收敛、项目匹配索引

#### 视觉对齐（M5）

- Popover 组件视觉对齐 AL（CSS token 层）

---

## 技术支持

如遇问题，请查看 [GitHub Issues](https://github.com/bangbang8000-cell/MagicCommander/issues) 或提交反馈。
