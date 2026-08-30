/**
 * AgentProfileCard —— 数字员工档案卡（共享组件）
 * 从 AgentDetailPage 的 renderAgentInfoCard 抽出，对话页与花名册共用：
 * 三列布局：① 档案（头像/职责/创建时间/创建者/时区/过期）② 工具和技能 ③ 模型 + Token 用量。
 * 花名册场景传 onEnterChat 显示右上角「进入对话」；对话页传 onOpenExpiry 显示过期设置按钮。
 */
import { useTranslation } from 'react-i18next';
import { IconMessageCircle } from '@tabler/icons-react';
import type { Agent } from '../../types';
import ToolsSkillsSummary from '../../pages/agent-detail/components/AgentInfoToolsSkills';

const formatTokens = (n: number) => {
    if (!n) return '0';
    if (n >= 1000000) return `${(n / 1000000).toFixed(1)}M`;
    if (n >= 1000) return `${(n / 1000).toFixed(1)}K`;
    return String(n);
};

const formatTokensParts = (n: number): { value: string; unit: string } => {
    if (!n) return { value: '0', unit: '' };
    if (n >= 1000000) return { value: (n / 1000000).toFixed(1), unit: 'M' };
    if (n >= 1000) return { value: (n / 1000).toFixed(1), unit: 'K' };
    return { value: String(n), unit: '' };
};

export interface AgentProfileCardProps {
    agent: Agent;
    /** 租户模型列表（用于模型名/提供商展示）；不传显示 — */
    models?: any[];
    /** 卡片展开态（对话页折叠动画用）；花名册默认展开 */
    open?: boolean;
    /** 显示「过期设置」按钮（对话页管理员） */
    canManage?: boolean;
    onOpenExpiry?: () => void;
    /** 挂载「工具和技能」列（对话页仅 chat 路由挂载） */
    showToolsSkills?: boolean;
    /** 花名册：右上角「进入对话」 */
    onEnterChat?: () => void;
}

export default function AgentProfileCard({
    agent,
    models = [],
    open = true,
    canManage = false,
    onOpenExpiry,
    showToolsSkills = true,
    onEnterChat,
}: AgentProfileCardProps) {
    const { t, i18n } = useTranslation();
    const tsLocale = i18n.language?.startsWith('zh') ? 'zh-CN' : 'en-US';
    const formatAgentDate = (d?: string | null) => {
        if (!d) return '—';
        try { return new Date(d).toLocaleDateString(tsLocale, { year: 'numeric', month: 'short', day: 'numeric' }); } catch { return d; }
    };

    const primaryModel = models.find((m: any) => m.id === agent.primary_model_id);
    const modelLabel = primaryModel ? (primaryModel.label || primaryModel.model) : '—';
    const modelProvider = primaryModel ? primaryModel.provider : '—';
    const todayParts = formatTokensParts(agent.tokens_used_today || 0);
    const monthParts = formatTokensParts(agent.tokens_used_month || 0);
    const totalParts = formatTokensParts((agent as any).tokens_used_total || 0);
    const cacheReadToday = (agent as any).cache_read_tokens_today || 0;
    const cacheHitRateToday = (agent.tokens_used_today || 0) > 0 ? Math.round((cacheReadToday / (agent.tokens_used_today || 1)) * 100) : 0;
    const expiryLabel = (agent as any).is_expired
        ? t('agent.settings.expiry.expired', '已过期')
        : (agent as any).expires_at
            ? new Date((agent as any).expires_at).toLocaleDateString(tsLocale, { year: 'numeric', month: 'short', day: 'numeric' })
            : t('agent.settings.expiry.neverExpires', '永不过期');

    return (
        <div style={onEnterChat ? { position: 'relative' } : undefined}>
            {onEnterChat && (
                <button
                    type="button"
                    className="btn btn-primary"
                    style={{ position: 'absolute', top: '12px', right: '12px', zIndex: 2, padding: '5px 12px', fontSize: '12px', display: 'inline-flex', alignItems: 'center', gap: '4px' }}
                    onClick={e => { e.stopPropagation(); onEnterChat(); }}
                >
                    <IconMessageCircle size={13} stroke={1.8} />
                    {t('roster.enterChat', '进入对话')}
                </button>
            )}
            <div className={`agent-info-card${open ? ' agent-info-card--open' : ''}`}>
                <div className="agent-info-card-inner">
                    <div className="agent-info-card-glow" />
                    <div className="agent-info-card-grid">
                        {/* Agent Profile */}
                        <div className="agent-info-card-section">
                            <div className="agent-info-card-section-header">
                                <span className="agent-info-section-icon agent-info-section-icon--indigo">
                                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="8" r="4" /><path d="M20 21a8 8 0 0 0-16 0" /></svg>
                                </span>
                                <span className="agent-info-card-section-title">{t('agent.profile.title', 'Agent Profile')}</span>
                            </div>
                            <div className="agent-info-card-body">
                                <div className="agent-info-profile-panel">
                                    <div className="agent-info-profile-avatar">
                                        {agent.avatar_url ? (
                                            <img src={agent.avatar_url} alt={agent.name} />
                                        ) : (
                                            <span>{agent.name?.[0] || 'A'}</span>
                                        )}
                                    </div>
                                    {agent.role_description && (
                                        <div className="agent-info-profile-role" title={agent.role_description}>{agent.role_description}</div>
                                    )}
                                    <div className="agent-info-meta-list agent-info-profile-meta">
                                        <div className="agent-info-meta-row">
                                            <span>{t('agent.profile.created')}</span>
                                            <span>{formatAgentDate(agent.created_at)}</span>
                                        </div>
                                        <div className="agent-info-meta-row">
                                            <span>{t('agent.fields.createdBy', 'Created by')}</span>
                                            <span>{(agent as any).creator_username ? `@${(agent as any).creator_username}` : '—'}</span>
                                        </div>
                                        <div className="agent-info-meta-row">
                                            <span>{t('agent.profile.timezone')}</span>
                                            <span>{(agent as any).effective_timezone || agent.timezone || 'UTC'}</span>
                                        </div>
                                        <div className="agent-info-meta-row">
                                            <span>{t('agent.settings.expiry.title')}</span>
                                            <span className={(agent as any).is_expired ? 'agent-info-expiry--expired' : ''}>{expiryLabel}</span>
                                        </div>
                                    </div>
                                    {canManage && onOpenExpiry && (
                                        <button
                                            type="button"
                                            className="agent-info-expiry-button"
                                            onClick={(e) => {
                                                e.stopPropagation();
                                                onOpenExpiry();
                                            }}
                                        >
                                            {t('agent.settings.expiry.title')}
                                        </button>
                                    )}
                                </div>
                            </div>
                        </div>
                        {/* 第2列：工具 & 技能 */}
                        <div className="agent-info-card-section">
                            <div className="agent-info-card-section-header">
                                <span className="agent-info-section-icon agent-info-section-icon--indigo">
                                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z" /></svg>
                                </span>
                                <span className="agent-info-card-section-title">{t('agent.toolsAndSkills', '工具和技能')}</span>
                            </div>
                            <div className="agent-info-card-body">
                                {showToolsSkills && <ToolsSkillsSummary agentId={agent.id} />}
                            </div>
                        </div>
                        <div className="agent-info-card-section agent-info-card-section--stacked">
                            {/* Model Configuration */}
                            <div className="agent-info-subsection">
                                <div className="agent-info-card-section-header">
                                    <span className="agent-info-section-icon agent-info-section-icon--indigo">
                                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z" /><circle cx="12" cy="12" r="3" /></svg>
                                    </span>
                                    <span className="agent-info-card-section-title">{t('agent.modelConfig.title', 'Configuration')}</span>
                                </div>
                                <div className="agent-info-card-body agent-info-card-body--compact">
                                    <div className="agent-info-model-card">
                                        <div className="agent-info-model-card-text">
                                            <span className="agent-info-model-card-label">{t('agent.modelConfig.model')}</span>
                                            <span className="agent-info-model-card-name" title={modelLabel}>{modelLabel}</span>
                                        </div>
                                    </div>
                                    <div className="agent-info-meta-list">
                                        <div className="agent-info-meta-row">
                                            <span>{t('agent.modelConfig.provider', 'Provider')}</span>
                                            <span>{modelProvider}</span>
                                        </div>
                                    </div>
                                </div>
                            </div>
                            {/* Token Usage */}
                            <div className="agent-info-subsection">
                                <div className="agent-info-card-section-header">
                                    <span className="agent-info-section-icon agent-info-section-icon--blue">
                                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="20" x2="18" y2="10" /><line x1="12" y1="20" x2="12" y2="4" /><line x1="6" y1="20" x2="6" y2="14" /></svg>
                                    </span>
                                    <span className="agent-info-card-section-title">Token</span>
                                </div>
                                <div className="agent-info-card-body agent-info-card-body--compact">
                                    <div className="agent-info-token-glass">
                                        <div className="agent-info-token-hero">
                                            <span className="agent-info-token-hero-label">{t('agent.settings.today')}</span>
                                            <span className="agent-info-token-hero-value">
                                                {todayParts.value}
                                                {todayParts.unit && <span className="agent-info-token-hero-unit">{todayParts.unit}</span>}
                                            </span>
                                        </div>
                                        <div className="agent-info-token-stats">
                                            <div className="agent-info-stat-item">
                                                <span className="agent-info-stat-label">{t('agent.settings.month')}</span>
                                                <span className="agent-info-stat-value">
                                                    {monthParts.value}
                                                    {monthParts.unit && <span className="agent-info-stat-unit">{monthParts.unit}</span>}
                                                </span>
                                            </div>
                                            <div className="agent-info-stat-item">
                                                <span className="agent-info-stat-label">Cache</span>
                                                <span className="agent-info-stat-value" title={`Today cache hit: ${formatTokens(cacheReadToday)} · ${cacheHitRateToday}%`}>
                                                    {formatTokens(cacheReadToday)}
                                                    <span className="agent-info-stat-unit">{cacheHitRateToday}%</span>
                                                </span>
                                            </div>
                                            <div className="agent-info-stat-item">
                                                <span className="agent-info-stat-label">{t('agent.status.totalToken')}</span>
                                                <span className="agent-info-stat-value">
                                                    {totalParts.value}
                                                    {totalParts.unit && <span className="agent-info-stat-unit">{totalParts.unit}</span>}
                                                </span>
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}
