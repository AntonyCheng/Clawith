/**
 * Tab 1: 员工概览
 * - 4 张 KPI 卡片
 * - 三栏排行（最受欢迎/最忙/最闲）
 * - 数字员工任务矩阵
 */

import React from 'react';
import { useTranslation } from 'react-i18next';
import { MetricCard } from './MetricCard';
import { Leaderboard } from './Leaderboard';
import { AgentMatrixTable } from './AgentMatrixTable';
import { DashboardIcons } from './icons';
import type { EmployeeOverview as EmployeeOverviewData } from '../../types/analytics';

interface Props {
    data: EmployeeOverviewData | undefined;
    isLoading: boolean;
    isError: boolean;
}

const formatTokens = (n: number) => {
    if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(2)}M`;
    if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
    return String(n);
};

const formatHours = (h: number) => {
    if (h < 1) return `${(h * 60).toFixed(0)} min`;
    if (h >= 100) return `${h.toFixed(0)} h`;
    return `${h.toFixed(1)} h`;
};

export const EmployeeOverview: React.FC<Props> = ({ data, isLoading, isError }) => {
    const { t } = useTranslation();

    if (isError) {
        return (
            <div style={{ padding: '40px', textAlign: 'center', color: 'var(--error)', fontSize: '13px' }}>
                {t('dashboard.employeeOverview.loadError')}
            </div>
        );
    }

    if (isLoading || !data) {
        return (
            <div style={{ padding: '60px', textAlign: 'center', color: 'var(--text-tertiary)', fontSize: '13px' }}>
                {t('common.loading')}
            </div>
        );
    }

    const { totals, leaderboards, agents } = data;

    const totalHoursPersonDays = (totals.totalHoursAll / 8).toFixed(1);
    const avgTokensPerPerson = totals.totalAgents > 0
        ? formatTokens(totals.totalTokens / totals.totalAgents)
        : '0';

    return (
        <div>
            {/* KPI 卡片 */}
            <div style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(4, 1fr)',
                gap: '16px',
                marginBottom: '24px',
            }}>
                <MetricCard
                    label={t('dashboard.stats.agents')}
                    value={totals.totalAgents}
                    sub={t('dashboard.stats.online', { count: totals.activeAgents })}
                    illustration="/dashboard/数字员工.png"
                />
                <MetricCard
                    label={t('dashboard.employeeOverview.todayActivities')}
                    value={totals.totalActivitiesToday.toLocaleString()}
                    sub={t('dashboard.employeeOverview.sub.totalActivities', { value: totals.totalActivities.toLocaleString() })}
                    illustration="/dashboard/今日活动数.png"
                />
                <MetricCard
                    label={t('dashboard.employeeOverview.totalHours')}
                    value={formatHours(totals.totalHoursAll)}
                    sub={t('dashboard.common.personDays', { value: totalHoursPersonDays })}
                    illustration="/dashboard/累计任务时长.png"
                />
                <MetricCard
                    label={t('dashboard.common.totalTokens')}
                    value={formatTokens(totals.totalTokens)}
                    sub={t('dashboard.employeeOverview.sub.avgPerPerson', { value: avgTokensPerPerson })}
                    illustration="/dashboard/累计token 2.png"
                />
            </div>

            {/* 三栏排行 */}
            <div style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(3, 1fr)',
                gap: '16px',
                marginBottom: '24px',
            }}>
                <Leaderboard
                    icon={<img src="/dashboard/最受欢迎Top5.png" alt="" width={18} height={18} style={{ display: 'block', flexShrink: 0 }} />}
                    accent="#e60012"
                    title={t('dashboard.employeeOverview.leaderboard.mostPopularTitle')}
                    items={leaderboards.mostPopular}
                    metric="total"
                    valueLabel={t('dashboard.common.activityCount')}
                    tooltip={t('dashboard.employeeOverview.leaderboard.mostPopularTooltip')}
                />
                <Leaderboard
                    icon={<img src="/dashboard/最忙Top5.png" alt="" width={18} height={18} style={{ display: 'block', flexShrink: 0 }} />}
                    accent="#ffb31a"
                    title={t('dashboard.employeeOverview.leaderboard.busiestTitle')}
                    items={leaderboards.busiest}
                    metric="totalHours"
                    valueLabel={t('dashboard.common.taskHours')}
                    tooltip={t('dashboard.employeeOverview.leaderboard.busiestTooltip')}
                />
                <Leaderboard
                    icon={<img src="/dashboard/最闲Top5.png" alt="" width={18} height={18} style={{ display: 'block', flexShrink: 0 }} />}
                    accent="#1a8cff"
                    title={t('dashboard.employeeOverview.leaderboard.idlestTitle')}
                    items={leaderboards.idlest}
                    metric="totalHours"
                    valueLabel={t('dashboard.common.taskHours')}
                    tooltip={t('dashboard.employeeOverview.leaderboard.idlestTooltip')}
                />
            </div>

            {/* 数字员工任务矩阵 */}
            <div>
                <h3 style={{
                    fontSize: '14px',
                    fontWeight: 600,
                    color: 'var(--text-primary)',
                    margin: '0 0 12px',
                }}>
                    {t('dashboard.employeeOverview.matrixTitle')}
                </h3>
                <AgentMatrixTable agents={agents} showSaturation />
            </div>
        </div>
    );
};