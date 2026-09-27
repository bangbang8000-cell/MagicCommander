"""5.1.6-516-a：Agent Connect MCP Server stdio 启动入口。

供外部 AI Agent（Claude Desktop / Codex CLI / Trae Work / VS Code 等）通过标准
MCP stdio 协议连接：

    python -m ai_hub.mcp_server.run --mode compiled --workspace <workspace>

参数：
  --mode      compiled（默认，产品使用态：只读+受控写入）| source（开发态：+CLI/源码）
  --workspace 工作区目录（编译态资产根，Agent 查询/创建/更新/渲染项目/模板/设备库）
  --audit     审计文件路径（默认 <workspace>/agent-connect-audit.jsonl）
  --grant     外部 Agent 授权档位（5.4.5-AC-grant）：
                readonly —— 仅只读（AUTO 档）工具，写操作一律拒绝
                semi     —— **默认**：AUTO 自动执行，写操作走门禁（同程序内 semi_auto）
                full     —— 全自动免确认（等价程序内 full_auto），**须配 --audit**，
                            且**不豁免**编译态屏蔽规则（delete_* / run_cli / read_file
                            等在 compiled 下仍不可见）

用法示例（Claude Desktop claude_desktop_config.json）：
  {"mcpServers": {"magiccommander": {"command": "python",
     "args": ["-m", "ai_hub.mcp_server.run", "--mode", "compiled", "--workspace", "<workspace>"]}}}

MCP SDK 未安装时给出可读错误并退出（exit code 2）。
"""
import argparse
import os
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
    from ai_hub.mcp_server.manager import GRANTS

    parser = argparse.ArgumentParser(description="Agent Connect MCP Server (stdio)")
    parser.add_argument("--mode", choices=["compiled", "source"], default="compiled")
    parser.add_argument("--workspace", default="", help="工作区目录（编译态资产根）")
    parser.add_argument("--audit", default="", help="审计文件路径（默认 <workspace>/agent-connect-audit.jsonl）")
    parser.add_argument(
        "--grant", choices=list(GRANTS), default=None,
        help=(
            "外部 Agent 授权档位（环境变量 MC_AGENT_GRANT 可作默认值）："
            "readonly=仅只读 / semi=写操作走门禁（默认） / full=全自动免确认（须配 --audit）"
        ),
    )
    parser.add_argument(
        "--ignore-switch", action="store_true",
        help="忽略应用内 Agent Connect 总开关（仅排障用；默认严格遵守开关）",
    )
    args = parser.parse_args()

    # 5.2.2-522-s3：stdio 入口必须遵守应用内总开关（原实现直接 enable，
    # 开关关闭时 MCP Server 仍可被外部 Agent 拉起 → 开关形同虚设）。
    if not args.ignore_switch:
        try:
            from ai_hub.config import get_enable_agent_connect

            if not get_enable_agent_connect():
                print(
                    "[agent-connect] Agent Connect 总开关未开启，拒绝启动 MCP Server。"
                    "请在 MagicCommander 设置中开启 Agent Connect 后重试"
                    "（排障可加 --ignore-switch）。",
                    file=sys.stderr,
                )
                return 2
        except Exception as e:  # noqa: BLE001 - 配置不可读时保守拒绝
            print(f"[agent-connect] 无法读取 Agent Connect 开关配置：{e}", file=sys.stderr)
            return 2

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

    # 5.4.5-AC-grant：授权档位来源优先级 —— 命令行 > 环境变量 > 默认 semi。
    # 环境变量便于团队共享配置（避免命令行明文），也为 Electron 主进程注入留口。
    grant = args.grant or os.environ.get("MC_AGENT_GRANT") or None
    grant = grant if grant in GRANTS else None

    ok, msg = mgr.enable(agent_mode=args.mode, grant=grant)
    if not ok:
        print(f"[agent-connect] {msg}", file=sys.stderr)
        return 2
    mcp = mgr.mcp
    if mcp is None:  # pragma: no cover
        print("[agent-connect] 启动失败：未创建 MCP Server", file=sys.stderr)
        return 2
    print(
        f"[agent-connect] MagicCommander Agent Connect 已就绪 "
        f"mode={mgr.agent_mode} tools={mgr.status_report()['tool_count']} "
        f"gate={mgr.gate_mode} grant={mgr.grant}",
        file=sys.stderr,
    )
    mcp.run()  # 阻塞运行 stdio server
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
