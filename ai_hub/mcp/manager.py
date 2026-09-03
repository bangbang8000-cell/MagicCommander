"""5.0.3-503-c：MCP 工具接入（Model Context Protocol 协议层，非 Agent 框架）

- MCP server 配置管理（name/command/args/env，持久化 <workspace>/.mc_mcp_config.json）
- 子进程生命周期（stdio server 启动/健康/退出，AsyncExitStack 管理）
- 工具发现（list_tools）→ 动态 register_tool（命名空间 mcp:<server>:<tool> 防冲突）
- 执行分发：ClientSession.call_tool 包装为 {success, result|error}
- 双引擎共享：注入 tools.py 注册表后自有/外部引擎均经 list_tools/execute_tool 透传
  （不改外部引擎适配器——_MCToolsMixin 已透传 tools 注册表）

mcp SDK 惰性导入：未安装时相关操作返回可读错误，不阻断 AI Hub 启动。
"""
import asyncio
import json
import logging
import os
import uuid
from contextlib import AsyncExitStack
from pathlib import Path
from typing import Optional

logger = logging.getLogger(__name__)

MCP_CONFIG_SCHEMA = "mc.mcp-config/1"
# MCP 工具命名空间前缀：mcp:<server>:<tool>（防不同 server 同名工具冲突）
MCP_TOOL_PREFIX = "mcp:"


def _now() -> str:
    from datetime import datetime
    return datetime.now().isoformat()


def _default_config_path() -> Path:
    """MCP 配置持久化路径：<workspace>/.mc_mcp_config.json（缺省 user home 兜底）。"""
    try:
        from ai_hub.config import settings
        if getattr(settings, "workspace_dir", ""):
            return Path(settings.workspace_dir) / ".mc_mcp_config.json"
    except Exception:
        pass
    return Path.home() / ".magiccommander" / "mc_mcp_config.json"


class MCPServerConfig:
    """单个 MCP server 配置（name/command/args/env）"""

    def __init__(self, name: str, command: str, args=None, env=None):
        self.name = name
        self.command = command
        self.args = list(args or [])
        self.env = dict(env or {})

    def to_dict(self) -> dict:
        return {
            "name": self.name,
            "command": self.command,
            "args": list(self.args),
            "env": dict(self.env),
        }

    @classmethod
    def from_dict(cls, d: dict) -> "MCPServerConfig":
        return cls(
            name=str(d.get("name") or ""),
            command=str(d.get("command") or ""),
            args=d.get("args") or [],
            env=d.get("env") or {},
        )


class MCPServerSession:
    """运行中的 MCP server 会话：子进程（stdio_client 管理）+ ClientSession + 已发现工具。"""

    def __init__(self, server: MCPServerConfig):
        self.server = server
        self.stack: Optional[AsyncExitStack] = None
        self.client = None
        self.tools: list[dict] = []
        self.status = "stopped"  # stopped / starting / running / error
        self.error = ""
        self.started_at = ""

    def to_status(self) -> dict:
        return {
            "name": self.server.name,
            "command": self.server.command,
            "status": self.status,
            "tool_count": len(self.tools),
            "tools": [t.get("name") for t in self.tools],
            "error": self.error,
            "started_at": self.started_at,
        }


def _import_mcp_sdk():
    """惰性导入 mcp SDK（协议层依赖，未安装时抛 ImportError）。"""
    import mcp
    from mcp.client.stdio import stdio_client
    return mcp, stdio_client


class MCPManager:
    """MCP server 配置管理 + 子进程生命周期 + 工具发现注册 + 执行分发。"""

    def __init__(self, config_path: Optional[str] = None):
        self._config_path = Path(config_path) if config_path else _default_config_path()
        self._servers: dict[str, MCPServerConfig] = {}
        self._sessions: dict[str, MCPServerSession] = {}
        self._load_config()

    # ==================== 配置持久化 ====================

    def _load_config(self) -> None:
        self._servers.clear()
        if not self._config_path.exists():
            return
        try:
            data = json.loads(self._config_path.read_text(encoding="utf-8"))
            for item in data.get("servers") or []:
                try:
                    cfg = MCPServerConfig.from_dict(item)
                    if cfg.name:
                        self._servers[cfg.name] = cfg
                except Exception as e:
                    logger.warning(f"Skip invalid MCP server config {item}: {e}")
        except (OSError, ValueError) as e:
            logger.warning(f"Failed to load MCP config {self._config_path}: {e}")

    def _save_config(self) -> bool:
        try:
            self._config_path.parent.mkdir(parents=True, exist_ok=True)
            self._config_path.write_text(json.dumps({
                "schema": MCP_CONFIG_SCHEMA,
                "servers": [s.to_dict() for s in self._servers.values()],
            }, ensure_ascii=False, indent=2), encoding="utf-8")
            return True
        except OSError as e:
            logger.error(f"Failed to save MCP config: {e}")
            return False

    # ==================== 配置管理 API ====================

    def list_servers(self) -> list[dict]:
        """列出全部 server（含运行状态与已发现工具数）。"""
        return [
            {
                **cfg.to_dict(),
                "status": self._sessions[cfg.name].status if cfg.name in self._sessions else "stopped",
                "tool_count": len(self._sessions[cfg.name].tools) if cfg.name in self._sessions else 0,
                "tools": [t.get("name") for t in self._sessions[cfg.name].tools]
                if cfg.name in self._sessions else [],
            }
            for cfg in self._servers.values()
        ]

    def get_server(self, name: str) -> Optional[dict]:
        cfg = self._servers.get(name)
        if not cfg:
            return None
        return {
            **cfg.to_dict(),
            "status": self._sessions[name].status if name in self._sessions else "stopped",
            "tool_count": len(self._sessions[name].tools) if name in self._sessions else 0,
        }

    def add_server(self, name: str, command: str, args=None, env=None) -> dict:
        """新增/更新 server 配置（重名覆盖配置）；server 名不可含 ':'（命名空间分隔符）。"""
        name = (name or "").strip()
        if not name or ":" in name or "/" in name or "\\" in name:
            return {"status": "error", "error": f"无效的 MCP server 名称: {name!r}（不可含 : / \\）"}
        if not command or not str(command).strip():
            return {"status": "error", "error": "MCP server 缺少 command"}
        cfg = MCPServerConfig(name=name, command=str(command).strip(), args=args, env=env)
        self._servers[name] = cfg
        self._save_config()
        return {"status": "ok", **cfg.to_dict()}

    def remove_server(self, name: str) -> dict:
        """移除 server 配置（若在运行先停止并注销其工具）。"""
        if name not in self._servers:
            return {"status": "error", "error": f"MCP server 不存在: {name}"}
        if name in self._sessions:
            # 同步场景下不 await：转异步关闭（保证移除不被阻塞）
            self._sessions[name].stack and None
            self._close_session_sync(name)
        del self._servers[name]
        self._save_config()
        return {"status": "ok"}

    # ==================== 子进程生命周期 ====================

    async def start_server(self, name: str) -> dict:
        """启动 MCP server：stdio_client 拉起子进程 → ClientSession → list_tools → 注册工具。"""
        cfg = self._servers.get(name)
        if not cfg:
            return {"status": "error", "error": f"MCP server 不存在: {name}"}
        sess = self._sessions.get(name)
        if sess and sess.status == "running":
            return {"status": "ok", "message": "已在运行", **sess.to_status()}
        try:
            mcp, stdio_client = _import_mcp_sdk()
        except ImportError:
            return {"status": "error", "error": "MCP SDK 未安装（pip install mcp），无法启动 MCP server"}

        sess = MCPServerSession(cfg)
        self._sessions[name] = sess
        sess.status = "starting"
        try:
            params = mcp.StdioServerParameters(command=cfg.command, args=cfg.args, env=cfg.env or None)
            stack = AsyncExitStack()
            read, write = await stack.enter_async_context(stdio_client(params))
            client = await stack.enter_async_context(mcp.ClientSession(read, write))
            await client.initialize()
            tools_result = await client.list_tools()
            tools = getattr(tools_result, "tools", tools_result) or []
            sess.stack = stack
            sess.client = client
            sess.tools = [_tool_meta(t) for t in tools]
            sess.status = "running"
            sess.started_at = _now()
            self.register_tools(name, sess.tools)
            return {"status": "ok", "server": sess.to_status()}
        except Exception as e:
            logger.error(f"MCP server '{name}' start failed: {e}")
            sess.status = "error"
            sess.error = str(e)
            if sess.stack:
                try:
                    await sess.stack.aclose()
                except Exception:
                    pass
                sess.stack = None
            return {"status": "error", "error": f"MCP server '{name}' 启动失败: {e}"}

    async def stop_server(self, name: str) -> dict:
        """停止 MCP server：关闭 ClientSession/子进程并注销其注册工具。"""
        sess = self._sessions.get(name)
        if not sess:
            return {"status": "error", "error": f"MCP server 未运行: {name}"}
        self.unregister_tools(name)
        if sess.stack:
            try:
                await sess.stack.aclose()
            except Exception as e:
                logger.warning(f"MCP server '{name}' close error: {e}")
            sess.stack = None
        self._sessions.pop(name, None)
        return {"status": "ok", "name": name}

    def server_status(self, name: str) -> dict:
        sess = self._sessions.get(name)
        if not sess:
            return {"status": "stopped", "name": name, "tool_count": 0, "tools": []}
        return sess.to_status()

    async def start_all(self) -> dict:
        """启动全部已配置 server（best-effort；mcp 未安装/单点失败不影响其他）。"""
        results = {}
        for name in list(self._servers.keys()):
            results[name] = await self.start_server(name)
        return {"status": "ok", "servers": results}

    async def stop_all(self) -> None:
        for name in list(self._sessions.keys()):
            await self.stop_server(name)

    # ==================== 工具发现 / 注册 ====================

    def _tool_full_name(self, server: str, tool: str) -> str:
        return f"{MCP_TOOL_PREFIX}{server}:{tool}"

    def register_tools(self, server_name: str, tools: list[dict]) -> None:
        """将发现的 MCP 工具注册进 tools.py 注册表（命名空间 mcp:<server>:<tool>）。"""
        from ai_hub.agent.schemas import ToolPermission
        from ai_hub.agent.tools import register_tool
        for t in tools:
            tool = str(t.get("name") or "")
            if not tool:
                continue
            full = self._tool_full_name(server_name, tool)
            register_tool(
                full,
                str(t.get("description") or f"MCP 工具 {server_name}:{tool}"),
                _convert_input_schema(t.get("inputSchema")),
                self._make_handler(server_name, tool),
                # MCP 工具未知副作用 → CONFIRM（保守，需用户确认/审批）
                permission=ToolPermission.CONFIRM,
            )

    def unregister_tools(self, server_name: str) -> None:
        """注销某 server 全部注册的 MCP 工具（停止/移除 server 时调用）。"""
        from ai_hub.agent.tools import unregister_tool
        for tool in self._session_tool_names(server_name):
            unregister_tool(tool)

    def _session_tool_names(self, server_name: str) -> list:
        sess = self._sessions.get(server_name)
        if not sess:
            return []
        return [self._tool_full_name(server_name, t.get("name") or "") for t in sess.tools]

    def get_tools(self, server_name: str = "") -> list[dict]:
        """返回某 server（或缺省全部）已发现工具清单（每条含 server 归属）。"""
        if server_name:
            sess = self._sessions.get(server_name)
            if not sess:
                return []
            return [{"server": server_name, **t} for t in sess.tools]
        out = []
        for name, sess in self._sessions.items():
            for t in sess.tools:
                out.append({"server": name, **t})
        return out

    def _make_handler(self, server: str, tool: str):
        """构造注册到 tools.py 的 handler：执行分发 + 包装为 {success, result|error}。"""
        async def handler(arguments: dict):
            result = await self.call_tool(server, tool, arguments or {})
            if not result.get("success"):
                raise RuntimeError(result.get("error", f"MCP 工具 {tool} 执行失败"))
            return result.get("result")
        return handler

    # ==================== 执行分发 ====================

    async def call_tool(self, server: str, tool: str, arguments: dict) -> dict:
        """ClientSession.call_tool 包装为 {success, result|error}。"""
        sess = self._sessions.get(server)
        if not sess or sess.status != "running":
            return {"success": False, "error": f"MCP server '{server}' 未运行，无法调用工具 {tool}"}
        try:
            result = await sess.client.call_tool(tool, arguments)
            # result 为 mcp CallToolResult（.content / .isError / .structuredContent）
            return _call_tool_payload(result)
        except Exception as e:
            logger.error(f"MCP call_tool failed {server}:{tool}: {e}")
            return {"success": False, "error": str(e)}

    # ==================== 内部 ====================

    def _close_session_sync(self, name: str) -> None:
        """同步路径下尽力关闭会话（注册表工具先行注销；无法 await 则丢弃引用由 GC 兜底）。"""
        self.unregister_tools(name)
        self._sessions.pop(name, None)


def _tool_meta(t) -> dict:
    """归一 MCP 工具定义 → {name, description, inputSchema}。"""
    return {
        "name": str(getattr(t, "name", "") or ""),
        "description": str(getattr(t, "description", "") or ""),
        "inputSchema": getattr(t, "inputSchema", None) or {"type": "object", "properties": {}},
    }


def _convert_input_schema(schema) -> dict:
    """MCP inputSchema（JSON Schema）→ tools.register_tool parameters（兼容缺省）。"""
    if not isinstance(schema, dict):
        return {"type": "object", "properties": {}, "required": []}
    return {
        "type": schema.get("type") or "object",
        "properties": schema.get("properties") or {},
        "required": schema.get("required") or [],
    }


def _call_tool_payload(result) -> dict:
    """将 MCP CallToolResult 归一为 {success, result|error}。"""
    is_error = bool(getattr(result, "isError", False))
    structured = getattr(result, "structuredContent", None)
    if structured is not None:
        return {"success": not is_error, "result": structured}
    content = getattr(result, "content", None) or []
    text = ""
    for block in content:
        if isinstance(block, dict):
            if block.get("type") == "text":
                text += str(block.get("text", ""))
        elif hasattr(block, "type") and getattr(block, "type") == "text":
            text += str(getattr(block, "text", ""))
    if is_error:
        return {"success": False, "error": text or "MCP 工具执行失败"}
    return {"success": True, "result": text or {"ok": True}}


_manager: Optional[MCPManager] = None


def get_mcp_manager() -> MCPManager:
    """全局 MCP 管理器单例。"""
    global _manager
    if _manager is None:
        _manager = MCPManager()
    return _manager


def reset_mcp_manager(config_path: Optional[str] = None) -> MCPManager:
    """测试/配置变更后重建管理器（隔离全局状态）。"""
    global _manager
    _manager = MCPManager(config_path=config_path)
    return _manager
