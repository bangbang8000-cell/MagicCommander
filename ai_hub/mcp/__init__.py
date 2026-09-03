"""5.0.3-503-c：MCP 工具接入模块（Model Context Protocol 协议层）"""
from ai_hub.mcp.manager import (
    MCPManager,
    MCP_TOOL_PREFIX,
    get_mcp_manager,
    reset_mcp_manager,
)

__all__ = ["MCPManager", "MCP_TOOL_PREFIX", "get_mcp_manager", "reset_mcp_manager"]
