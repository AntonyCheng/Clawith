/**
 * 数字员工矩阵表格
 * 列：员工 / 活动数 / 任务时长 / 累计 token / 价值贡献
 * - 点击列头排序
 * - 整行点击跳转到 AgentDetail
 */

import React, { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import type { AgentAnalytics } from '../../types/analytics';

type SortKey = 'total' | 'totalHours' | 'tokens' | 'valueScore' | 'name' | 'dailySaturation';
type SortDir = 'asc' | 'desc';

interface AgentMatrixTableProps {
    agents: AgentAnalytics[];
    /** 是否显示 token 列 */
    showToken?: boolean;
    /** 是否显示日均饱满度列（仅 Tab 1） */
    showSaturation?: boolean;
    /** 自定义列定义 */
    extraColumns?: { key: string; label: string; render: (a: AgentAnalytics) => React.ReactNode; sortable?: boolean; sortValue?: (a: AgentAnalytics) => number | string }[];
    emptyText?: string;
}

const formatTokens = (n: number) => {
    if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(2)}M`;
    if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
    return String(n);
};

/**
 * 智能体头像：有 url 显示图片，加载失败回退首字；无 url 直接首字（红底白字）。
 * 与 Leaderboard 中保持一致：24×24，圆角方形。
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

export const AgentMatrixTable: React.FC<AgentMatrixTableProps> = ({
    agents,
    showToken = true,
    showSaturation = false,
    extraColumns,
    emptyText,
}) => {
    const { t } = useTranslation();
    const navigate = useNavigate();
    const [sortKey, setSortKey] = useState<SortKey>('total');
    const [sortDir, setSortDir] = useState<SortDir>('desc');
    const resolvedEmptyText = emptyText ?? t('dashboard.matrix.empty');

    const toggleSort = (key: SortKey) => {
        if (sortKey === key) {
            setSortDir(d => (d === 'asc' ? 'desc' : 'asc'));
        } else {
            setSortKey(key);
            setSortDir('desc');
        }
    };

    const sorted = useMemo(() => {
        const arr = [...agents];
        arr.sort((a, b) => {
            let va: number | string = 0;
            let vb: number | string = 0;
            if (sortKey === 'name') {
                va = a.agent.name;
                vb = b.agent.name;
            } else if (sortKey === 'total') {
                va = a.total;
                vb = b.total;
            } else if (sortKey === 'totalHours') {
                va = a.totalHours;
                vb = b.totalHours;
            } else if (sortKey === 'tokens') {
                va = a.agent.tokens_used_total ?? 0;
                vb = b.agent.tokens_used_total ?? 0;
            } else if (sortKey === 'valueScore') {
                va = a.valueScore;
                vb = b.valueScore;
            } else if (sortKey === 'dailySaturation') {
                va = a.dailySaturation;
                vb = b.dailySaturation;
            }
            if (va < vb) return sortDir === 'asc' ? -1 : 1;
            if (va > vb) return sortDir === 'asc' ? 1 : -1;
            return 0;
        });
        return arr;
    }, [agents, sortKey, sortDir]);

    const colAgent = t('dashboard.matrix.col.agent');
    const colActivity = t('dashboard.common.activityCount');
    const colHours = t('dashboard.common.taskHours');
    const colTokens = t('dashboard.common.totalTokens');
    const colValue = t('dashboard.matrix.col.valueScore');
    const colSaturation = t('dashboard.matrix.col.dailySaturation');

    if (agents.length === 0) {
        return (
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
                {resolvedEmptyText}
            </div>
        );
    }

    const gridTemplate = showSaturation
        ? 'minmax(140px, 1.5fr) 0.7fr 0.9fr 0.9fr 0.9fr 0.9fr'
        : showToken
            ? 'minmax(160px, 1.7fr) 0.7fr 1fr 1fr 1.2fr'
            : 'minmax(180px, 1.8fr) 0.9fr 1fr 1fr';

    const SortHeader: React.FC<{ k: SortKey; label: string }> = ({ k, label }) => (
        <span
            onClick={() => toggleSort(k)}
            style={{
                cursor: 'pointer',
                userSelect: 'none',
                display: 'inline-flex',
                alignItems: 'center',
                gap: '4px',
            }}
        >
            {label}
            {sortKey === k && (
                <span style={{ fontSize: '9px', color: 'var(--text-secondary)' }}>
                    {sortDir === 'asc' ? '↑' : '↓'}
                </span>
            )}
        </span>
    );

    return (
        <>
            <style>{`
                .agent-matrix-scroll::-webkit-scrollbar {
                    display: none;
                }
            `}</style>
            <div style={{
                background: '#f8f9fd',
                border: '1px solid #d0d7de',
                borderRadius: '10px',
                boxShadow: 'none',
                overflow: 'hidden',
                fontFamily: '"Inter", -apple-system, BlinkMacSystemFont, sans-serif',
            }}>
            <div style={{
                display: 'grid',
                gridTemplateColumns: gridTemplate,
                width: '100%',
                boxSizing: 'border-box',
                padding: '10px 16px',
                fontSize: '11px',
                color: 'rgba(0, 0, 0, 1)',
                fontWeight: 500,
                textTransform: 'uppercase' as const,
                letterSpacing: '0.05em',
                borderBottom: '1px solid #f2f2f2',
            }}>
                <SortHeader k="name" label={colAgent} />
                <SortHeader k="total" label={colActivity} />
                <SortHeader k="totalHours" label={colHours} />
                {showToken && <SortHeader k="tokens" label={colTokens} />}
                <SortHeader k="valueScore" label={colValue} />
                {showSaturation && <SortHeader k="dailySaturation" label={colSaturation} />}
                {extraColumns?.map(col => (
                    <span key={col.key}>{col.label}</span>
                ))}
            </div>
            <div
                className="agent-matrix-scroll"
                style={{ maxHeight: '420px', overflowY: 'auto', scrollbarWidth: 'none', msOverflowStyle: 'none' }}
            >
                {sorted.map(a => (
                    <div
                        key={a.agent_id}
                        onClick={() => navigate(`/agents/${a.agent_id}`)}
                        style={{
                            display: 'grid',
                            gridTemplateColumns: gridTemplate,
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
                        <div style={{ color: 'var(--text-secondary)', fontFamily: '"Inter", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif' }}>
                            {a.total.toLocaleString()}
                        </div>
                        <div style={{ color: 'var(--text-secondary)', fontFamily: '"Inter", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif' }}>
                            {a.totalHours.toFixed(2)} h
                        </div>
                        {showToken && (
                            <div style={{ color: 'var(--text-secondary)', fontFamily: '"Inter", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif' }}>
                                {formatTokens(a.agent.tokens_used_total ?? 0)}
                            </div>
                        )}
                        <div style={{ color: '#E60012', fontWeight: 600, fontFamily: '"Inter", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif' }}>
                            {a.valueScore.toFixed(2)}
                        </div>
                        {showSaturation && (
                            <div style={{ color: 'var(--text-secondary)', fontFamily: '"Inter", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif' }}>
                                {a.dailySaturation > 0
                                    ? `${(a.dailySaturation * 100).toFixed(1)}%`
                                    : '–'}
                            </div>
                        )}
                        {extraColumns?.map(col => (
                            <div key={col.key}>{col.render(a)}</div>
                        ))}
                    </div>
                ))}
            </div>
            </div>
        </>
    );
};