"""5.1.6-516-a：Agent Connect MCP Server stdio 启动入口。

供外部 AI Agent（Claude Desktop / Codex CLI / Trae Work / VS Code 等）通过标准
MCP stdio 协议连接：

    python -m ai_hub.mcp_server.run --mode compiled --workspace <workspace>

参数：
  --mode      compiled（默认，产品使用态：只读+受控写入）| source（开发态：+CLI/源码）
  --workspace 工作区目录（编译态资产根，Agent 查询/创建/更新/渲染项目/模板/设备库）
  --audit     审计文件路径（默认 <workspace>/agent-connect-audit.jsonl）

用法示例（Claude Desktop claude_desktop_config.json）：
  {"mcpServers": {"magiccommander": {"command": "python",
     "args": ["-m", "ai_hub.mcp_server.run", "--mode", "compiled", "--workspace", "<workspace>"]}}}

MCP SDK 未安装时给出可读错误并退出（exit code 2）。
"""
import argparse
import sys
from pathlib import Path


def _bootstrap() -> None:
    """确保 ai_hub 可导入：stdio 拉起时 cwd 可能为 Agent 工作目录。"""
    here = Path(__file__).resolve().parents[2]
    here_str = str(here)
    if here_str not in sys.path:
        sys.path.insert(0, here_str)


def main() -> int:
    _bootstrap()
    parser = argparse.ArgumentParser(description="Agent Connect MCP Server (stdio)")
    parser.add_argument("--mode", choices=["compiled", "source"], default="compiled")
    parser.add_argument("--workspace", default="", help="工作区目录（编译态资产根）")
    parser.add_argument("--audit", default="", help="审计文件路径（默认 <workspace>/agent-connect-audit.jsonl）")
    args = parser.parse_args()

    from ai_hub.agent.tools import init_tools, set_workspace_dir
    from ai_hub.mcp_server.manager import get_agent_connect_manager

    workspace = args.workspace
    if workspace:
        set_workspace_dir(workspace)
    init_tools()

    mgr = get_agent_connect_manager()
    audit_path = args.audit or (str(Path(workspace) / "agent-connect-audit.jsonl") if workspace else "")
    if audit_path:
        mgr.set_audit_path(Path(audit_path))

    ok, msg = mgr.enable(agent_mode=args.mode)
    if not ok:
        print(f"[agent-connect] {msg}", file=sys.stderr)
        return 2
    mcp = mgr.mcp
    if mcp is None:  # pragma: no cover
        print("[agent-connect] 启动失败：未创建 MCP Server", file=sys.stderr)
        return 2
    print(f"[agent-connect] MagicCommander Agent Connect 已就绪 mode={mgr.agent_mode} tools={mgr.status_report()['tool_count']}", file=sys.stderr)
    mcp.run()  # 阻塞运行 stdio server
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
