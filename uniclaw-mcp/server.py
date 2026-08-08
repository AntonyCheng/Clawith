"""MCP server that exposes a small set of tools for interacting with Clawith agents.

Usage:
    python server.py

The server listens on the configured host:port (default 0.0.0.0:4008) and exposes
a streamable-http MCP endpoint at /mcp.

All requests must include:
    Authorization: Bearer <MCP_API_KEY from .env>
"""

import json

from mcp.server.fastmcp import FastMCP
from starlette.middleware.base import BaseHTTPMiddleware
from starlette.requests import Request
from starlette.responses import JSONResponse

import backend_client
import config

mcp = FastMCP(
    name="uniclaw",
    instructions=(
        "This MCP server provides tools to list, query, and chat with agents "
        "in a Clawith backend instance. Use list_agents to see what agents are "
        "available, list_sessions to see chat history, get_session_history to "
        "read past messages, and chat_with_agent to send a message and get a reply."
    ),
    host=config.MCP_HOST,
    port=config.MCP_PORT,
    streamable_http_path="/mcp",
    # Some remote MCP clients/gateways do an initial "test connection" handshake
    # (initialize + tools/list), terminate that session, then reuse the stale
    # session id on the actual tool call later. That causes a 404 "Session not
    # found" in stateful mode. We don't need cross-request session state (our
    # own chat_with_agent tool manages its own WS connection/session_id), so
    # stateless mode sidesteps this entirely: every request is self-contained.
    stateless_http=True,
    json_response=True,
)


@mcp.tool()
async def list_agents() -> str:
    """List all agents accessible by the logged-in user.

    Returns a JSON array of agent objects with fields:
    - id: agent UUID
    - name: display name
    - role_description: brief description of the agent's role
    - agent_type: 'native' or 'openclaw'
    - status: 'active' | 'inactive'
    """
    agents = await backend_client.list_agents()
    return json.dumps(agents, ensure_ascii=False, indent=2)


@mcp.tool()
async def list_sessions(agent_id: str) -> str:
    """List all chat sessions for a specific agent that belong to the logged-in user.

    Args:
        agent_id: UUID of the agent

    Returns a JSON array of session objects with fields:
    - id: session UUID
    - title: session title
    - last_message_at: ISO timestamp of the last message (or null)
    - message_count: total message count
    - unread_count: unread message count
    - source_channel: 'web' | 'feishu' | 'discord' | 'slack' | 'agent' | ...
    """
    sessions = await backend_client.list_sessions(agent_id)
    return json.dumps(sessions, ensure_ascii=False, indent=2)


@mcp.tool()
async def get_session_history(agent_id: str, session_id: str, limit: int = 20) -> str:
    """Retrieve recent messages from a specific chat session.

    Args:
        agent_id: UUID of the agent
        session_id: UUID of the session
        limit: max number of messages to return (default 20, max 500)

    Returns a JSON array of message objects ordered oldest-to-newest with fields:
    - role: 'user' | 'assistant' | 'tool_call' | 'system'
    - content: message text
    - created_at: ISO timestamp
    """
    messages = await backend_client.get_session_history(agent_id, session_id, limit)
    return json.dumps(messages, ensure_ascii=False, indent=2)


@mcp.tool()
async def chat_with_agent(agent_id: str, message: str, session_id: str | None = None) -> str:
    """Send a message to an agent and receive its reply.

    Args:
        agent_id: UUID of the agent to chat with
        message: the message text to send
        session_id: optional UUID of an existing session. If not provided, the
                    backend will use or create the user's primary session with
                    this agent.

    Returns a JSON object with:
    - reply: the agent's full text response
    - session_id: the session UUID (so you can continue the conversation)
    """
    result = await backend_client.chat_with_agent(agent_id, message, session_id)
    return json.dumps(result, ensure_ascii=False, indent=2)


class ApiKeyAuthMiddleware(BaseHTTPMiddleware):
    """Rejects requests that don't include the correct MCP_API_KEY in the
    Authorization header."""

    async def dispatch(self, request: Request, call_next):
        expected_key = config.get_mcp_api_key()
        auth_header = request.headers.get("authorization", "")
        if auth_header != f"Bearer {expected_key}":
            return JSONResponse(
                {"error": "Unauthorized: missing or invalid MCP_API_KEY"},
                status_code=401,
            )
        return await call_next(request)


def main() -> None:
    app = mcp.streamable_http_app()
    app.add_middleware(ApiKeyAuthMiddleware)

    import uvicorn

    print(f"Starting Uniclaw MCP server on {config.MCP_HOST}:{config.MCP_PORT}")
    print(f"MCP endpoint: http://{config.MCP_HOST}:{config.MCP_PORT}/mcp")
    print("Clients must send: Authorization: Bearer <MCP_API_KEY>")
    uvicorn.run(app, host=config.MCP_HOST, port=config.MCP_PORT, log_level="info")


if __name__ == "__main__":
    main()
