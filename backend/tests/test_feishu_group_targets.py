import uuid
from types import SimpleNamespace

import pytest

from app.services.feishu_group_targets import (
    FeishuGroupTargetError,
    format_feishu_group_target,
    resolve_feishu_group_target,
)


class _Result:
    def __init__(self, value):
        self.value = value

    def scalar_one_or_none(self):
        return self.value


class _DB:
    def __init__(self, *values):
        self.values = list(values)

    async def execute(self, _statement):
        return _Result(self.values.pop(0))


def _session(**overrides):
    values = {
        "id": uuid.uuid4(),
        "tenant_id": uuid.uuid4(),
        "agent_id": uuid.uuid4(),
        "group_name": "项目群",
        "title": "Feishu Group",
        "external_conv_id": "feishu_group_oc_group_1",
    }
    values.update(overrides)
    return SimpleNamespace(**values)


def test_group_directory_payload_exposes_stable_target_without_provider_id():
    payload = format_feishu_group_target(_session())

    assert payload["member_type"] == "group"
    assert payload["target_recipient_id"]
    assert payload["contact_tools"] == ["send_channel_message"]
    assert "external_conv_id" not in payload
    assert "chat_id" not in payload


@pytest.mark.asyncio
async def test_resolve_group_target_returns_frozen_delivery_route():
    tenant_id = uuid.uuid4()
    agent_id = uuid.uuid4()
    session = _session(tenant_id=tenant_id, agent_id=agent_id)
    agent = SimpleNamespace(id=agent_id, tenant_id=tenant_id)

    target = await resolve_feishu_group_target(
        _DB(agent, session),
        agent_id=agent_id,
        target_recipient_id=session.id,
    )

    assert target.chat_id == "oc_group_1"
    assert target.delivery_target() == {
        "kind": "session",
        "session_id": str(session.id),
        "channel_delivery": {
            "version": 1,
            "channel": "feishu",
            "target": {"receive_id": "oc_group_1", "receive_id_type": "chat_id"},
        },
    }


@pytest.mark.asyncio
async def test_resolve_group_target_rejects_unavailable_or_cross_scope_target():
    agent_id = uuid.uuid4()
    agent = SimpleNamespace(id=agent_id, tenant_id=uuid.uuid4())

    with pytest.raises(FeishuGroupTargetError) as exc:
        await resolve_feishu_group_target(
            _DB(agent, None),
            agent_id=agent_id,
            target_recipient_id=uuid.uuid4(),
        )

    assert exc.value.code == "feishu_group_target_not_found"
