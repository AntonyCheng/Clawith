"""Thin client for the Clawith backend: login/token refresh, REST calls, and a
one-shot WebSocket bridge for chatting with an agent.

Design goals (kept intentionally simple):
- Lazy login: we only authenticate against the backend the first time a tool
  is actually called.
- Token lifetime tracking: the backend issues JWTs valid for 24h
  (JWT_ACCESS_TOKEN_EXPIRE_MINUTES). We track when we logged in and proactively
  re-login a bit before that, plus we always retry once on a 401/auth error.
- No connection pooling for the WebSocket chat: each `chat_with_agent` call
  opens a fresh connection, exchanges one message, and closes it.
"""

import asyncio
import json
import time

import httpx
import websockets

import config

TOKEN_LIFETIME_SECONDS = 24 * 60 * 60
TOKEN_SAFETY_MARGIN_SECONDS = 30 * 60  # re-login 30 min before actual expiry
CHAT_TIMEOUT_SECONDS = 1200  # 20 min — agent tool loops can easily exceed 3 min
WELCOME_MESSAGE_WAIT_SECONDS = 2


class BackendError(RuntimeError):
    """Raised when the backend rejects a request or returns an error payload."""


class TokenManager:
    """Holds the current backend JWT and refreshes it as needed."""

    def __init__(self) -> None:
        self._token: str | None = None
        self._issued_at: float = 0.0
        self._lock = asyncio.Lock()

    def _is_expired(self) -> bool:
        if not self._token:
            return True
        return (time.monotonic() - self._issued_at) > (TOKEN_LIFETIME_SECONDS - TOKEN_SAFETY_MARGIN_SECONDS)

    async def get_token(self, *, force_refresh: bool = False) -> str:
        async with self._lock:
            if force_refresh or self._is_expired():
                await self._login()
            assert self._token is not None
            return self._token

    async def _login(self) -> None:
        email, password = config.get_backend_credentials()
        async with httpx.AsyncClient(base_url=config.BACKEND_HTTP_URL, timeout=30) as client:
            data = await self._login_request(client, email, password, tenant_id=None)

            # Identity is associated with more than one tenant: the backend
            # won't issue a token until we tell it which one to use. There's
            # no human here to click a choice, so resolve it from
            # BACKEND_TENANT_NAME (matched against tenant_name / tenant_slug)
            # and re-login with that tenant_id.
            if data.get("requires_tenant_selection"):
                tenant_id = self._resolve_tenant_id(data.get("tenants") or [])
                data = await self._login_request(client, email, password, tenant_id=tenant_id)

        token = data.get("access_token")
        if not token:
            raise BackendError(f"Login response did not include an access_token: {data}")
        self._token = token
        self._issued_at = time.monotonic()

    @staticmethod
    async def _login_request(
        client: httpx.AsyncClient, email: str, password: str, *, tenant_id: str | None
    ) -> dict:
        payload = {"login_identifier": email, "password": password, "tenant_id": tenant_id}
        resp = await client.post("/api/auth/login", json=payload)
        if resp.status_code != 200:
            raise BackendError(
                f"Login to Clawith backend failed (status {resp.status_code}): {resp.text}"
            )
        return resp.json()

    @staticmethod
    def _resolve_tenant_id(tenants: list[dict]) -> str:
        """Pick a tenant_id from the multi-tenant choice list using
        BACKEND_TENANT_NAME (matched case-insensitively against tenant_name
        or tenant_slug)."""
        available = [t.get("tenant_name") or t.get("tenant_slug") or "?" for t in tenants]
        if not config.BACKEND_TENANT_NAME:
            raise BackendError(
                "This account is associated with multiple tenants, so the backend "
                "requires a tenant to be chosen at login. Set BACKEND_TENANT_NAME "
                f"in .env to one of: {available}"
            )

        wanted = config.BACKEND_TENANT_NAME.strip().lower()
        matches = [
            t
            for t in tenants
            if (t.get("tenant_name") or "").strip().lower() == wanted
            or (t.get("tenant_slug") or "").strip().lower() == wanted
        ]
        if len(matches) == 1:
            return matches[0]["tenant_id"]
        if not matches:
            raise BackendError(
                f"BACKEND_TENANT_NAME={config.BACKEND_TENANT_NAME!r} did not match any "
                f"tenant for this account. Available tenants: {available}"
            )
        raise BackendError(
            f"BACKEND_TENANT_NAME={config.BACKEND_TENANT_NAME!r} matched multiple tenants "
            f"({[m.get('tenant_name') for m in matches]}); it must be unique."
        )


_token_manager = TokenManager()


async def _authed_get(path: str, params: dict | None = None) -> dict | list:
    """GET a backend REST endpoint, retrying once after a fresh login on 401."""
    token = await _token_manager.get_token()
    async with httpx.AsyncClient(base_url=config.BACKEND_HTTP_URL, timeout=30) as client:
        resp = await client.get(path, params=params, headers={"Authorization": f"Bearer {token}"})
        if resp.status_code == 401:
            token = await _token_manager.get_token(force_refresh=True)
            resp = await client.get(path, params=params, headers={"Authorization": f"Bearer {token}"})

    if resp.status_code >= 400:
        raise BackendError(f"Backend request to {path} failed (status {resp.status_code}): {resp.text}")
    return resp.json()


async def list_agents() -> list:
    """GET /api/agents/ - list agents the logged-in user can access."""
    return await _authed_get("/api/agents/")


async def list_sessions(agent_id: str) -> list:
    """GET /api/agents/{agent_id}/sessions?scope=mine - list this user's chat sessions."""
    return await _authed_get(f"/api/agents/{agent_id}/sessions", params={"scope": "mine"})


async def get_session_history(agent_id: str, session_id: str, limit: int = 20) -> list:
    """GET /api/agents/{agent_id}/sessions/{session_id}/messages - recent messages in a session."""
    return await _authed_get(
        f"/api/agents/{agent_id}/sessions/{session_id}/messages",
        params={"limit": limit},
    )


async def upload_file(agent_id: str, filename: str, content: bytes, content_type: str = "application/octet-stream") -> dict:
    """POST /api/chat/upload - upload a file into the agent's workspace/uploads/.

    The backend saves the file, extracts text from known formats, and returns
    metadata including the workspace path the agent can read via read_file.
    """
    async def _do(token: str) -> httpx.Response:
        async with httpx.AsyncClient(base_url=config.BACKEND_HTTP_URL, timeout=120) as client:
            return await client.post(
                "/api/chat/upload",
                headers={"Authorization": f"Bearer {token}"},
                files={"file": (filename, content, content_type)},
                data={"agent_id": agent_id},
            )

    token = await _token_manager.get_token()
    resp = await _do(token)
    if resp.status_code == 401:
        token = await _token_manager.get_token(force_refresh=True)
        resp = await _do(token)

    if resp.status_code >= 400:
        raise BackendError(f"Upload to backend failed (status {resp.status_code}): {resp.text}")
    return resp.json()


async def _chat_once(agent_id: str, message: str, session_id: str | None, token: str, file_name: str | None = None) -> dict:
    """Open one WebSocket connection, send one message, collect the final reply."""
    ws_url = f"{config.BACKEND_WS_URL}/ws/chat/{agent_id}?token={token}&lang=zh"
    if session_id:
        ws_url += f"&session_id={session_id}"

    async with websockets.connect(ws_url, open_timeout=30) as ws:
        connected_session_id = session_id

        # First frame should be {"type": "connected", "session_id": ...}
        first_raw = await asyncio.wait_for(ws.recv(), timeout=30)
        first = json.loads(first_raw)
        if first.get("type") == "error":
            raise BackendError(f"Chat connection rejected: {first.get('content')}")
        if first.get("type") == "connected":
            connected_session_id = first.get("session_id") or connected_session_id

        # A brand-new session with no history may get an unsolicited welcome
        # "done" message before we send anything. Drain it (if present) so we
        # don't mistake it for the reply to our own message.
        try:
            welcome_raw = await asyncio.wait_for(ws.recv(), timeout=WELCOME_MESSAGE_WAIT_SECONDS)
            welcome = json.loads(welcome_raw)
            if welcome.get("type") == "error":
                raise BackendError(f"Chat session error: {welcome.get('content')}")
            # If it wasn't a "done" (welcome), it's unexpected pre-send chatter;
            # ignore it either way since we haven't sent our message yet.
        except asyncio.TimeoutError:
            pass

        payload: dict = {"content": message}
        if file_name:
            payload["file_name"] = file_name
        await ws.send(json.dumps(payload))

        deadline = time.monotonic() + CHAT_TIMEOUT_SECONDS
        while True:
            remaining = deadline - time.monotonic()
            if remaining <= 0:
                raise BackendError("Timed out waiting for the agent's reply.")
            try:
                raw = await asyncio.wait_for(ws.recv(), timeout=remaining)
            except asyncio.TimeoutError as exc:
                raise BackendError(
                    f"Timed out waiting for the agent's reply ({CHAT_TIMEOUT_SECONDS // 60} min)."
                ) from exc
            data = json.loads(raw)
            msg_type = data.get("type")
            if msg_type == "error":
                raise BackendError(f"Chat error: {data.get('content')}")
            if msg_type == "done":
                return {
                    "reply": data.get("content", ""),
                    "session_id": connected_session_id,
                }
            # "chunk" / "thinking" / "tool_call" / "info" / "onboarded": intermediate
            # streaming events we don't need for a single request/response call.


async def chat_with_agent(
    agent_id: str, message: str, session_id: str | None = None, file_name: str | None = None
) -> dict:
    """Send one message to an agent and return its full reply plus the session_id used.

    `file_name` optionally names a file previously uploaded via upload_file, so
    the chat history shows the attachment marker and the agent's read_file hint.
    """
    token = await _token_manager.get_token()
    try:
        return await _chat_once(agent_id, message, session_id, token, file_name)
    except BackendError as exc:
        if "Authentication failed" not in str(exc):
            raise
        token = await _token_manager.get_token(force_refresh=True)
        return await _chat_once(agent_id, message, session_id, token, file_name)
