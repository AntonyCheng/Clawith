/**
 * Tab 2: 成本概览
 * - 4 张 KPI 卡片
 * - 按模型分组的卡片
 * - 时间维度（今日/日均/月均）卡片
 */

import React from 'react';
import { useTranslation } from 'react-i18next';
import { MetricCard } from './MetricCard';
import type { CostOverview as CostOverviewData } from '../../types/analytics';

interface Props {
    data: CostOverviewData | undefined;
    isLoading: boolean;
    isError: boolean;
}

const formatTokens = (n: number) => {
    if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(2)}M`;
    if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
    return String(n);
};

const formatCNY = (n: number) => {
    if (n >= 10_000) return `¥${(n / 10_000).toFixed(2)} 万`;
    if (n >= 1) return `¥${n.toFixed(2)}`;
    if (n > 0) return `¥${n.toFixed(4)}`;
    return '¥0';
};

export const CostOverview: React.FC<Props> = ({ data, isLoading, isError }) => {
    const { t } = useTranslation();

    if (isError) {
        return (
            <div style={{ padding: '40px', textAlign: 'center', color: 'var(--error)', fontSize: '13px' }}>
                {t('dashboard.costOverview.loadError')}
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

    const { totals, models } = data;

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
                    label={t('dashboard.costOverview.modelsUsed')}
                    value={totals.modelCount}
                    sub={t('dashboard.costOverview.sub.coversModels', { count: totals.modelCount })}
                    illustration="/dashboard/使用模型数.png"
                />
                <MetricCard
                    label={t('dashboard.common.totalTokens')}
                    value={formatTokens(totals.totalTokens)}
                    sub={formatCNY(totals.totalCostCNY)}
                    illustration="/dashboard/累计token.png"
                />
                <MetricCard
                    label={t('dashboard.costOverview.todayTokens')}
                    value={formatTokens(totals.todayTokens)}
                    sub={formatCNY(totals.todayCostCNY)}
                    illustration="/dashboard/今日token.png"
                />
                <MetricCard
                    label={t('dashboard.costOverview.avgDailyCost')}
                    value={formatCNY(totals.avgDailyCostCNY)}
                    sub={t('dashboard.costOverview.sub.thisMonth', { value: formatCNY(totals.avgMonthlyCostCNY) })}
                    illustration="/dashboard/日均成本.png"
                />
            </div>

            {/* 模型分组 */}
            <h3 style={{
                fontSize: '14px',
                fontWeight: 600,
                color: 'var(--text-primary)',
                margin: '0 0 12px',
            }}>
                {t('dashboard.costOverview.modelBreakdownTitle')}
            </h3>
            {models.length === 0 ? (
                <div style={{
                    background: '#ffffff',
                    border: '1px solid #d0d7de',
                    borderRadius: '10px',
                    boxShadow: 'none',
                    padding: '40px',
                    textAlign: 'center',
                    color: 'var(--text-tertiary)',
                    fontSize: '13px',
                }}>
                    {t('dashboard.costOverview.noModels')}
                </div>
            ) : (
                <div style={{
                    display: 'grid',
                    gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))',
                    gap: '16px',
                    marginBottom: '24px',
                }}>
                    {models.map(m => (
                        <div
                            key={m.model_id}
                            style={{
                                background: '#ffffff',
                                border: '1px solid #d0d7de',
                                borderRadius: '10px',
                                boxShadow: 'none',
                                padding: '16px 20px',
                            }}
                        >
                            <div style={{
                                fontSize: '13px',
                                fontWeight: 600,
                                color: 'var(--text-primary)',
                                marginBottom: '8px',
                                overflow: 'hidden',
                                textOverflow: 'ellipsis',
                                whiteSpace: 'nowrap',
                            }}>
                                {m.model_label}
                            </div>
                            <div style={{
                                fontSize: '22px',
                                fontWeight: 600,
                                color: '#E60027',
                                fontFamily: 'var(--font-mono)',
                                marginBottom: '4px',
                            }}>
                                {formatCNY(m.totalCostCNY)}
                            </div>
                            <div style={{
                                display: 'flex',
                                justifyContent: 'space-between',
                                fontSize: '11px',
                                color: 'var(--text-tertiary)',
                                marginTop: '8px',
                                paddingTop: '8px',
                                borderTop: '1px solid var(--border-subtle)',
                            }}>
                                <span>{t('dashboard.costOverview.sub.tokenCount', { value: formatTokens(m.totalTokens) })}</span>
                                <span>{t('dashboard.costOverview.sub.agentsCount', { count: m.agents })}</span>
                            </div>
                        </div>
                    ))}
                </div>
            )}

            {/* 时间维度 */}
            <h3 style={{
                fontSize: '14px',
                fontWeight: 600,
                color: 'var(--text-primary)',
                margin: '0 0 12px',
            }}>
                {t('dashboard.costOverview.timeBucketsTitle')}
            </h3>
            <div style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(4, 1fr)',
                gap: '16px',
            }}>
                <MetricCard
                    label={t('dashboard.costOverview.todayTokens')}
                    value={formatTokens(totals.todayTokens)}
                    sub={formatCNY(totals.todayCostCNY)}
                    illustration="/dashboard/今日token.png"
                />
                <MetricCard
                    label={t('dashboard.costOverview.avgDailyTokens')}
                    value={formatTokens(totals.avgDailyTokens)}
                    sub={formatCNY(totals.avgDailyCostCNY)}
                    illustration="/dashboard/日均token.png"
                />
                <MetricCard
                    label={t('dashboard.costOverview.avgMonthlyTokens')}
                    value={formatTokens(totals.avgMonthlyTokens)}
                    sub={formatCNY(totals.avgMonthlyCostCNY)}
                    illustration="/dashboard/当月token.png"
                />
                <MetricCard
                    label={t('dashboard.common.totalTokens')}
                    value={formatTokens(totals.totalTokens)}
                    sub={formatCNY(totals.totalCostCNY)}
                    illustration="/dashboard/累计token.png"
                />
            </div>
        </div>
    );
};