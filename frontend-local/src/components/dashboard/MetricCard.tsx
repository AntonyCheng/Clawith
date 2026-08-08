/**
 * 通用 KPI 指标卡片
 * 沿用现有 StatsBar 视觉：白底、淡边框、轻阴影
 * 右侧可选装饰插图，传入 illustration URL 时显示在内容区右侧
 */

import React from 'react';

interface MetricCardProps {
    label: string;
    value: React.ReactNode;
    sub?: React.ReactNode;
    illustration?: string;
}

export const MetricCard: React.FC<MetricCardProps> = ({ label, value, sub, illustration }) => {
    return (
        <div style={{
            background: '#ffffff',
            border: '1px solid #d0d7de',
            borderRadius: '10px',
            boxShadow: 'none',
            padding: '16px 20px',
            display: 'flex',
            alignItems: 'center',
            gap: '12px',
            minWidth: 0,
            fontFamily: '"Inter", -apple-system, BlinkMacSystemFont, sans-serif',
        }}>
            <div style={{
                display: 'flex',
                flexDirection: 'column',
                gap: '4px',
                flex: 1,
                minWidth: 0,
            }}>
                <div style={{
                    fontSize: '12px',
                    color: '#000000',
                    fontWeight: 600,
                }}>
                    {label}
                </div>
                <div style={{
                    fontSize: '24px',
                    fontWeight: 600,
                    color: 'var(--text-primary)',
                    letterSpacing: '-0.02em',
                    lineHeight: 1.2,
                }}>
                    {value}
                </div>
                {sub != null && (
                    <div style={{ fontSize: '11px', color: 'var(--text-tertiary)' }}>{sub}</div>
                )}
            </div>
            {illustration && (
                <img
                    src={illustration}
                    alt=""
                    style={{
                        width: '72px',
                        height: '72px',
                        objectFit: 'contain',
                        flexShrink: 0,
                        borderRadius: '8px',
                        marginTop: '10px',
                    }}
                />
            )}
        </div>
    );
};