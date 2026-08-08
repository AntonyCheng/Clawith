/**
 * Tab 3: 价值贡献
 * - 4 张 KPI 卡片
 * - 按员工统计表（工时 / 节省成本 / token 成本 / 利润）
 */

import React from 'react';
import { useTranslation } from 'react-i18next';
import { MetricCard } from './MetricCard';
import { DashboardIcons } from './icons';
import { useNavigate } from 'react-router-dom';
import type { ValueOverview as ValueOverviewData } from '../../types/analytics';

interface Props {
    data: ValueOverviewData | undefined;
    isLoading: boolean;
    isError: boolean;
}

const formatCNY = (n: number) => {
    if (n >= 10_000) return `¥${(n / 10_000).toFixed(2)} 万`;
    if (n >= 1) return `¥${n.toFixed(2)}`;
    if (n > 0) return `¥${n.toFixed(4)}`;
    return '¥0';
};

const formatHours = (h: number) => {
    if (h < 1) return `${(h * 60).toFixed(0)} min`;
    return `${h.toFixed(2)} h`;
};

const formatTokens = (n: number) => {
    if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(2)}M`;
    if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
    return String(n);
};

/**
 * 智能体头像：有 url 显示图片，加载失败回退首字；无 url 直接首字（红底白字）。
 * 与 Leaderboard / AgentMatrixTable 中保持一致：24×24，圆角方形。
 */
const AgentAvatar: React.FC<{ name: string; url?: string; size?: number }> = ({
    name,
    url,
    size = 24,
}) => {
    const [errored, setErrored] = React.useState(false);
    const initial = (name || '?').trim().charAt(0).toUpperCase() || '?';
    if (url && !errored) {
        return (
            <img
                src={url}
                alt={name}
                width={size}
                height={size}
                onError={() => setErrored(true)}
                style={{
                    width: size,
                    height: size,
                    borderRadius: 6,
                    objectFit: 'cover',
                    flexShrink: 0,
                    background: 'var(--bg-tertiary)',
                    display: 'block',
                }}
            />
        );
    }
    return (
        <div
            aria-label={name}
            style={{
                width: size,
                height: size,
                borderRadius: 6,
                background: '#dc2626',
                color: '#ffffff',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontSize: 11,
                fontWeight: 600,
                flexShrink: 0,
            }}
        >
            {initial}
        </div>
    );
};

export const ValueContribution: React.FC<Props> = ({ data, isLoading, isError }) => {
    const { t } = useTranslation();
    const navigate = useNavigate();

    if (isError) {
        return (
            <div style={{ padding: '40px', textAlign: 'center', color: 'var(--error)', fontSize: '13px' }}>
                {t('dashboard.valueContribution.loadError')}
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

    const { totals, perAgent } = data;

    const totalHoursPersonDays = (totals.totalHoursSaved / 8).toFixed(2);

    return (
        <>
            <style>{`
                .agent-matrix-scroll::-webkit-scrollbar {
                    display: none;
                }
            `}</style>
            <div>
            {/* KPI 卡片 */}
            <div style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(4, 1fr)',
                gap: '16px',
                marginBottom: '24px',
            }}>
                <MetricCard
                    label={t('dashboard.valueContribution.totalHoursSaved')}
                    value={formatHours(totals.totalHoursSaved)}
                    sub={t('dashboard.common.personDays', { value: totalHoursPersonDays })}
                    illustration="/dashboard/总节省工时.png"
                />
                <MetricCard
                    label={t('dashboard.valueContribution.totalSavings')}
                    value={formatCNY(totals.totalSavingsCNY)}
                    sub={t('dashboard.valueContribution.sub.savingsEstimate')}
                    illustration="/dashboard/总节省成本.png"
                />
                <MetricCard
                    label={t('dashboard.valueContribution.totalTokenCost')}
                    value={formatCNY(totals.totalTokenCostCNY)}
                    sub={t('dashboard.valueContribution.sub.tokenCostEstimate')}
                    illustration="/dashboard/总token成本.png"
                />
                <MetricCard
                    label={t('dashboard.valueContribution.totalProfit')}
                    value={formatCNY(totals.totalProfitCNY)}
                    sub={totals.totalProfitCNY >= 0
                        ? t('dashboard.valueContribution.profitState.profit')
                        : t('dashboard.valueContribution.profitState.loss')}
                    illustration="/dashboard/总利润.png"
                />
            </div>

            {/* 按员工统计表 */}
            <h3 style={{
                fontSize: '14px',
                fontWeight: 600,
                color: 'var(--text-primary)',
                margin: '0 0 12px',
            }}>
                {t('dashboard.valueContribution.tableTitle')}
            </h3>
            {perAgent.length === 0 ? (
                <div style={{
                    background: '#f8f9fd',
                    border: '1px solid #d0d7de',
                    borderRadius: '10px',
                    boxShadow: 'none',
                    padding: '40px',
                    textAlign: 'center',
                    color: 'rgba(0, 0, 0, 1)',
                    fontSize: '13px',
                }}>
                    {t('dashboard.valueContribution.noAgents')}
                </div>
            ) : (
                <div style={{
                    background: '#f8f9fd',
                    border: '1px solid #d0d7de',
                    borderRadius: '10px',
                    boxShadow: 'none',
                    overflow: 'hidden',
                }}>
                    <div style={{
                        display: 'grid',
                        gridTemplateColumns: 'minmax(180px, 1.4fr) 1fr 1.15fr 1.15fr 1.15fr 1.15fr',
                        width: '100%',
                        boxSizing: 'border-box',
                        padding: '10px 16px',
                        fontSize: '11px',
                        color: 'rgba(0, 0, 0, 1)',
                        fontWeight: 500,
                        textTransform: 'uppercase' as const,
                        letterSpacing: '0.05em',
                        borderBottom: '1px solid var(--border-subtle)',
                    }}>
                        <span>{t('dashboard.valueContribution.col.agent')}</span>
                        <span>{t('dashboard.valueContribution.col.savedHours')}</span>
                        <span>{t('dashboard.valueContribution.col.savedCost')}</span>
                        <span>{t('dashboard.common.totalTokens')}</span>
                        <span>{t('dashboard.valueContribution.col.tokenCost')}</span>
                        <span>{t('dashboard.valueContribution.col.profit')}</span>
                    </div>
                    <div
                        className="agent-matrix-scroll"
                        style={{ maxHeight: '480px', overflowY: 'auto', scrollbarWidth: 'none', msOverflowStyle: 'none' }}
                    >
                        {perAgent.map(a => (
                            <div
                                key={a.agent_id}
                                onClick={() => navigate(`/agents/${a.agent_id}`)}
                                style={{
                                    display: 'grid',
                                    gridTemplateColumns: 'minmax(180px, 1.4fr) 1fr 1.15fr 1.15fr 1.15fr 1.15fr',
                                    width: '100%',
                                    boxSizing: 'border-box',
                                    alignItems: 'center',
                                    padding: '10px 16px',
                                    cursor: 'pointer',
                                    transition: 'background 120ms ease',
                                    borderBottom: '1px solid #f2f2f2',
                                    fontSize: '13px',
                                    background: '#ffffff',
                                }}
                                onMouseEnter={e => {
                                    (e.currentTarget as HTMLElement).style.background = '#ececec';
                                }}
                                onMouseLeave={e => {
                                    (e.currentTarget as HTMLElement).style.background = '#ffffff';
                                }}
                            >
                                <div style={{
                                    fontWeight: 500,
                                    color: 'var(--text-primary)',
                                    overflow: 'hidden',
                                    textOverflow: 'ellipsis',
                                    whiteSpace: 'nowrap',
                                    paddingRight: '8px',
                                    display: 'flex',
                                    alignItems: 'center',
                                    gap: '8px',
                                }}>
                                    <AgentAvatar name={a.agent.name} url={a.agent.avatar_url} />
                                    <span style={{
                                        overflow: 'hidden',
                                        textOverflow: 'ellipsis',
                                        whiteSpace: 'nowrap',
                                    }}>
                                        {a.agent.name}
                                    </span>
                                </div>
                                <div style={{ color: 'var(--text-secondary)', fontFamily: '"Inter", -apple-system, BlinkMacSystemFont, sans-serif' }}>
                                    {formatHours(a.savedHours)}
                                </div>
                                <div style={{ color: 'var(--text-secondary)', fontFamily: '"Inter", -apple-system, BlinkMacSystemFont, sans-serif' }}>
                                    {formatCNY(a.savedCNY)}
                                </div>
                                <div style={{ color: 'var(--text-secondary)', fontFamily: '"Inter", -apple-system, BlinkMacSystemFont, sans-serif' }}>
                                    {formatTokens(a.agent.tokens_used_total ?? 0)}
                                </div>
                                <div style={{ color: 'var(--text-secondary)', fontFamily: '"Inter", -apple-system, BlinkMacSystemFont, sans-serif' }}>
                                    {formatCNY(a.tokenCostCNY)}
                                </div>
                                <div style={{
                                    color: '#E60012',
                                    fontWeight: 600,
                                    fontFamily: '"Inter", -apple-system, BlinkMacSystemFont, sans-serif',
                                }}>
                                    {formatCNY(a.profitCNY)}
                                </div>
                            </div>
                        ))}
                    </div>
                </div>
            )}
        </div>
        </>
    );
};