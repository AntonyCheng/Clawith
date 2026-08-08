/**
 * Top N 排行卡片
 * - 前 3 名有金银铜徽章
 * - 整行可点击跳转到 AgentDetail
 * - hover 高亮
 */

import React, { useState } from 'react';
import { createPortal } from 'react-dom';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import type { AgentAnalytics } from '../../types/analytics';

interface LeaderboardProps {
    title: string;
    items: AgentAnalytics[];
    /** 标题前面的图标 */
    icon?: React.ReactNode;
    /** 图标颜色，未传则用主题强调色 */
    accent?: string;
    /** 用于显示的字段（默认显示活动数） */
    metric?: 'total' | 'totalHours' | 'valueScore' | 'profitCNY' | 'tokenCostCNY';
    /** 自定义渲染（最高优先级） */
    renderValue?: (item: AgentAnalytics) => React.ReactNode;
    /** 自定义 metric 标签 */
    valueLabel?: string;
    /** 空态文案 */
    emptyText?: string;
    /** 标题右侧问号的悬停说明文案 */
    tooltip?: string;
}

const RANK_STYLES: Record<number, { bg: string; color: string; label: string; img?: string }> = {
    0: { bg: 'linear-gradient(135deg, #fbbf24 0%, #f59e0b 100%)', color: '#fff', label: '1', img: '/dashboard/排行榜1.png' },
    1: { bg: 'linear-gradient(135deg, #d4d4d8 0%, #a1a1aa 100%)', color: '#fff', label: '2', img: '/dashboard/排行榜2.png' },
    2: { bg: 'linear-gradient(135deg, #fb923c 0%, #ea580c 100%)', color: '#fff', label: '3', img: '/dashboard/排行榜3.png' },
};

/**
 * 智能体头像：有 url 显示图片，加载失败回退首字；无 url 直接首字。
 * 24×24 与排名圆圈同尺寸，保持行高不变。
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

const formatNumber = (n: number): string => {
    if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(2)}M`;
    if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
    return String(Math.round(n));
};

export const Leaderboard: React.FC<LeaderboardProps> = ({
    title,
    items,
    icon,
    accent,
    metric = 'total',
    renderValue,
    valueLabel,
    emptyText,
    tooltip,
}) => {
    const { t } = useTranslation();
    const navigate = useNavigate();
    const [tipPos, setTipPos] = useState<{ top: number; left: number } | null>(null);
    const resolvedEmptyText = emptyText ?? t('dashboard.leaderboard.empty');

    const renderDefault = (item: AgentAnalytics) => {
        const v = item[metric];
        if (typeof v === 'number') {
            if (metric === 'totalHours') return `${v.toFixed(2)} h`;
            if (metric === 'profitCNY' || metric === 'tokenCostCNY') return `¥${formatNumber(v)}`;
            if (metric === 'valueScore') return v.toFixed(2);
            return formatNumber(v);
        }
        return '–';
    };

    return (
        <div style={{
            background: '#f8f9fd',
            borderWidth: '1px',
            borderStyle: 'solid',
            borderColor: '#d0d7de',
            borderRadius: '10px',
            overflow: 'hidden',
            display: 'flex',
            flexDirection: 'column',
            minWidth: 0,
        }}>
            <div style={{
                padding: '12px 16px',
                borderBottom: '1px solid var(--border-subtle)',
                fontSize: '13px',
                fontWeight: 600,
                color: 'var(--text-primary)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
            }}>
                <span style={{ display: 'flex', alignItems: 'center', gap: '6px', color: accent || 'var(--text-primary)' }}>
                    {icon && (
                        <span style={{ display: 'inline-flex' }}>{icon}</span>
                    )}
                    {title}
                    {tooltip && (
                        <span
                            style={{
                                display: 'inline-flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                width: '15px',
                                height: '15px',
                                borderRadius: '50%',
                                background: 'var(--bg-tertiary)',
                                color: 'var(--text-tertiary)',
                                fontSize: '10px',
                                fontWeight: 700,
                                cursor: 'help',
                                flexShrink: 0,
                            }}
                            onMouseEnter={e => {
                                const r = e.currentTarget.getBoundingClientRect();
                                setTipPos({ top: r.bottom + 8, left: r.left + r.width / 2 });
                            }}
                            onMouseLeave={() => setTipPos(null)}
                        >
                            ?
                        </span>
                    )}
                </span>
                {valueLabel && (
                    <span style={{ fontSize: '11px', fontWeight: 400, color: 'var(--text-tertiary)' }}>
                        {valueLabel}
                    </span>
                )}
            </div>
            <div style={{ padding: '4px 0', background: 'rgba(255, 255, 255, 1)' }}>
                {items.length === 0 ? (
                    <div style={{
                        textAlign: 'center',
                        padding: '24px',
                        color: 'var(--text-tertiary)',
                        fontSize: '12px',
                    }}>
                        {resolvedEmptyText}
                    </div>
                ) : (
                    items.map((item, idx) => {
                        const rank = RANK_STYLES[idx];
                        return (
                            <div
                                key={item.agent_id}
                                onClick={() => navigate(`/agents/${item.agent_id}`)}
                                style={{
                                    display: 'flex',
                                    alignItems: 'center',
                                    gap: '10px',
                                    padding: '8px 16px',
                                    cursor: 'pointer',
                                    transition: 'background 120ms ease',
                                }}
                                onMouseEnter={e => {
                                    (e.currentTarget as HTMLElement).style.background = 'var(--bg-hover)';
                                }}
                                onMouseLeave={e => {
                                    (e.currentTarget as HTMLElement).style.background = 'transparent';
                                }}
                            >
                                <div style={{
                                    width: '24px',
                                    height: '24px',
                                    borderRadius: '50%',
                                    background: rank && !rank.img ? rank.bg : rank ? 'transparent' : 'var(--bg-tertiary)',
                                    color: rank && !rank.img ? rank.color : rank ? 'transparent' : 'var(--text-tertiary)',
                                    display: 'flex',
                                    alignItems: 'center',
                                    justifyContent: 'center',
                                    fontSize: '11px',
                                    fontWeight: 700,
                                    flexShrink: 0,
                                    overflow: 'hidden',
                                }}>
                                    {rank?.img ? (
                                        <img
                                            src={rank.img}
                                            alt=""
                                            style={{ width: '24px', height: '26px', borderRadius: '50%' }}
                                        />
                                    ) : rank ? rank.label : idx + 1}
                                </div>
                                <div style={{
                                    flex: 1,
                                    minWidth: 0,
                                    display: 'flex',
                                    alignItems: 'center',
                                    gap: '8px',
                                }}>
                                    <AgentAvatar name={item.agent.name} url={item.agent.avatar_url} />
                                    <span style={{
                                        fontSize: '13px',
                                        fontWeight: 500,
                                        color: 'var(--text-primary)',
                                        overflow: 'hidden',
                                        textOverflow: 'ellipsis',
                                        whiteSpace: 'nowrap',
                                        minWidth: 0,
                                    }}>
                                        {item.agent.name}
                                    </span>
                                </div>
                                <div style={{
                                    fontSize: '12px',
                                    color: 'var(--text-secondary)',
                                    fontWeight: 600,
                                    fontFamily: 'var(--font-mono)',
                                    flexShrink: 0,
                                }}>
                                    {renderValue ? renderValue(item) : renderDefault(item)}
                                </div>
                            </div>
                        );
                    })
                )}
            </div>
            {tooltip && tipPos && createPortal(
                <div
                    style={{
                        position: 'fixed',
                        top: tipPos.top,
                        left: tipPos.left,
                        transform: 'translateX(-50%)',
                        width: '220px',
                        padding: '8px 10px',
                        background: 'rgba(30, 34, 42, 0.96)',
                        color: '#fff',
                        fontSize: '11px',
                        fontWeight: 400,
                        lineHeight: 1.5,
                        borderRadius: '6px',
                        boxShadow: '0 4px 12px rgba(0, 0, 0, 0.18)',
                        pointerEvents: 'none',
                        zIndex: 9999,
                        whiteSpace: 'normal',
                        textAlign: 'left',
                    }}
                >
                    {tooltip}
                </div>,
                document.body
            )}
        </div>
    );
};