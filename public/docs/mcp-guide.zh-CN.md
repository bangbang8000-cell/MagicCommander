# MCP 接入指南（Agent Connect）

5.1 系列将 MagicCommander 封装为标准 **MCP Server（Agent Connect）**，外部 AI Agent / 编程智能体（Claude / Codex / Trae Work / VS Code 等）可通过标准 MCP 协议直接查询、创建、更新、渲染项目、模板、设备库与输出。

> 本页顶部提供「一键复制接入配置」按钮；`<工作区目录>` 请替换为你的 workspace 路径，`<仓库根>` 为 MagicCommander-Client 的绝对路径。

## 1. 前置条件

- 已安装 MCP SDK：`pip install "mcp>=1.2.0"`
- 应用「设置 → AI → Agent Connect」已开启（可切换 `compiled` / `source` 模式）

## 2. 三步接入

1. **开启**：设置 → Agent Connect，打开开关
2. **复制配置**：按下方你的 Agent 客户端粘贴对应配置
3. **自检**：设置页点击「自检」逐项绿灯即接入成功

## 3. 各客户端配置示例

### Claude Desktop（`claude_desktop_config.json`）

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

### Codex CLI（`.codex/config.toml`）

```toml
[mcp_servers.magiccommander]
command = "python"
args = ["-m", "ai_hub.mcp_server.run", "--mode", "compiled", "--workspace", "<工作区目录>"]
cwd = "<仓库根>"
```

### Trae Work / VS Code（`.mcp.json`）

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

## 4. 双场景模型

| 模式 | 场景 | 能力 |
|------|------|------|
| **编译态**（默认） | 产品使用 | 标准 MCP 查询 / 创建 / 更新 / 渲染项目、模板、设备库、输出；**不修改软件本体** |
| **源码态** | 开发者（`npm run dev:all`） | 追加 CLI 透传与源码直读（`run_cli` / `read_file` / `list_dir` / `read_source`，沙箱内越权拒绝），无限制交互 |

## 5. 常用工具（Agent 会话内调用）

- 项目：`list_projects` `get_project_info` `create_project` `update_project` `export_project`
- 模板：`template_list` `create_template` `update_template` `preview_template`
- 渲染：`render_config` `render_yaml` `dry_run` `undo_render` `diff_compare`（长耗时自动异步，返回 `task_id`）
- 输出：`generate_labels` `generate_label_md`
- 校验：`validate_template` `validate_excel` `analyze_project`
- 知识 / 技能：`list_knowledge` `search_knowledge` `add_knowledge`；`list_skills` `get_skill` `update_skill` `skill_optimize`
- 异步任务：`task_submit` `task_query` `task_list` `task_wait` `task_cancel`
- 审计 / 反馈：`audit_query` `agent_feedback`

## 6. 确定性语义

- **入参契约（L1）**：每个工具定义 JSON Schema，入参非法返回结构化错误（`AC_ERR_*` 错误码 + 可读提示）
- **语义校验（L2）**：写入结果结构校验，不合法不落盘
- **幂等事务（L3）**：相同请求（projectId + planHash）重复提交返回"已存在"与原结果，不重复写入

## 7. 运维与排错

| 现象 | 检查项 | 修复 |
|------|--------|------|
| 连接失败「MCP SDK 未安装」 | `pip show mcp` | `pip install "mcp>=1.2.0"` 后重启应用 |
| 工具列表为空 | 设置开关 | 开启 Agent Connect 后再连接 |
| 权限提示频繁 | `--mode` | 编译态写入需确认属预期；开发场景切 `--mode source` |
| 审计缺失 | 审计开关 | 设置中开启审计；`--audit <path>` 指定路径 |

- 自检：`GET /api/chat/agent-connect/selfcheck`（SDK / 开关 / 工具 / 审计逐项绿灯）
- 审计查询：`audit_query`；平台汇聚 `POST /api/v1/agent-connect/audit`
- 远程模式（试点）：平台网关 `POST /api/v1/agent-connect/remote/invoke`（TLS + 强鉴权 + 按域授权，远程写默认关闭）
- 反馈自优化：`agent_feedback`；平台汇聚 `POST /api/v1/agent-connect/feedback`
