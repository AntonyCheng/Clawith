"""Tenant- and Agent-scoped Feishu group target resolution."""

from __future__ import annotations

import uuid
from dataclasses import dataclass

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.agent import Agent
from app.models.chat_session import ChatSession


class FeishuGroupTargetError(ValueError):
    def __init__(self, code: str, message: str) -> None:
        super().__init__(message)
        self.code = code
        self.message = message


@dataclass(frozen=True)
class FeishuGroupTarget:
    session_id: uuid.UUID
    tenant_id: uuid.UUID
    agent_id: uuid.UUID
    display_name: str
    chat_id: str

    def delivery_target(self) -> dict[str, object]:
        return {
            "kind": "session",
            "session_id": str(self.session_id),
            "channel_delivery": {
                "version": 1,
                "channel": "feishu",
                "target": {
                    "receive_id": self.chat_id,
                    "receive_id_type": "chat_id",
                },
            },
        }


def _chat_id(session: ChatSession) -> str:
    external_conv_id = (session.external_conv_id or "").strip()
    prefix = "feishu_group_"
    if not external_conv_id.startswith(prefix) or not external_conv_id[len(prefix):]:
        raise FeishuGroupTargetError(
            "feishu_group_target_invalid",
            "Feishu group target has no valid provider conversation identity.",
        )
    return external_conv_id[len(prefix):]


def format_feishu_group_target(session: ChatSession) -> dict[str, object]:
    _chat_id(session)
    return {
        "member_type": "group",
        "target_recipient_id": str(session.id),
        "display_name": (session.group_name or session.title or "Feishu Group").strip(),
        "provider": {"provider_type": "feishu"},
        "can_contact": True,
        "contact_tools": ["send_channel_message"],
        "unavailable_reason": None,
    }


async def resolve_feishu_group_target(
    db: AsyncSession,
    *,
    agent_id: uuid.UUID,
    target_recipient_id: uuid.UUID | str,
) -> FeishuGroupTarget:
    try:
        session_id = (
            target_recipient_id
            if isinstance(target_recipient_id, uuid.UUID)
            else uuid.UUID(str(target_recipient_id))
        )
    except (TypeError, ValueError) as exc:
        raise FeishuGroupTargetError(
            "invalid_target_recipient_id",
            "target_recipient_id must be a valid Directory target UUID.",
        ) from exc

    agent = (
        await db.execute(
            select(Agent).where(Agent.id == agent_id, Agent.deleted_at.is_(None))
        )
    ).scalar_one_or_none()
    if agent is None or agent.tenant_id is None:
        raise FeishuGroupTargetError("source_agent_not_found", "Source Agent was not found.")

    session = (
        await db.execute(
            select(ChatSession).where(
                ChatSession.id == session_id,
                ChatSession.tenant_id == agent.tenant_id,
                ChatSession.agent_id == agent.id,
                ChatSession.session_type == "group",
                ChatSession.is_group.is_(True),
                ChatSession.source_channel == "feishu",
                ChatSession.deleted_at.is_(None),
            )
        )
    ).scalar_one_or_none()
    if session is None:
        raise FeishuGroupTargetError(
            "feishu_group_target_not_found",
            "Feishu group target is unavailable or outside this Agent's Directory.",
        )
    return FeishuGroupTarget(
        session_id=session.id,
        tenant_id=session.tenant_id,
        agent_id=agent.id,
        display_name=(session.group_name or session.title or "Feishu Group").strip(),
        chat_id=_chat_id(session),
    )


__all__ = [
    "FeishuGroupTarget",
    "FeishuGroupTargetError",
    "format_feishu_group_target",
    "resolve_feishu_group_target",
]
