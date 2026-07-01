"""
mcp/__init__.py
Model Context Protocol — Capability Access Layer
Implements the MCP client + pluggable server adapters.
"""
from .client import MCPClient

__all__ = ["MCPClient"]
