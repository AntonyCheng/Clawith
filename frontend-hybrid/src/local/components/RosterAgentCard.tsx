/**
 * RosterAgentCard —— 花名册紧凑卡（静态信息展示）
 * 与对话页 AgentProfileCard（完整档案下拉面板）刻意分开：本卡无状态点/无 meta 行/无过期，
 * 结构 = 头部（小头像+名字+进入对话）/ 岗位职责（2行）/ 技能 chips（最多5个+N）/ 模型·Token 脚注。
 * 数据：技能 1 请求/人（fileApi.list skills），模型名由页面共享的模型列表解析。
 */
import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { IconMessageCircle } from '@tabler/icons-react';
import { fileApi } from '../../services/api';
import type { Agent } from '../../types';
import UserAvatar from './UserAvatar';

const formatTokens = (n: number) => {
    if (!n) return '0';
    if (n >= 1000000) return `${(n / 1000000).toFixed(1)}M`;
    if (n >= 1000) return `${(n / 1000).toFixed(1)}K`;
    return String(n);
};

const MAX_SKILL_CHIPS = 5;

export interface RosterAgentCardProps {
    agent: Agent;
    /** 页面共享的租户模型列表（脚注模型名解析） */
    models: any[];
    onEnterChat: () => void;
}

export default function RosterAgentCard({ agent, models, onEnterChat }: RosterAgentCardProps) {
    const { t } = useTranslation();

    const { data: skills } = useQuery({
        queryKey: ['roster-skills', agent.id],
        queryFn: () => fileApi.list(agent.id, 'skills'),
        staleTime: 60_000,
    });
    const skillNames = (skills || []).map(s => s.name.replace(/\.md$/i, ''));
    const shown = skillNames.slice(0, MAX_SKILL_CHIPS);
    const more = skillNames.length - shown.length;

    const primaryModel = models.find((m: any) => m.id === agent.primary_model_id);
    const modelLabel = primaryModel ? (primaryModel.label || primaryModel.model) : '—';

    return (
        <div
            style={{
                background: 'var(--bg-secondary, #fff)',
                border: '1px solid var(--border-subtle)',
                borderRadius: '12px',
                padding: '14px 16px',
                display: 'flex',
                flexDirection: 'column',
                gap: '10px',
                transition: 'box-shadow 0.15s ease',
            }}
            onMouseEnter={e => { e.currentTarget.style.boxShadow = '0 4px 16px rgba(15, 23, 42, 0.08)'; }}
            onMouseLeave={e => { e.currentTarget.style.boxShadow = 'none'; }}
        >
            {/* 头部：小头像 + 名字 + 进入对话 */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                <UserAvatar name={agent.name} src={agent.avatar_url} size={44} />
                <div style={{ flex: 1, minWidth: 0, fontWeight: 600, fontSize: '15px', color: 'var(--text-primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={agent.name}>
                    {agent.name}
                </div>
                <button
                    type="button"
                    className="btn btn-primary"
                    style={{ padding: '5px 10px', fontSize: '12px', display: 'inline-flex', alignItems: 'center', gap: '4px', flexShrink: 0 }}
                    onClick={e => { e.stopPropagation(); onEnterChat(); }}
                >
                    <IconMessageCircle size={13} stroke={1.8} />
                    {t('roster.enterChat', '进入对话')}
                </button>
            </div>

            {/* 岗位职责 */}
            <div
                title={agent.role_description || undefined}
                style={{
                    fontSize: '12px',
                    lineHeight: 1.55,
                    color: 'var(--text-secondary)',
                    minHeight: '37px',
                    display: '-webkit-box',
                    WebkitLineClamp: 2,
                    WebkitBoxOrient: 'vertical',
                    overflow: 'hidden',
                }}
            >
                {agent.role_description || t('roster.noRole', '暂无岗位职责描述')}
            </div>

            {/* 技能 chips：最多 5 个 + "+N" */}
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '5px', minHeight: '22px' }}>
                <span style={{ fontSize: '11px', color: 'var(--text-tertiary)', alignSelf: 'center', flexShrink: 0 }}>{t('roster.skills', '技能')}</span>
                {shown.map(name => (
                    <span key={name} title={name} style={{
                        fontSize: '11px', padding: '2px 8px', borderRadius: '999px',
                        background: 'rgba(230, 0, 18, 0.06)', color: '#E60012',
                        border: '1px solid rgba(230, 0, 18, 0.14)',
                        maxWidth: '110px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                    }}>
                        {name}
                    </span>
                ))}
                {more > 0 && (
                    <span title={skillNames.slice(MAX_SKILL_CHIPS).join('、')} style={{ fontSize: '11px', padding: '2px 8px', borderRadius: '999px', background: 'var(--bg-tertiary)', color: 'var(--text-tertiary)', alignSelf: 'center' }}>
                        +{more}
                    </span>
                )}
                {skillNames.length === 0 && (
                    <span style={{ fontSize: '11px', color: 'var(--text-tertiary)' }}>{t('roster.noSkills', '暂无技能')}</span>
                )}
            </div>

            {/* 脚注：模型 · 今日 Token */}
            <div style={{ fontSize: '11px', color: 'var(--text-tertiary)', borderTop: '1px solid var(--border-subtle)', paddingTop: '8px', marginTop: 'auto', display: 'flex', gap: '6px', overflow: 'hidden' }}>
                <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={modelLabel}>{modelLabel}</span>
                <span>·</span>
                <span style={{ flexShrink: 0 }}>{t('agent.settings.today', '今日')} {formatTokens(agent.tokens_used_today || 0)} tokens</span>
            </div>
        </div>
    );
}
