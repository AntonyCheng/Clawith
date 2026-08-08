/**
 * Dashboard 聚合分析服务
 *
 * 数据来源：后端 /dashboard/* 四个只读聚合接口（服务端 SQL 直出）。
 * 本层职责已从「客户端 N+1 聚合」改为「适配后端响应 → 组件依赖的视图模型」。
 * 组件仍消费 AgentAnalytics / EmployeeOverview / CostOverview / ValueOverview，
 * 因此这里把后端的扁平响应映射回这些结构，展示组件无需改动。
 */

import { ACTIVITY_CONSTANTS } from '../config/analytics';
import { dashboardApi } from './api';
import type { Agent } from '../types';
import type {
    AgentAnalytics,
    CostOverview,
    EmployeeOverview,
    TokenTrend,
    ValueOverview,
} from '../types/analytics';

/* ─── 单位换算（适配层补算 valueScore / saturation 用） ─────── */

export function activityCountToHours(count: number): number {
    return (count * ACTIVITY_CONSTANTS.SECONDS_PER_ACTIVITY) / 3600;
}

export function hoursToSavingsCNY(hours: number): number {
    return (hours / ACTIVITY_CONSTANTS.STANDARD_WORK_HOURS_PER_DAY) * ACTIVITY_CONSTANTS.DAILY_RATE_CNY;
}

export function tokensToCNY(tokens: number): number {
    return (tokens / ACTIVITY_CONSTANTS.TOKENS_PER_MILLION) * ACTIVITY_CONSTANTS.PRICE_CNY_PER_MILLION;
}

export function valueScore(activityCount: number, tokens: number): number {
    return (activityCount * tokens) / 10000;
}

/* ─── 适配层：后端响应 → 组件视图模型 ─────────────────────── */

/**
 * 用后端 /overview 的一行 agent 构造完整 Agent 对象。
 * 组件只真正用到 name / tokens_used_total，其余字段补默认值以满足类型。
 */
function toAgent(row: any): Agent {
    return {
        id: String(row.id),
        name: row.name ?? '',
        avatar_url: row.avatar_url ?? undefined,
        role_description: '',
        status: row.status ?? 'idle',
        creator_id: '',
        primary_model_id: row.primary_model_id ?? undefined,
        autonomy_policy: {},
        tokens_used_today: Number(row.tokens_used_today ?? 0),
        tokens_used_month: Number(row.tokens_used_month ?? 0),
        tokens_used_total: Number(row.tokens_used_total ?? 0),
        heartbeat_enabled: false,
        heartbeat_interval_minutes: 0,
        heartbeat_active_hours: '',
        created_at: row.created_at ?? '',
        last_active_at: row.last_active_at ?? undefined,
    } as Agent;
}

/**
 * 后端 /overview 的 agent 行 → AgentAnalytics。
 * totalHours/todayHours/monthHours 后端已算好；valueScore/saturation 本地补算。
 */
function overviewRowToAnalytics(row: any): AgentAnalytics {
    const total = Number(row.total ?? 0);
    const today = Number(row.today ?? 0);
    const thisMonth = Number(row.month ?? 0);
    const totalHours = Number(row.totalHours ?? 0);
    const todayHours = Number(row.todayHours ?? 0);
    const monthHours = Number(row.monthHours ?? 0);
    const tokensTotal = Number(row.tokens_used_total ?? 0);

    const savedHours = totalHours;
    const savedCNY = hoursToSavingsCNY(savedHours);
    const tokenCostCNY = tokensToCNY(tokensTotal);

    return {
        agent_id: String(row.id),
        total,
        today,
        thisMonth,
        conversationCount: 0,
        totalHours,
        todayHours,
        monthHours,
        dailySaturation: todayHours / ACTIVITY_CONSTANTS.STANDARD_WORK_HOURS_PER_DAY,
        monthlySaturation:
            monthHours /
            (ACTIVITY_CONSTANTS.WORKING_DAYS_PER_MONTH * ACTIVITY_CONSTANTS.STANDARD_WORK_HOURS_PER_DAY),
        agent: toAgent(row),
        savedHours,
        savedCNY,
        tokenCostCNY,
        profitCNY: savedCNY - tokenCostCNY,
        valueScore: valueScore(total, tokensTotal),
    };
}

function adaptEmployeeOverview(raw: any): EmployeeOverview {
    const agents: AgentAnalytics[] = (raw?.agents ?? []).map(overviewRowToAnalytics);
    const byId = new Map(agents.map(a => [a.agent_id, a]));

    // 后端 leaderboards 已算好 top5，且行结构与 agents 相同；复用已适配对象保持引用一致。
    const mapBoard = (rows: any[] | undefined): AgentAnalytics[] =>
        (rows ?? []).map(r => byId.get(String(r.id)) ?? overviewRowToAnalytics(r));

    const t = raw?.totals ?? {};
    return {
        agents,
        totals: {
            totalAgents: Number(t.totalAgents ?? 0),
            activeAgents: Number(t.activeAgents ?? 0),
            totalTokens: Number(t.totalTokens ?? 0),
            totalActivities: Number(t.totalActivities ?? 0),
            totalActivitiesToday: Number(t.totalActivitiesToday ?? 0),
            totalHoursAll: Number(t.totalHoursAll ?? 0),
        },
        leaderboards: {
            mostPopular: mapBoard(raw?.leaderboards?.mostPopular),
            busiest: mapBoard(raw?.leaderboards?.busiest),
            idlest: mapBoard(raw?.leaderboards?.idlest),
        },
    };
}

function adaptCostOverview(raw: any): CostOverview {
    const models = (raw?.models ?? []).map((m: any) => ({
        model_id: String(m.model_id),
        model_label: m.model_label ?? String(m.model_id),
        agents: Number(m.agents ?? 0),
        totalTokens: Number(m.totalTokens ?? 0),
        totalCostCNY: Number(m.totalCostCNY ?? 0),
        todayTokens: Number(m.todayTokens ?? 0),
        todayCostCNY: Number(m.todayCostCNY ?? 0),
    }));
    const t = raw?.totals ?? {};
    return {
        models,
        totals: {
            modelCount: Number(t.modelCount ?? models.length),
            totalTokens: Number(t.totalTokens ?? 0),
            totalCostCNY: Number(t.totalCostCNY ?? 0),
            todayTokens: Number(t.todayTokens ?? 0),
            todayCostCNY: Number(t.todayCostCNY ?? 0),
            avgDailyTokens: Number(t.avgDailyTokens ?? 0),
            avgDailyCostCNY: Number(t.avgDailyCostCNY ?? 0),
            avgMonthlyTokens: Number(t.avgMonthlyTokens ?? 0),
            avgMonthlyCostCNY: Number(t.avgMonthlyCostCNY ?? 0),
        },
    };
}

/**
 * 后端 /value 的 perAgent 行 → AgentAnalytics。
 * 价值 Tab 组件只用 agent_id / agent.name / savedHours / savedCNY /
 * agent.tokens_used_total / tokenCostCNY / profitCNY。活动/饱满度字段补默认值。
 */
function valueRowToAnalytics(row: any): AgentAnalytics {
    const total = Number(row.totalActivities ?? 0);
    const tokensTotal = Number(row.tokensTotal ?? 0);
    const savedHours = Number(row.savedHours ?? 0);
    return {
        agent_id: String(row.id),
        total,
        today: 0,
        thisMonth: 0,
        conversationCount: 0,
        totalHours: savedHours,
        todayHours: 0,
        monthHours: 0,
        dailySaturation: 0,
        monthlySaturation: 0,
        agent: toAgent({ ...row, tokens_used_total: tokensTotal }),
        savedHours,
        savedCNY: Number(row.savedCNY ?? 0),
        tokenCostCNY: Number(row.tokenCostCNY ?? 0),
        profitCNY: Number(row.profitCNY ?? 0),
        valueScore: valueScore(total, tokensTotal),
    };
}

function adaptValueOverview(raw: any): ValueOverview {
    const perAgent: AgentAnalytics[] = (raw?.perAgent ?? []).map(valueRowToAnalytics);
    const t = raw?.totals ?? {};
    return {
        perAgent,
        totals: {
            totalHoursSaved: Number(t.totalHoursSaved ?? 0),
            totalSavingsCNY: Number(t.totalSavingsCNY ?? 0),
            totalTokenCostCNY: Number(t.totalTokenCostCNY ?? 0),
            totalProfitCNY: Number(t.totalProfitCNY ?? 0),
        },
    };
}

/* ─── 顶层入口 ─────────────────────────────────────────── */

/**
 * 一次性拉取三 Tab 数据。直连后端聚合接口，无客户端 N+1。
 * tenantId 参数保留以兼容 hook 签名；后端按 current_user.tenant_id 判定租户。
 */
export async function loadAnalytics(_tenantId: string): Promise<{
    employee: EmployeeOverview;
    cost: CostOverview;
    value: ValueOverview;
}> {
    const [overviewRaw, costRaw, valueRaw] = await Promise.all([
        dashboardApi.overview(),
        dashboardApi.cost(),
        dashboardApi.value(),
    ]);

    return {
        employee: adaptEmployeeOverview(overviewRaw),
        cost: adaptCostOverview(costRaw),
        value: adaptValueOverview(valueRaw),
    };
}

/** Token 时序趋势（后端 /dashboard/token-trend）。 */
export async function loadTokenTrend(days = 30): Promise<TokenTrend> {
    const raw = await dashboardApi.tokenTrend(days);
    return {
        days: Number(raw?.days ?? days),
        pointCount: Number(raw?.pointCount ?? (raw?.points?.length ?? 0)),
        points: (raw?.points ?? []).map((p: any) => ({
            date: String(p.date),
            tokens: Number(p.tokens ?? 0),
            inputTokens: Number(p.inputTokens ?? 0),
            outputTokens: Number(p.outputTokens ?? 0),
            cacheReadTokens: Number(p.cacheReadTokens ?? 0),
            cacheCreationTokens: Number(p.cacheCreationTokens ?? 0),
            costCNY: Number(p.costCNY ?? 0),
        })),
    };
}
