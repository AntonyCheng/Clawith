"""Dashboard read-only API.

独立模块，与现有 chat_sessions / activity / agents 路由完全不共享代码逻辑。
所有指标用 SQL 聚合直出，不在 Python 里 fold 大列表。
"""

from __future__ import annotations

import uuid
from datetime import datetime, timedelta
from typing import Any
from zoneinfo import ZoneInfo

from fastapi import APIRouter, Depends, Query
from sqlalchemy import case, func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.permissions import build_visible_agents_query
from app.core.security import get_current_user
from app.database import get_db
from app.models.activity_log import DailyTokenUsage
from app.models.agent import Agent
from app.models.audit import ChatMessage
from app.models.llm import LLMModel
from app.models.tenant import Tenant
from app.models.user import User

router = APIRouter(prefix="/dashboard", tags=["dashboard"])

# ─── 业务常量 ─────────────────────────────────────────────────────────────
# 改这些值不需要改其它代码。

SECONDS_PER_ACTIVITY = 30                # 单次活动估时
STANDARD_WORK_HOURS_PER_DAY = 8         # 标准工作日时长
WORKING_DAYS_PER_MONTH = 22             # 月工作日数
DAILY_RATE_CNY = 1000                   # 人日单价（元）
PRICE_CNY_PER_MILLION = 5               # LLM 粗单价（元/百万 token）
PRICE_NOTE = "统一按 5 元/百万 token 计算，未按模型细分"

TOP_N = 5                               # 排行榜返回个数


# ─── 内部辅助 ─────────────────────────────────────────────────────────────

async def _tenant_time_bounds(
    db: AsyncSession,
    tenant_id: uuid.UUID,
) -> tuple[datetime, datetime, str]:
    """返回 (today_start, month_start, tz_name) — 今日/本月边界按租户时区。"""
    t_res = await db.execute(select(Tenant).where(Tenant.id == tenant_id))
    tenant = t_res.scalar_one_or_none()
    tz_name = (tenant.timezone if tenant and tenant.timezone else "UTC") or "UTC"
    try:
        tz = ZoneInfo(tz_name)
    except Exception:
        tz = ZoneInfo("UTC")
        tz_name = "UTC"
    now_local = datetime.now(tz)
    today_start = now_local.replace(hour=0, minute=0, second=0, microsecond=0)
    month_start = today_start.replace(day=1)
    return today_start, month_start, tz_name


def _hours(activity_count: int) -> float:
    return (activity_count * SECONDS_PER_ACTIVITY) / 3600


def _cost_cny(tokens: int) -> float:
    return (tokens / 1_000_000) * PRICE_CNY_PER_MILLION


def _hours_to_savings_cny(hours: float) -> float:
    return (hours / STANDARD_WORK_HOURS_PER_DAY) * DAILY_RATE_CNY


def _activity_role_filter(role_value: str) -> Any:
    """role IN ('assistant','tool_call') 的 SQLAlchemy 表达式，跨方言兼容。"""
    return (ChatMessage.role == role_value) | (ChatMessage.role == "tool_call")


async def _fetch_agents(db: AsyncSession, user: User) -> list[Agent]:
    """取「对当前用户可见」的 agent（全公司可见 = access_mode 'company'，外加本人创建/被显式授权的）。

    复用 build_visible_agents_query，与员工列表 / 广场等界面口径一致：
    - 普通成员：本人创建 + access_mode == 'company' + 被显式授权的 agent
    - 管理员：本租户全部非 private（外加本人创建的 private）
    租户为 None（如平台首用户）时 build_visible_agents_query 会返回空集。
    """
    if not user.tenant_id:
        return []
    stmt = build_visible_agents_query(user).order_by(Agent.created_at)
    res = await db.execute(stmt)
    return list(res.scalars().all())


async def _fetch_activity_counts(
    db: AsyncSession,
    agent_ids: list[uuid.UUID],
    today_start: datetime,
    month_start: datetime,
) -> dict[uuid.UUID, dict[str, int]]:
    """一条 SQL 拿全租户每 agent 的 total/today/month 活动数。

    返回 {agent_id: {"total":N, "today":N, "month":N}}，无消息的 agent 不在结果里（调用方补 0）。
    """
    if not agent_ids:
        return {}
    activity_filter = _activity_role_filter("assistant")
    res = await db.execute(
        select(
            ChatMessage.agent_id.label("aid"),
            func.coalesce(
                func.sum(case((activity_filter, 1), else_=0)),
                0,
            ).label("total"),
            func.coalesce(
                func.sum(
                    case(
                        (
                            activity_filter & (ChatMessage.created_at >= today_start),
                            1,
                        ),
                        else_=0,
                    )
                ),
                0,
            ).label("today"),
            func.coalesce(
                func.sum(
                    case(
                        (
                            activity_filter & (ChatMessage.created_at >= month_start),
                            1,
                        ),
                        else_=0,
                    )
                ),
                0,
            ).label("month"),
        )
        .where(ChatMessage.agent_id.in_(agent_ids))
        .group_by(ChatMessage.agent_id)
    )
    out: dict[uuid.UUID, dict[str, int]] = {}
    for row in res.all():
        out[row.aid] = {
            "total": int(row.total or 0),
            "today": int(row.today or 0),
            "month": int(row.month or 0),
        }
    return out


async def _fetch_total_tokens_by_model(
    db: AsyncSession, agents: list[Agent]
) -> dict[str, dict[str, int]]:
    """按 primary_model_id 分组，聚合该模型下 agent 的总 token 与今日 token。

    返回 {model_id_str: {"totalTokens":N, "todayTokens":N, "agents":N}}.
    primary_model_id 为 NULL 的 agent 归到 "unknown"。
    """
    out: dict[str, dict[str, int]] = {}
    for a in agents:
        key = str(a.primary_model_id) if a.primary_model_id else "unknown"
        slot = out.setdefault(key, {"totalTokens": 0, "todayTokens": 0, "agents": 0})
        slot["totalTokens"] += int(a.tokens_used_total or 0)
        slot["todayTokens"] += int(a.tokens_used_today or 0)
        slot["agents"] += 1
    return out


# ─── 接口 1：员工概览 ──────────────────────────────────────────────────────

@router.get("/overview")
async def get_overview(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """员工概览 Tab 一次性拿全数据：totals + 每个 agent 详情 + 三榜。

    口径：
    - 活动数 = role IN ('assistant','tool_call') 的 chat_messages 计数
    - 今日/本月 边界按租户时区
    - A2A 不去重（双方各自计）
    """
    today_start, month_start, _tz = await _tenant_time_bounds(db, current_user.tenant_id)
    agents = await _fetch_agents(db, current_user)
    counts = await _fetch_activity_counts(
        db, [a.id for a in agents], today_start, month_start
    )

    # 每 agent 明细
    per_agent = []
    today_total = 0
    month_total = 0
    all_total = 0
    tokens_total_all = 0
    for a in agents:
        c = counts.get(a.id, {"total": 0, "today": 0, "month": 0})
        per_agent.append(
            {
                "id": str(a.id),
                "name": a.name,
                "status": a.status,
                "avatar_url": a.avatar_url,
                "primary_model_id": str(a.primary_model_id) if a.primary_model_id else None,
                "today": c["today"],
                "month": c["month"],
                "total": c["total"],
                "tokens_used_total": int(a.tokens_used_total or 0),
                "tokens_used_today": int(a.tokens_used_today or 0),
                "tokens_used_month": int(a.tokens_used_month or 0),
                "totalHours": round(_hours(c["total"]), 2),
                "todayHours": round(_hours(c["today"]), 2),
                "monthHours": round(_hours(c["month"]), 2),
                "last_active_at": a.last_active_at.isoformat() if a.last_active_at else None,
            }
        )
        today_total += c["today"]
        month_total += c["month"]
        all_total += c["total"]
        tokens_total_all += int(a.tokens_used_total or 0)

    active_count = sum(1 for a in agents if a.status in ("running", "idle"))
    hours_all = round(_hours(all_total), 2)

    # 排行榜
    sorted_by_activity = sorted(per_agent, key=lambda x: x["total"], reverse=True)
    sorted_by_busy = sorted(
        per_agent,
        key=lambda x: x["total"] * x["tokens_used_total"],
        reverse=True,
    )
    sorted_by_idle = sorted(per_agent, key=lambda x: x["total"] * x["tokens_used_total"])

    return {
        "constants": {
            "seconds_per_activity": SECONDS_PER_ACTIVITY,
            "standard_work_hours_per_day": STANDARD_WORK_HOURS_PER_DAY,
            "working_days_per_month": WORKING_DAYS_PER_MONTH,
            "daily_rate_cny": DAILY_RATE_CNY,
            "price_cny_per_million": PRICE_CNY_PER_MILLION,
        },
        "totals": {
            "totalAgents": len(agents),
            "activeAgents": active_count,
            "totalActivities": all_total,
            "totalActivitiesToday": today_total,
            "totalActivitiesMonth": month_total,
            "totalTokens": tokens_total_all,
            "totalHoursAll": hours_all,
            "estimated_savings_cny": round(_hours_to_savings_cny(hours_all), 2),
        },
        "agents": per_agent,
        "leaderboards": {
            "mostPopular": sorted_by_activity[:TOP_N],
            "busiest": sorted_by_busy[:TOP_N],
            "idlest": sorted_by_idle[:TOP_N],
        },
    }


# ─── 接口 2：成本概览 ──────────────────────────────────────────────────────

@router.get("/cost")
async def get_cost(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """成本概览 Tab。

    日均/月均改用 daily_token_usage 的真实时序，不再粗估。
    days_used_this_month 取当月已过天数，避免月初/月末失真。
    """
    today_start, month_start, _tz = await _tenant_time_bounds(db, current_user.tenant_id)
    agents = await _fetch_agents(db, current_user)
    visible_agent_ids = [a.id for a in agents]
    model_totals = await _fetch_total_tokens_by_model(db, agents)

    # 一次拉到模型 label 映射
    model_ids = [uuid.UUID(k) for k in model_totals.keys() if k != "unknown"]
    label_map: dict[str, str] = {}
    if model_ids:
        m_res = await db.execute(
            select(LLMModel.id, LLMModel.label).where(LLMModel.id.in_(model_ids))
        )
        for row in m_res.all():
            label_map[str(row[0])] = row[1] or str(row[0])

    models_out = []
    for mid_str, slot in model_totals.items():
        models_out.append(
            {
                "model_id": mid_str,
                "model_label": label_map.get(mid_str, "其他或默认模型"),
                "agents": slot["agents"],
                "totalTokens": slot["totalTokens"],
                "todayTokens": slot["todayTokens"],
                "totalCostCNY": round(_cost_cny(slot["totalTokens"]), 2),
                "todayCostCNY": round(_cost_cny(slot["todayTokens"]), 2),
            }
        )

    total_tokens = sum(m["totalTokens"] for m in models_out)
    today_tokens = sum(m["todayTokens"] for m in models_out)

    # 日均 / 当月用 daily_token_usage 真实时序（仅统计可见 agent，与上方口径一致）
    if visible_agent_ids:
        month_tokens_q = await db.execute(
            select(func.coalesce(func.sum(DailyTokenUsage.tokens_used), 0))
            .where(
                DailyTokenUsage.tenant_id == current_user.tenant_id,
                DailyTokenUsage.agent_id.in_(visible_agent_ids),
                DailyTokenUsage.date >= month_start.replace(tzinfo=None),
            )
        )
        month_tokens_used = int(month_tokens_q.scalar() or 0)
    else:
        month_tokens_used = 0

    days_passed = max(1, today_start.day)
    avg_daily_tokens = round(month_tokens_used / days_passed, 2)
    avg_monthly_tokens = month_tokens_used  # 当月至今累计，不再算均值

    return {
        "price_note": PRICE_NOTE,
        "models": models_out,
        "totals": {
            "modelCount": len([m for m in models_out if m["model_id"] != "unknown"]),
            "totalTokens": total_tokens,
            "totalCostCNY": round(_cost_cny(total_tokens), 2),
            "todayTokens": today_tokens,
            "todayCostCNY": round(_cost_cny(today_tokens), 2),
            "avgDailyTokens": avg_daily_tokens,
            "avgDailyCostCNY": round(_cost_cny(int(avg_daily_tokens)), 2),
            "avgMonthlyTokens": avg_monthly_tokens,
            "avgMonthlyCostCNY": round(_cost_cny(int(avg_monthly_tokens)), 2),
        },
    }


# ─── 接口 3：价值贡献 ──────────────────────────────────────────────────────

@router.get("/value")
async def get_value(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """价值贡献 Tab。每 agent 后端算好 savedHours / savedCNY / tokenCostCNY / profitCNY。"""
    today_start, month_start, _tz = await _tenant_time_bounds(db, current_user.tenant_id)
    agents = await _fetch_agents(db, current_user)
    counts = await _fetch_activity_counts(
        db, [a.id for a in agents], today_start, month_start
    )

    per_agent = []
    total_hours = 0.0
    total_savings = 0.0
    total_token_cost = 0.0
    for a in agents:
        c = counts.get(a.id, {"total": 0, "today": 0, "month": 0})
        hours = _hours(c["total"])
        savings = _hours_to_savings_cny(hours)
        tokens = int(a.tokens_used_total or 0)
        token_cost = _cost_cny(tokens)
        profit = savings - token_cost
        per_agent.append(
            {
                "id": str(a.id),
                "name": a.name,
                "avatar_url": a.avatar_url,
                "totalActivities": c["total"],
                "savedHours": round(hours, 2),
                "savedCNY": round(savings, 2),
                "tokensTotal": tokens,
                "tokenCostCNY": round(token_cost, 2),
                "profitCNY": round(profit, 2),
            }
        )
        total_hours += hours
        total_savings += savings
        total_token_cost += token_cost

    profit_total = total_savings - total_token_cost
    per_agent.sort(key=lambda x: x["profitCNY"], reverse=True)

    return {
        "perAgent": per_agent,
        "totals": {
            "totalHoursSaved": round(total_hours, 2),
            "totalSavingsCNY": round(total_savings, 2),
            "totalTokenCostCNY": round(total_token_cost, 2),
            "totalProfitCNY": round(profit_total, 2),
        },
    }


# ─── 接口 4：Token 时序趋势 ────────────────────────────────────────────────

@router.get("/token-trend")
async def get_token_trend(
    days: int = Query(30, ge=1, le=180),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """返回最近 N 天全租户每日 token 时序（含 cache_read 拆分）。

    数据源 daily_token_usage（已按 agent×天预聚合）。
    仅统计「对当前用户可见」的 agent，与 overview/cost/value 口径一致。
    """
    today_start, _month_start, _tz = await _tenant_time_bounds(db, current_user.tenant_id)
    agents = await _fetch_agents(db, current_user)
    visible_agent_ids = [a.id for a in agents]
    # 无可见 agent 时直接返回空时序，避免无过滤全租户聚合。
    if not visible_agent_ids:
        return {"days": days, "pointCount": 0, "points": []}
    # daily_token_usage.date 存的是 UTC 当日 0 点（naive 比较即可）。
    # 以租户今日 0 点为基准往前推 days-1 天作为时序起点。
    today_naive = datetime.combine(today_start.date(), datetime.min.time()) - timedelta(days=days - 1)

    res = await db.execute(
        select(
            DailyTokenUsage.date.label("d"),
            func.coalesce(func.sum(DailyTokenUsage.tokens_used), 0).label("tokens"),
            func.coalesce(func.sum(DailyTokenUsage.input_tokens), 0).label("input_tokens"),
            func.coalesce(func.sum(DailyTokenUsage.output_tokens), 0).label("output_tokens"),
            func.coalesce(func.sum(DailyTokenUsage.cache_read_tokens), 0).label("cache_read"),
            func.coalesce(func.sum(DailyTokenUsage.cache_creation_tokens), 0).label("cache_creation"),
        )
        .where(
            DailyTokenUsage.tenant_id == current_user.tenant_id,
            DailyTokenUsage.agent_id.in_(visible_agent_ids),
            DailyTokenUsage.date >= today_naive,
        )
        .group_by(DailyTokenUsage.date)
        .order_by(DailyTokenUsage.date)
    )

    points = []
    for row in res.all():
        d = row.d
        tokens = int(row.tokens or 0)
        points.append(
            {
                "date": d.isoformat() if hasattr(d, "isoformat") else str(d),
                "tokens": tokens,
                "inputTokens": int(row.input_tokens or 0),
                "outputTokens": int(row.output_tokens or 0),
                "cacheReadTokens": int(row.cache_read or 0),
                "cacheCreationTokens": int(row.cache_creation or 0),
                "costCNY": round(_cost_cny(tokens), 2),
            }
        )

    return {
        "days": days,
        "pointCount": len(points),
        "points": points,
    }
