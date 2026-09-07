# MCP Integration Guide (Agent Connect)

In the 5.1 series, MagicCommander is wrapped as a standard **MCP Server (Agent Connect)**. External AI agents / coding agents (Claude / Codex / Trae Work / VS Code, etc.) can query, create, update, and render projects, templates, device libraries, and outputs over the standard MCP protocol.

> The "Copy config" button at the top of this page copies the MCP config. Replace `<workspace_dir>` with your workspace path and `<repo_root>` with the absolute MagicCommander-Client path.

## 1. Prerequisites

- MCP SDK installed: `pip install "mcp>=1.2.0"`
- Settings → AI → Agent Connect is enabled (toggle `compiled` / `source`)

## 2. Three-step onboarding

1. **Enable**: Settings → Agent Connect, turn the switch on
2. **Paste config**: add the matching config below to your agent client
3. **Self-check**: click Self-check in Settings; when every item is green you are connected

## 3. Config samples per client

### Claude Desktop (`claude_desktop_config.json`)

```json
{
  "mcpServers": {
    "magiccommander": {
      "command": "python",
      "args": ["-m", "ai_hub.mcp_server.run", "--mode", "compiled", "--workspace", "<workspace_dir>"],
      "cwd": "<repo_root>"
    }
  }
}
```

### Codex CLI (`.codex/config.toml`)

```toml
[mcp_servers.magiccommander]
command = "python"
args = ["-m", "ai_hub.mcp_server.run", "--mode", "compiled", "--workspace", "<workspace_dir>"]
cwd = "<repo_root>"
```

### Trae Work / VS Code (`.mcp.json`)

```json
{
  "servers": {
    "magiccommander": {
      "type": "stdio",
      "command": "python",
      "args": ["-m", "ai_hub.mcp_server.run", "--mode", "compiled", "--workspace", "<workspace_dir>"],
      "cwd": "<repo_root>"
    }
  }
}
```

## 4. Dual-mode model

| Mode | Scenario | Capabilities |
|------|----------|--------------|
| **Compiled** (default) | Product use | Standard MCP query / create / update / render projects, templates, device libraries, outputs; **the software itself is never modified** |
| **Source** | Developers (`npm run dev:all`) | Adds CLI passthrough and direct source reading (`run_cli` / `read_file` / `list_dir` / `read_source`, sandboxed with out-of-scope rejection), unrestricted interaction |

## 5. Common tools (callable in agent sessions)

- Project: `list_projects` `get_project_info` `create_project` `update_project` `export_project`
- Template: `template_list` `create_template` `update_template` `preview_template`
- Render: `render_config` `render_yaml` `dry_run` `undo_render` `diff_compare` (auto-async, returns `task_id`)
- Output: `generate_labels` `generate_label_md`
- Validate: `validate_template` `validate_excel` `analyze_project`
- Knowledge / Skills: `list_knowledge` `search_knowledge` `add_knowledge`; `list_skills` `get_skill` `update_skill` `skill_optimize`
- Async tasks: `task_submit` `task_query` `task_list` `task_wait` `task_cancel`
- Audit / Feedback: `audit_query` `agent_feedback`

## 6. Deterministic semantics

- **Input contracts (L1)**: every tool declares a JSON Schema; invalid input returns a structured error (`AC_ERR_*` + human-readable hint)
- **Semantic validation (L2)**: write results are structurally validated before committing
- **Idempotent transactions (L3)**: duplicate submissions (projectId + planHash) return "already exists" with the original result

## 7. Operations & troubleshooting

| Symptom | Check | Fix |
|---------|-------|-----|
| Connection fails "MCP SDK not installed" | `pip show mcp` | `pip install "mcp>=1.2.0"` then restart the app |
| Empty tool list | Settings switch | Enable Agent Connect before connecting |
| Frequent permission prompts | `--mode` | Confirm expected for compiled writes; switch to `--mode source` for development |
| Missing audit | Audit switch | Enable audit in Settings, or pass `--audit <path>` |

- Self-check: `GET /api/chat/agent-connect/selfcheck` (SDK / switch / tools / audit)
- Audit query: `audit_query`; platform aggregation `POST /api/v1/agent-connect/audit`
- Remote mode (pilot): platform gateway `POST /api/v1/agent-connect/remote/invoke` (TLS + strong auth + per-domain authorization; remote writes blocked by default)
- Feedback self-optimization: `agent_feedback`; platform aggregation `POST /api/v1/agent-connect/feedback`
