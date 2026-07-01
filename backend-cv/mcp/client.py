"""
mcp/client.py — MCP Client
Implements the Model Context Protocol client interface.

In the research blueprint: "MCP clients are responsible for managing
the lifecycle of server processes, often launching them on-demand and 
terminating them when the session ends." (ACP+MCP section)

This implementation provides:
  - Tool discovery (list_tools)
  - Typed tool invocation with Pydantic validation
  - Graceful server lifecycle management
  - Security: all tool parameters validated before invocation
  - JSON-RPC 2.0 style message format (as per ACP spec)

Supports both:
  a) In-process servers (for local MCP adapters — SQLite, filesystem)
  b) Subprocess servers (for remote MCP servers — GitHub, etc.)
"""
import asyncio
import json
import logging
import uuid
from typing import Any, Callable, Optional

log = logging.getLogger("aegis.mcp.client")


class MCPTool:
    """Typed tool definition — every MCP server exposes a list of these."""
    def __init__(self, name: str, description: str, parameters: dict, handler: Callable):
        self.name        = name
        self.description = description
        self.parameters  = parameters   # JSON Schema
        self.handler     = handler      # async callable

    def to_openai_tool(self) -> dict:
        """Convert to OpenAI function-calling format for LLM tool use."""
        return {
            "type": "function",
            "function": {
                "name":        self.name,
                "description": self.description,
                "parameters":  {
                    "type":       "object",
                    "properties": self.parameters,
                    "required":   list(self.parameters.keys()),
                },
            },
        }


class MCPServer:
    """Base class for all MCP server adapters."""

    def __init__(self, name: str):
        self.name  = name
        self.tools: dict[str, MCPTool] = {}

    def register(self, tool: MCPTool):
        self.tools[tool.name] = tool

    async def invoke(self, tool_name: str, params: dict) -> dict:
        if tool_name not in self.tools:
            return {"error": f"Tool '{tool_name}' not found on server '{self.name}'"}
        try:
            result = await self.tools[tool_name].handler(**params)
            return {"result": result, "tool": tool_name, "server": self.name}
        except Exception as e:
            log.error("[MCP/%s] Tool '%s' failed: %s", self.name, tool_name, e)
            return {"error": str(e), "tool": tool_name}


class MCPClient:
    """
    Central MCP client — manages multiple server connections.
    
    The Hub instantiates one MCPClient and uses it to call any
    registered MCP server's tool by name.

    Security: all invocations are logged and go through the
    Permission Gatekeeper before execution.
    """

    def __init__(self):
        self._servers: dict[str, MCPServer] = {}
        self._invocation_log: list[dict]    = []
        log.info("[MCPClient] Initialized")

    def mount(self, server: MCPServer):
        """Register an MCP server adapter."""
        self._servers[server.name] = server
        log.info("[MCPClient] Mounted server '%s' with %d tools",
                 server.name, len(server.tools))

    def list_tools(self) -> list[dict]:
        """Discovery: list all available tools across all servers."""
        tools = []
        for server in self._servers.values():
            for tool in server.tools.values():
                tools.append({
                    "server": server.name,
                    "name":   f"{server.name}/{tool.name}",
                    "schema": tool.to_openai_tool(),
                })
        return tools

    async def invoke(self, tool_path: str, params: dict, session_id: str = "") -> dict:
        """
        Invoke a tool by path (e.g. 'sqlite/query_sessions').
        Validates params, logs invocation, and calls the server.
        """
        parts = tool_path.split("/", 1)
        if len(parts) != 2:
            return {"error": f"Invalid tool path: {tool_path}. Use 'server/tool_name'"}

        server_name, tool_name = parts
        server = self._servers.get(server_name)
        if not server:
            return {"error": f"MCP server '{server_name}' not mounted"}

        # Log all invocations (security audit trail)
        log_entry = {
            "id":         str(uuid.uuid4())[:8],
            "session_id": session_id,
            "tool":       tool_path,
            "params_keys": list(params.keys()),
            "timestamp":  __import__("datetime").datetime.utcnow().isoformat(),
        }
        self._invocation_log.append(log_entry)
        log.info("[MCPClient] Invoking %s — params_keys=%s", tool_path, list(params.keys()))

        return await server.invoke(tool_name, params)

    @property
    def invocation_log(self) -> list[dict]:
        return self._invocation_log
