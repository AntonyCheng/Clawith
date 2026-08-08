/**
 * Token 时序趋势图（纯 SVG，零新依赖）
 *
 * - 折线：每日成本（元，平滑曲线 + 数据点 + 渐变区域）
 * - 悬浮 Tooltip：折线联动
 * - 顶部 KPI：累计 / 日均 / 峰值
 * - 时间窗口切换：7 / 30 / 90 天
 */

import React, { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { MetricCard } from './MetricCard';
import { useTokenTrend } from '../../hooks/useAnalytics';
import type { TokenTrendPoint } from '../../types/analytics';

interface Props {
    tenantId: string | undefined;
}

const formatTokens = (n: number) => {
    if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(2)}M`;
    if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
    return String(Math.round(n));
};

const formatCNY = (n: number) => {
    if (n >= 10_000) return `¥${(n / 10_000).toFixed(2)} 万`;
    if (n >= 1) return `¥${n.toFixed(2)}`;
    if (n > 0) return `¥${n.toFixed(4)}`;
    return '¥0';
};

const CHART_W = 720;
const CHART_H = 220;
const PADDING = { top: 16, right: 24, bottom: 32, left: 48 };

const RANGES = [7, 30, 90] as const;
type Range = typeof RANGES[number];

// 颜色 token（与品牌色一致，保留红色 #E60027）
const COLORS = {
    line: '#E60027',
    grid: 'rgba(208, 215, 222, 0.5)',
    text: 'rgba(102, 119, 129, 0.85)',
    guide: 'rgba(230, 0, 39, 0.35)',
    bgGradientStart: 'rgba(230, 0, 39, 0.18)',
    bgGradientEnd: 'rgba(230, 0, 39, 0)',
};

// Catmull-Rom -> Bezier 转换，生成平滑曲线
const smoothPath = (pts: { x: number; y: number }[]) => {
    if (pts.length === 0) return '';
    if (pts.length === 1) return `M${pts[0].x.toFixed(1)},${pts[0].y.toFixed(1)}`;
    const cmds: string[] = [`M${pts[0].x.toFixed(1)},${pts[0].y.toFixed(1)}`];
    for (let i = 0; i < pts.length - 1; i++) {
        const p0 = pts[i - 1] ?? pts[i];
        const p1 = pts[i];
        const p2 = pts[i + 1];
        const p3 = pts[i + 2] ?? p2;
        const cp1x = p1.x + (p2.x - p0.x) / 6;
        const cp1y = p1.y + (p2.y - p0.y) / 6;
        const cp2x = p2.x - (p3.x - p1.x) / 6;
        const cp2y = p2.y - (p3.y - p1.y) / 6;
        cmds.push(
            `C${cp1x.toFixed(1)},${cp1y.toFixed(1)} ${cp2x.toFixed(1)},${cp2y.toFixed(1)} ${p2.x.toFixed(1)},${p2.y.toFixed(1)}`,
        );
    }
    return cmds.join(' ');
};

export const TokenTrend: React.FC<Props> = ({ tenantId }) => {
    const { t } = useTranslation();
    const [days, setDays] = useState<Range>(30);
    const [hoverIdx, setHoverIdx] = useState<number | null>(null);
    const { data, isLoading, isError } = useTokenTrend(tenantId, days);

    const points: TokenTrendPoint[] = data?.points ?? [];
    const summary = useMemo(() => {
        if (points.length === 0) {
            return { total: 0, peak: 0, peakDate: '', avgDaily: 0, totalCost: 0, avgDailyCost: 0 };
        }
        let total = 0;
        let totalCost = 0;
        let peak = 0;
        let peakDate = points[0].date;
        for (const p of points) {
            total += p.tokens;
            totalCost += p.costCNY;
            if (p.tokens > peak) {
                peak = p.tokens;
                peakDate = p.date;
            }
        }
        return {
            total,
            peak,
            peakDate,
            avgDaily: total / points.length,
            totalCost,
            avgDailyCost: totalCost / points.length,
        };
    }, [points]);

    // SVG 几何
    const maxCost = Math.max(1, ...points.map(p => p.costCNY));
    const innerW = CHART_W - PADDING.left - PADDING.right;
    const innerH = CHART_H - PADDING.top - PADDING.bottom;
    const slotW = points.length > 0 ? innerW / points.length : 0;

    // 折线坐标
    const lineCoords = useMemo(() => {
        return points.map((p, i) => {
            const cx = PADDING.left + slotW * i + slotW / 2;
            const y = PADDING.top + innerH - (p.costCNY / maxCost) * innerH;
            return { x: cx, y, point: p };
        });
    }, [points, maxCost, innerH, slotW]);

    const linePathD = useMemo(() => smoothPath(lineCoords), [lineCoords]);
    const areaPathD = useMemo(() => {
        if (lineCoords.length === 0) return '';
        const baseY = PADDING.top + innerH;
        const first = lineCoords[0];
        const last = lineCoords[lineCoords.length - 1];
        return `${linePathD} L${last.x.toFixed(1)},${baseY} L${first.x.toFixed(1)},${baseY} Z`;
    }, [linePathD, lineCoords, innerH]);

    // X 轴刻度（最多 5 个）
    const xTickIndices = useMemo(() => {
        if (points.length === 0) return [];
        const count = Math.min(5, points.length);
        const step = Math.max(1, Math.floor((points.length - 1) / Math.max(1, count - 1)));
        const idx: number[] = [];
        for (let i = 0; i < points.length; i += step) idx.push(i);
        if (idx[idx.length - 1] !== points.length - 1) idx.push(points.length - 1);
        return idx;
    }, [points.length]);

    // Tooltip 位置
    const tooltip = useMemo(() => {
        if (hoverIdx == null || !points[hoverIdx]) return null;
        const p = points[hoverIdx];
        const cx = PADDING.left + slotW * hoverIdx + slotW / 2;
        const chartW = CHART_W;
        const tipW = 168;
        const tipH = 56;
        const padding = 8;
        let left = cx + 14;
        if (left + tipW > chartW - 4) left = cx - tipW - 14;
        const top = Math.max(4, PADDING.top + 4);
        return { p, cx, top, left, tipW, tipH, padding };
    }, [hoverIdx, points, slotW]);

    const handlePointerMove = (e: React.PointerEvent<SVGSVGElement>) => {
        const target = e.currentTarget;
        const rect = target.getBoundingClientRect();
        const xRatio = (e.clientX - rect.left) / rect.width;
        const svgX = xRatio * CHART_W;
        if (slotW <= 0) return;
        const idx = Math.floor((svgX - PADDING.left) / slotW);
        if (idx < 0 || idx >= points.length) {
            setHoverIdx(null);
            return;
        }
        if (idx !== hoverIdx) setHoverIdx(idx);
    };

    const handlePointerLeave = () => setHoverIdx(null);

    return (
        <div>
            {/* 标题 + 时间窗口 */}
            <div style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                marginBottom: '12px',
                marginTop: '8px',
            }}>
                <h3 style={{
                    fontSize: '14px',
                    fontWeight: 600,
                    color: 'var(--text-primary)',
                    margin: 0,
                }}>
                    {t('dashboard.tokenTrend.title')}
                </h3>
                <div style={{
                    display: 'inline-flex',
                    background: 'rgba(208, 215, 222, 0.18)',
                    borderRadius: '8px',
                    padding: '2px',
                    gap: '2px',
                }}>
                    {RANGES.map(r => {
                        const active = days === r;
                        return (
                            <button
                                key={r}
                                onClick={() => setDays(r)}
                                style={{
                                    padding: '4px 12px',
                                    fontSize: '11px',
                                    fontWeight: active ? 600 : 500,
                                    color: active ? '#fff' : 'var(--text-secondary)',
                                    background: active ? '#E60027' : 'transparent',
                                    border: 'none',
                                    borderRadius: '6px',
                                    cursor: 'pointer',
                                    fontFamily: 'var(--font-mono)',
                                    transition: 'background 160ms ease, color 160ms ease',
                                }}
                            >
                                {r}d
                            </button>
                        );
                    })}
                </div>
            </div>

            {/* KPI 行 */}
            <div style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(4, 1fr)',
                gap: '16px',
                marginBottom: '16px',
            }}>
                <MetricCard
                    label={t('dashboard.common.totalTokens')}
                    value={formatTokens(summary.total)}
                    sub={formatCNY(summary.totalCost)}
                    illustration="/dashboard/累计token.png"
                />
                <MetricCard
                    label={t('dashboard.tokenTrend.peak')}
                    value={formatTokens(summary.peak)}
                    sub={summary.peakDate || '–'}
                    illustration="/dashboard/单日峰值.png"
                />
                <MetricCard
                    label={t('dashboard.costOverview.avgDailyTokens')}
                    value={formatTokens(summary.avgDaily)}
                    sub={formatCNY(summary.avgDailyCost)}
                    illustration="/dashboard/日均token.png"
                />
                <MetricCard
                    label={t('dashboard.tokenTrend.dataPoints')}
                    value={points.length}
                    sub={t('dashboard.tokenTrend.sub.recentDays', { days })}
                    illustration="/dashboard/数据点数.png"
                />
            </div>

            {/* 图表 */}
            {isError ? (
                <div style={{
                    background: '#ffffff',
                    border: '1px solid #d0d7de',
                    borderRadius: '12px',
                    boxShadow: 'none',
                    padding: '40px',
                    textAlign: 'center',
                    color: 'var(--error)',
                    fontSize: '13px',
                }}>
                    {t('dashboard.tokenTrend.loadError')}
                </div>
            ) : isLoading || !data ? (
                <div style={{
                    background: '#ffffff',
                    border: '1px solid #d0d7de',
                    borderRadius: '12px',
                    boxShadow: 'none',
                    padding: '60px',
                    textAlign: 'center',
                    color: 'var(--text-tertiary)',
                    fontSize: '13px',
                }}>
                    {t('common.loading')}
                </div>
            ) : points.length === 0 ? (
                <div style={{
                    background: '#ffffff',
                    border: '1px solid #d0d7de',
                    borderRadius: '12px',
                    boxShadow: 'none',
                    padding: '60px',
                    textAlign: 'center',
                    color: 'var(--text-tertiary)',
                    fontSize: '13px',
                }}>
                    {t('dashboard.tokenTrend.empty', { days })}
                </div>
            ) : (
                <div style={{
                    position: 'relative',
                    background: '#ffffff',
                    border: '1px solid #d0d7de',
                    borderRadius: '12px',
                    boxShadow: 'none',
                    padding: '20px 24px 16px',
                }}>
                    <svg
                        viewBox={`0 0 ${CHART_W} ${CHART_H}`}
                        width="100%"
                        preserveAspectRatio="xMidYMid meet"
                        role="img"
                        aria-label={t('dashboard.tokenTrend.ariaLabel', { days })}
                        onPointerMove={handlePointerMove}
                        onPointerLeave={handlePointerLeave}
                        style={{ display: 'block', cursor: 'crosshair' }}
                    >
                        <defs>
                            {/* 折线区域渐变 */}
                            <linearGradient id="areaGrad" x1="0" y1="0" x2="0" y2="1">
                                <stop offset="0%" stopColor={COLORS.bgGradientStart} />
                                <stop offset="100%" stopColor={COLORS.bgGradientEnd} />
                            </linearGradient>
                            {/* 折线柔光 */}
                            <filter id="lineGlow" x="-5%" y="-50%" width="110%" height="200%">
                                <feGaussianBlur stdDeviation="1.2" />
                            </filter>
                        </defs>

                        {/* Y 轴网格 + 刻度 */}
                        {[0, 0.25, 0.5, 0.75, 1].map((ratio, i) => {
                            const y = PADDING.top + innerH - innerH * ratio;
                            return (
                                <g key={i}>
                                    <line
                                        x1={PADDING.left}
                                        x2={CHART_W - PADDING.right}
                                        y1={y}
                                        y2={y}
                                        stroke={COLORS.grid}
                                        strokeWidth={1}
                                        strokeDasharray={ratio === 0 ? '0' : '2 3'}
                                    />
                                    <text
                                        x={PADDING.left - 8}
                                        y={y + 3}
                                        textAnchor="end"
                                        fontSize="10"
                                        fill={COLORS.text}
                                        fontFamily="var(--font-mono)"
                                    >
                                        {formatCNY(maxCost * ratio)}
                                    </text>
                                </g>
                            );
                        })}

                        {/* 折线区域 */}
                        {areaPathD && (
                            <path
                                d={areaPathD}
                                fill="url(#areaGrad)"
                                opacity={0.9}
                            />
                        )}

                        {/* 折线柔光（底层） */}
                        {linePathD && (
                            <path
                                d={linePathD}
                                fill="none"
                                stroke={COLORS.line}
                                strokeWidth={3}
                                strokeOpacity={0.18}
                                strokeLinecap="round"
                                strokeLinejoin="round"
                                filter="url(#lineGlow)"
                            />
                        )}

                        {/* 折线主线条 */}
                        {linePathD && (
                            <path
                                d={linePathD}
                                fill="none"
                                stroke={COLORS.line}
                                strokeWidth={1}
                                strokeLinecap="round"
                                strokeLinejoin="round"
                            />
                        )}

                        {/* 数据点 */}
                        {lineCoords.map((c, i) => (
                            <circle
                                key={`pt-${i}`}
                                cx={c.x}
                                cy={c.y}
                                r={hoverIdx === i ? 4.5 : 2.5}
                                fill="#fff"
                                stroke={COLORS.line}
                                strokeWidth={hoverIdx === i ? 2.5 : 1.8}
                                style={{ transition: 'r 160ms ease, stroke-width 160ms ease' }}
                            />
                        ))}

                        {/* 悬浮引导线 */}
                        {tooltip && (
                            <line
                                x1={tooltip.cx}
                                x2={tooltip.cx}
                                y1={PADDING.top}
                                y2={PADDING.top + innerH}
                                stroke={COLORS.guide}
                                strokeWidth={1}
                                strokeDasharray="3 3"
                            />
                        )}

                        {/* X 轴标签 */}
                        {xTickIndices.map(i => {
                            const x = PADDING.left + slotW * i + slotW / 2;
                            const label = points[i].date.slice(0, 10).slice(5); // MM-DD
                            return (
                                <text
                                    key={`x-${i}`}
                                    x={x}
                                    y={CHART_H - 10}
                                    textAnchor="middle"
                                    fontSize="10"
                                    fill={COLORS.text}
                                    fontFamily="var(--font-mono)"
                                >
                                    {label}
                                </text>
                            );
                        })}
                    </svg>

                    {/* Tooltip（HTML 层，浮在 SVG 上方） */}
                    {tooltip && (
                        <div
                            style={{
                                position: 'absolute',
                                top: tooltip.top,
                                left: tooltip.left,
                                pointerEvents: 'none',
                                background: 'rgba(15, 23, 32, 0.92)',
                                color: '#fff',
                                borderRadius: '8px',
                                padding: '8px 12px',
                                fontSize: '11px',
                                lineHeight: 1.5,
                                boxShadow: '0 8px 24px rgba(15, 23, 32, 0.18)',
                                backdropFilter: 'blur(8px)',
                                minWidth: 168,
                                zIndex: 2,
                                transition: 'opacity 120ms ease',
                            }}
                        >
                            <div style={{
                                fontWeight: 600,
                                marginBottom: '4px',
                                fontFamily: 'var(--font-mono)',
                                fontSize: '11px',
                                opacity: 0.85,
                            }}>
                                {tooltip.p.date.slice(0, 10)}
                            </div>
                            <div style={{ display: 'flex', justifyContent: 'space-between', gap: '12px' }}>
                                <span style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}>
                                    <span style={{
                                        display: 'inline-block',
                                        width: '10px',
                                        height: '2px',
                                        background: COLORS.line,
                                        borderRadius: '1px',
                                    }} />
                                    {t('dashboard.tokenTrend.tooltip.cost')}
                                </span>
                                <span style={{ fontFamily: 'var(--font-mono)' }}>
                                    {formatCNY(tooltip.p.costCNY)}
                                </span>
                            </div>
                        </div>
                    )}

                    {/* 图例 */}
                    <div style={{
                        display: 'flex',
                        gap: '20px',
                        alignItems: 'center',
                        fontSize: '11px',
                        color: 'var(--text-tertiary)',
                        marginTop: '8px',
                        paddingTop: '10px',
                        borderTop: '1px solid rgba(208, 215, 222, 0.5)',
                    }}>
                        <span style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}>
                            <span style={{
                                display: 'inline-block',
                                width: '14px',
                                height: '2px',
                                background: COLORS.line,
                                borderRadius: '1px',
                            }} />
                            {t('dashboard.tokenTrend.legend.dailyCost')}
                        </span>
                    </div>
                </div>
            )}
        </div>
    );
};