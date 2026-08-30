/**
 * Dashboard 聚合分析层类型定义
 *
 * 配套文档：DATA.md §8、PLAN.md §2
 */

import type { Agent } from '../../types';

/* ─── 后端原始响应类型 ───────────────────────────── */

/** GET /agents/{id}/chat-history/conversations 返回的单条 */
export interface Conversation {
    conv_id: string;
    partner_type: 'user' | 'feishu' | 'slack' | 'discord' | 'agent';
    partner_id: string;
    partner_name: string;
    last_message?: string;
    message_count: number;
    last_at?: string | null;
}

/** GET /agents/{id}/chat-history/{conv_id} 返回的单条 */
export interface ChatMessage {
    id: string;
    role: 'user' | 'assistant' | 'system' | 'tool_call';
    content: string;
    created_at: string | null;
}

/* ─── 聚合层类型 ───────────────────────────────── */

/** 单 agent 活动聚合结果 */
export interface AgentActivityStats {
    agent_id: string;
    /** 累计活动数（全部时间，role ∈ {assistant, tool_call}） */
    total: number;
    /** 今日活动数 */
    today: number;
    /** 本月活动数 */
    thisMonth: number;
    /** 涉及的 conversation 数（数据完整度参考） */
    conversationCount: number;
    /** 估算累计任务时长（小时） */
    totalHours: number;
    /** 估算今日工作时长（小时） */
    todayHours: number;
    /** 估算本月工作时长（小时） */
    monthHours: number;
    /** 日均饱满度（0~1，可乘 100 显示百分比） */
    dailySaturation: number;
    /** 月均饱满度（0~1） */
    monthlySaturation: number;
}

/** 单 agent 完整分析结果（活动 + token + 价值） */
export interface AgentAnalytics extends AgentActivityStats {
    agent: Agent;
    /** 累计节省工时（小时） */
    savedHours: number;
    /** 累计节省成本（元） */
    savedCNY: number;
    /** 累计 token 成本（元） */
    tokenCostCNY: number;
    /** 累计利润（元） */
    profitCNY: number;
    /** 价值贡献得分 = (活动数 × token) / 10000 */
    valueScore: number;
}

/** Tab 1: 员工概览 */
export interface EmployeeOverview {
    agents: AgentAnalytics[];
    totals: {
        totalAgents: number;
        activeAgents: number;
        totalTokens: number;
        totalActivities: number;
        totalActivitiesToday: number;
        totalHoursAll: number;
    };
    leaderboards: {
        mostPopular: AgentAnalytics[];   // 按活动总数降序
        busiest: AgentAnalytics[];       // 按 活动数 × token 降序
        idlest: AgentAnalytics[];        // 按 活动数 × token 升序
    };
}

/** Tab 2: 成本概览 */
export interface CostOverview {
    models: {
        model_id: string;
        model_label: string;
        agents: number;
        totalTokens: number;
        totalCostCNY: number;
        todayTokens: number;
        todayCostCNY: number;
    }[];
    totals: {
        modelCount: number;
        totalTokens: number;
        totalCostCNY: number;
        todayTokens: number;
        todayCostCNY: number;
        avgDailyTokens: number;
        avgDailyCostCNY: number;
        /** 当月 token（本月至今累计） */
        avgMonthlyTokens: number;
        avgMonthlyCostCNY: number;
    };
}

/** Tab 3: 价值贡献 */
export interface ValueOverview {
    perAgent: AgentAnalytics[];
    totals: {
        totalHoursSaved: number;
        totalSavingsCNY: number;
        totalTokenCostCNY: number;
        totalProfitCNY: number;
    };
}

/* ─── Token 时序趋势（后端 /dashboard/token-trend 新能力） ── */

/** 单日 token 时序点 */
export interface TokenTrendPoint {
    /** ISO 日期（YYYY-MM-DD 或带时区的日期串） */
    date: string;
    tokens: number;
    inputTokens: number;
    outputTokens: number;
    cacheReadTokens: number;
    cacheCreationTokens: number;
    costCNY: number;
}

/** Token 趋势整体响应 */
export interface TokenTrend {
    days: number;
    pointCount: number;
    points: TokenTrendPoint[];
}