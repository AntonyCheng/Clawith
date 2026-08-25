"""MCP server that exposes a small set of tools for interacting with Clawith agents.

Usage:
    python server.py

The server listens on the configured host:port (default 0.0.0.0:4008) and exposes
a streamable-http MCP endpoint at /mcp.

All requests must include:
    Authorization: Bearer <MCP_API_KEY from .env>
"""

import json
import mimetypes
from pathlib import Path

from mcp.server.fastmcp import FastMCP
from starlette.middleware.base import BaseHTTPMiddleware
from starlette.requests import Request
from starlette.responses import JSONResponse
from starlette.routing import Route

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
async def chat_with_agent(
    agent_id: str, message: str, session_id: str | None = None, file_name: str | None = None
) -> str:
    """Send a message to an agent and receive its reply.

    Args:
        agent_id: UUID of the agent to chat with
        message: the message text to send
        session_id: optional UUID of an existing session. If not provided, the
                    backend will use or create the user's primary session with
                    this agent.
        file_name: optional name of a file previously uploaded via upload_file.
                    Marks the message with the attachment so the agent knows to
                    read it (e.g. workspace/uploads/<file_name>).

    Returns a JSON object with:
    - reply: the agent's full text response
    - session_id: the session UUID (so you can continue the conversation)
    """
    result = await backend_client.chat_with_agent(agent_id, message, session_id, file_name)
    return json.dumps(result, ensure_ascii=False, indent=2)


@mcp.tool()
async def upload_file(agent_id: str, file_path: str) -> str:
    """Upload a local file into the agent's workspace/uploads/ directory.

    The backend saves the file and extracts text from known formats (pdf, docx,
    xlsx, pptx, txt, md, csv, ...). The agent can then read it with its
    read_file tool. Use chat_with_agent with file_name afterwards to reference it.

    Args:
        agent_id: UUID of the agent whose workspace receives the file
        file_path: local path of the file to upload (on the machine running this
                   MCP server)

    Returns a JSON object with:
    - filename: original filename
    - saved_filename: filename as stored (may have a _1/_2... suffix on conflict)
    - workspace_path: path inside the agent workspace (workspace/uploads/...)
    - extracted_text: extracted text preview (truncated by the backend)
    """
    path = Path(file_path).expanduser()
    if not path.is_file():
        raise FileNotFoundError(f"File not found on MCP server host: {path}")
    content_type = mimetypes.guess_type(path.name)[0] or "application/octet-stream"
    result = await backend_client.upload_file(agent_id, path.name, path.read_bytes(), content_type)
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


# ─── Plain REST endpoints (for non-MCP clients: Apifox / curl / scripts) ─────
# Same Bearer MCP_API_KEY auth as /mcp (the middleware below covers these too),
# same backend token pool — callers never log in to the backend themselves.


async def rest_agents(request: Request):
    try:
        return JSONResponse(await backend_client.list_agents())
    except backend_client.BackendError as exc:
        return JSONResponse({"error": str(exc)}, status_code=502)


async def rest_sessions(request: Request):
    try:
        sessions = await backend_client.list_sessions(request.path_params["agent_id"])
        return JSONResponse(sessions)
    except backend_client.BackendError as exc:
        return JSONResponse({"error": str(exc)}, status_code=502)


async def rest_history(request: Request):
    try:
        limit = int(request.query_params.get("limit", "20"))
    except ValueError:
        return JSONResponse({"error": "limit must be an integer"}, status_code=400)
    try:
        messages = await backend_client.get_session_history(
            request.path_params["agent_id"], request.path_params["session_id"], limit
        )
        return JSONResponse(messages)
    except backend_client.BackendError as exc:
        return JSONResponse({"error": str(exc)}, status_code=502)


async def rest_chat(request: Request):
    try:
        body = await request.json()
    except Exception:
        return JSONResponse({"error": "Request body must be JSON"}, status_code=400)
    agent_id = body.get("agent_id")
    message = body.get("message")
    if not agent_id or not message:
        return JSONResponse({"error": "agent_id and message are required"}, status_code=400)
    try:
        result = await backend_client.chat_with_agent(
            agent_id, message, body.get("session_id"), body.get("file_name")
        )
        return JSONResponse(result)
    except backend_client.BackendError as exc:
        return JSONResponse({"error": str(exc)}, status_code=502)


async def rest_upload(request: Request):
    try:
        form = await request.form()
    except Exception:
        return JSONResponse({"error": "Request must be multipart/form-data"}, status_code=400)
    agent_id = form.get("agent_id", "")
    upload = form.get("file")
    if not agent_id or upload is None:
        return JSONResponse({"error": "multipart fields 'file' and 'agent_id' are required"}, status_code=400)
    content = await upload.read()
    try:
        result = await backend_client.upload_file(
            agent_id,
            upload.filename or "unnamed",
            content,
            upload.content_type or "application/octet-stream",
        )
        return JSONResponse(result)
    except backend_client.BackendError as exc:
        return JSONResponse({"error": str(exc)}, status_code=502)


def main() -> None:
    app = mcp.streamable_http_app()
    app.add_middleware(ApiKeyAuthMiddleware)
    app.routes.extend([
        Route("/rest/agents", rest_agents, methods=["GET"]),
        Route("/rest/sessions/{agent_id}", rest_sessions, methods=["GET"]),
        Route("/rest/history/{agent_id}/{session_id}", rest_history, methods=["GET"]),
        Route("/rest/chat", rest_chat, methods=["POST"]),
        Route("/rest/upload", rest_upload, methods=["POST"]),
    ])

    import uvicorn

    print(f"Starting Uniclaw MCP server on {config.MCP_HOST}:{config.MCP_PORT}")
    print(f"MCP endpoint: http://{config.MCP_HOST}:{config.MCP_PORT}/mcp")
    print(f"REST endpoints: http://{config.MCP_HOST}:{config.MCP_PORT}/rest/* (agents|sessions|history|chat|upload)")
    print("Clients must send: Authorization: Bearer <MCP_API_KEY>")
    uvicorn.run(app, host=config.MCP_HOST, port=config.MCP_PORT, log_level="info")


if __name__ == "__main__":
    main()
