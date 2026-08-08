"""Read MCP gateway configuration from environment variables / .env file."""

import os

from dotenv import load_dotenv

load_dotenv()


def _require(name: str) -> str:
    value = os.environ.get(name, "").strip()
    if not value:
        raise RuntimeError(
            f"Missing required environment variable: {name}. "
            f"Copy .env.example to .env and fill in the values."
        )
    return value


BACKEND_HTTP_URL: str = os.environ.get("BACKEND_HTTP_URL", "http://localhost:8000").rstrip("/")
BACKEND_WS_URL: str = os.environ.get("BACKEND_WS_URL", "ws://localhost:8000").rstrip("/")

MCP_HOST: str = os.environ.get("MCP_HOST", "0.0.0.0")
MCP_PORT: int = int(os.environ.get("MCP_PORT", "4008"))

MCP_API_KEY: str = os.environ.get("MCP_API_KEY", "").strip()

# Optional: only needed when the login identity is associated with more than
# one tenant. See backend_client.py for how this is used to auto-resolve the
# tenant selection step that /api/auth/login otherwise requires.
BACKEND_TENANT_NAME: str = os.environ.get("BACKEND_TENANT_NAME", "").strip()


def get_backend_credentials() -> tuple[str, str]:
    """Lazily validated so importing this module never fails without a .env file."""
    return _require("BACKEND_EMAIL"), _require("BACKEND_PASSWORD")


def get_mcp_api_key() -> str:
    if not MCP_API_KEY:
        raise RuntimeError(
            "Missing required environment variable: MCP_API_KEY. "
            "Copy .env.example to .env and fill in the values."
        )
    return MCP_API_KEY
