import React, { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import { agentApi } from '../services/api';
import LinearCopyButton from '../components/LinearCopyButton';
function fetchAuth<T>(url: string, options?: RequestInit): Promise<T> {
    const token = localStorage.getItem('token');
    return fetch(`/api${url}`, {
        ...options,
        headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    }).then(r => r.json());
}

interface OpenClawSettingsProps {
    agent: any;
    agentId: string;
    canManage: boolean;
}

export default function OpenClawSettings({ agent, agentId, canManage }: OpenClawSettingsProps) {
    const { t, i18n } = useTranslation();
    const queryClient = useQueryClient();
    const navigate = useNavigate();
    const isChinese = i18n.language?.startsWith('zh');

    // ─── API Key state ──────────────────────────────────
    const [apiKey, setApiKey] = useState<string | null>(null);
    const [regenerating, setRegenerating] = useState(false);
    const [showConfirm, setShowConfirm] = useState(false);
    // ─── Delete state ───────────────────────────────────
    const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
    const [deleting, setDeleting] = useState(false);

    const hasKey = agent?.has_api_key || false;

    const handleRegenerate = async (autoCopy = false) => {
        if (!canManage) return;
        setRegenerating(true);
        try {
            const result = await fetchAuth<{ api_key: string }>(`/agents/${agentId}/api-key`, { method: 'POST' });
            setApiKey(result.api_key);
            setShowConfirm(false);
            // Refresh agent data so has_api_key updates
            queryClient.invalidateQueries({ queryKey: ['agent', agentId] });
            if (autoCopy) {
                try {
                    await navigator.clipboard.writeText(result.api_key);
                } catch (err) {
                    console.error('Failed to auto-copy to clipboard:', err);
                }
            }
        } catch (e) {
            console.error('Failed to regenerate API key', e);
        } finally {
            setRegenerating(false);
        }
    };

    const handleDelete = async () => {
        if (!canManage) return;
        setDeleting(true);
        try {
            await agentApi.delete(agentId);
            queryClient.invalidateQueries({ queryKey: ['agents'] });
            navigate('/');
        } catch (e) {
            console.error('Failed to delete agent', e);
            setDeleting(false);
        }
    };

    // ─── Permissions state ──────────────────────────────
    const { data: permData } = useQuery({
        queryKey: ['agent-permissions', agentId],
        queryFn: () => fetchAuth<any>(`/agents/${agentId}/permissions`),
        enabled: !!agentId,
    });

    const handleScopeChange = async (newScope: string) => {
        if (!canManage || !isOwner) return;
        try {
            await fetchAuth(`/agents/${agentId}/permissions`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ scope_type: newScope, scope_ids: [], access_level: permData?.access_level || 'use' }),
            });
            queryClient.invalidateQueries({ queryKey: ['agent-permissions', agentId] });
            queryClient.invalidateQueries({ queryKey: ['agent', agentId] });
        } catch (e) {
            console.error('Failed to update permissions', e);
        }
    };

    const handleAccessLevelChange = async (newLevel: string) => {
        if (!canManage || !isOwner) return;
        try {
            await fetchAuth(`/agents/${agentId}/permissions`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ scope_type: permData?.scope_type || 'company', scope_ids: permData?.scope_ids || [], access_level: newLevel }),
            });
            queryClient.invalidateQueries({ queryKey: ['agent-permissions', agentId] });
            queryClient.invalidateQueries({ queryKey: ['agent', agentId] });
        } catch (e) {
            console.error('Failed to update access level', e);
        }
    };

    const isOwner = permData?.is_owner ?? false;
    const canEditPermissions = canManage && isOwner;
    const currentScope = permData?.scope_type === 'user' ? 'private' : (permData?.scope_type || 'company');
    const currentAccessLevel = permData?.access_level || 'use';

    return (
        <div>
            <h3 style={{ marginBottom: '16px' }}>{t('agent.settings.title')}</h3>

            {/* ── API Key Management ── */}
            <div className="card" style={{ marginBottom: '12px' }}>
                <h4 style={{ marginBottom: '4px' }}>
                    {t('enterprise.openclaw.apiKey')}
                </h4>
                <p style={{ fontSize: '12px', color: 'var(--text-tertiary)', marginBottom: '12px' }}>
                    {t('enterprise.openclaw.apiKeyDesc')}
                </p>

                {/* API Key Display Logic */}
                {(() => {
                    const activeKey = apiKey || (agent?.api_key_hash?.startsWith('oc-') ? agent.api_key_hash : null);
                    const isLegacyHash = hasKey && !activeKey;

                    if (activeKey) {
                        return (
                            <div style={{
                                display: 'flex', alignItems: 'center', gap: '8px',
                                padding: '10px 14px', background: 'rgba(99,102,241,0.06)',
                                borderRadius: '8px', border: '1px solid var(--accent-primary)',
                            }}>
                                <code style={{
                                    flex: 1, fontSize: '13px', fontFamily: 'monospace',
                                    wordBreak: 'break-all', color: 'var(--text-primary)',
                                }}>
                                    {activeKey}
                                </code>
                                <LinearCopyButton
                                    className="btn btn-secondary"
                                    textToCopy={activeKey}
                                    label={t('admin.copy')}
                                    copiedLabel={t('admin.copied')}
                                    style={{ padding: '4px 12px', fontSize: '12px', whiteSpace: 'nowrap', minWidth: '70px', height: 'fit-content' }}
                                />
                                {canManage && <button
                                    className="btn btn-secondary"
                                    onClick={() => setShowConfirm(true)}
                                    style={{ padding: '4px 12px', fontSize: '12px', whiteSpace: 'nowrap' }}
                                >
                                    {t('enterprise.openclaw.regenerate')}
                                </button>}
                            </div>
                        );
                    }

                    return (
                        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                            <div style={{
                                flex: 1, padding: '8px 14px', borderRadius: '8px',
                                background: 'var(--bg-elevated)', border: '1px solid var(--border-subtle)',
                                fontFamily: 'monospace', fontSize: '13px', color: 'var(--text-secondary)',
                                letterSpacing: '0.5px',
                            }}>
                                {isLegacyHash
                                    ? t('enterprise.openclaw.legacyKey')
                                    : t('enterprise.openclaw.notGenerated')}
                            </div>
                            {canManage && <button
                                className="btn btn-secondary"
                                onClick={() => setShowConfirm(true)}
                                style={{ padding: '6px 16px', fontSize: '12px', whiteSpace: 'nowrap' }}
                            >
                                {isLegacyHash
                                    ? t('enterprise.openclaw.regenerate')
                                    : t('enterprise.openclaw.generate')}
                            </button>}
                        </div>
                    );
                })()}

                {/* Confirmation dialog */}
                {showConfirm && (
                    <div style={{
                        marginTop: '12px', padding: '14px', borderRadius: '8px',
                        background: hasKey ? 'rgba(255,80,80,0.06)' : 'rgba(99,102,241,0.04)',
                        border: hasKey ? '1px solid rgba(255,80,80,0.2)' : '1px solid var(--border-subtle)',
                    }}>
                        <div style={{ fontSize: '13px', fontWeight: 500, marginBottom: '8px', color: 'var(--text-primary)' }}>
                            {hasKey
                                ? t('enterprise.openclaw.regenerateKeyQuestion')
                                : t('enterprise.openclaw.generateKeyQuestion')}
                        </div>
                        <div style={{ fontSize: '12px', color: 'var(--text-secondary)', marginBottom: '12px' }}>
                            {hasKey
                                ? t('enterprise.openclaw.currentKeyRevoked')
                                : t('enterprise.openclaw.newKeyGenerated')}
                        </div>
                        <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end' }}>
                            <button
                                className="btn btn-secondary"
                                onClick={() => setShowConfirm(false)}
                                style={{ padding: '5px 14px', fontSize: '12px' }}
                            >
                                {t('admin.cancel')}
                            </button>
                            <button
                                className="btn btn-primary"
                                onClick={() => handleRegenerate(false)}
                                disabled={!canManage || regenerating}
                                style={{ padding: '5px 14px', fontSize: '12px' }}
                            >
                                {regenerating
                                    ? t('enterprise.openclaw.generating')
                                    : t('enterprise.openclaw.confirm')}
                            </button>
                        </div>
                    </div>
                )}
            </div>

            {/* ── Permissions ── */}
            <div className="card" style={{ marginBottom: '12px' }}>
                <h4 style={{ marginBottom: '12px' }}>
                    {t('agent.settings.perm.title', 'Access Permissions')}
                </h4>
                <p style={{ fontSize: '12px', color: 'var(--text-tertiary)', marginBottom: '16px' }}>
                    {t('agent.settings.perm.description', 'Control who can see and interact with this agent. Only the creator or admin can change this.')}
                </p>

                {/* Scope Selection */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginBottom: '16px' }}>
                    {(['company', 'private', 'custom'] as const).map((scope) => (
                        <label
                            key={scope}
                            style={{
                                display: 'flex', alignItems: 'center', gap: '10px',
                                padding: '12px 14px', borderRadius: '8px',
                                cursor: canEditPermissions ? 'pointer' : 'default',
                                border: currentScope === scope
                                    ? '1px solid var(--accent-primary)'
                                    : '1px solid var(--border-subtle)',
                                background: currentScope === scope
                                    ? 'rgba(99,102,241,0.06)'
                                    : 'transparent',
                                opacity: canEditPermissions ? 1 : 0.7,
                                transition: 'all 0.15s',
                            }}
                        >
                            <input
                                type="radio"
                                name="perm_scope_oc"
                                checked={currentScope === scope}
                                disabled={!canEditPermissions}
                                onChange={() => handleScopeChange(scope)}
                                style={{ accentColor: 'var(--accent-primary)' }}
                            />
                            <div>
                                <div style={{ fontWeight: 500, fontSize: '13px' }}>
                                    {scope === 'company'
                                        ? t('agent.settings.perm.companyWide', 'Company-wide')
                                        : scope === 'private'
                                            ? t('agent.settings.perm.onlyMe', 'Only Me')
                                            : t('agent.settings.perm.custom', 'Custom')}
                                </div>
                                <div style={{ fontSize: '11px', color: 'var(--text-tertiary)', marginTop: '2px' }}>
                                    {scope === 'company' && t('agent.settings.perm.companyWideDesc', 'All users in the organization can use this agent')}
                                    {scope === 'private' && t('agent.settings.perm.onlyMeDesc', 'Only the creator can use this agent')}
                                    {scope === 'custom' && t('agent.settings.perm.customDesc', 'Start private, then choose platform users in Settings')}
                                </div>
                            </div>
                        </label>
                    ))}
                </div>

                {/* Access Level for company scope */}
                {currentScope === 'company' && canEditPermissions && (
                    <div style={{ borderTop: '1px solid var(--border-subtle)', paddingTop: '12px' }}>
                        <label style={{ display: 'block', fontSize: '13px', fontWeight: 500, marginBottom: '8px' }}>
                            {t('agent.settings.perm.defaultAccess', 'Default Access Level')}
                        </label>
                        <div style={{ display: 'flex', gap: '8px' }}>
                            {[
                                { val: 'use', label: t('agent.settings.perm.useAccess', 'Use'), desc: t('agent.settings.perm.useAccessDesc', 'Task, Chat, Tools, Skills, Workspace') },
                                { val: 'manage', label: t('agent.settings.perm.manageAccess', 'Manage'), desc: t('agent.settings.perm.manageAccessDesc', 'Full access including Settings, Mind, Relationships') },
                            ].map(opt => (
                                <label key={opt.val}
                                    style={{
                                        flex: 1, padding: '10px 12px', borderRadius: '8px',
                                        cursor: 'pointer',
                                        border: currentAccessLevel === opt.val
                                            ? '1px solid var(--accent-primary)'
                                            : '1px solid var(--border-subtle)',
                                        background: currentAccessLevel === opt.val
                                            ? 'rgba(99,102,241,0.06)'
                                            : 'transparent',
                                        transition: 'all 0.15s',
                                    }}
                                >
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                                        <input type="radio" name="access_level_oc" checked={currentAccessLevel === opt.val}
                                            onChange={() => handleAccessLevelChange(opt.val)}
                                            style={{ accentColor: 'var(--accent-primary)' }} />
                                        <span style={{ fontWeight: 500, fontSize: '13px' }}>{opt.label}</span>
                                    </div>
                                    <div style={{ fontSize: '11px', color: 'var(--text-tertiary)', marginTop: '4px', marginLeft: '20px' }}>{opt.desc}</div>
                                </label>
                            ))}
                        </div>
                    </div>
                )}

                {currentScope !== 'company' && permData?.scope_names?.length > 0 && (
                    <div style={{ marginTop: '12px', fontSize: '12px', color: 'var(--text-secondary)' }}>
                        <span style={{ fontWeight: 500 }}>{t('agent.settings.perm.currentAccess', 'Current access')}:</span>{' '}
                        {permData.scope_names.map((s: any) => s.name).join(', ')}
                    </div>
                )}

                {!isOwner && (
                    <div style={{ marginTop: '12px', fontSize: '11px', color: 'var(--text-tertiary)', fontStyle: 'italic' }}>
                        {t('agent.settings.perm.readOnly', 'Only the creator or admin can change permissions')}
                    </div>
                )}
            </div>

            {/* ── Danger Zone: Delete Agent ── */}
            {canEditPermissions && (
                <div className="card" style={{
                    marginBottom: '12px',
                    border: '1px solid rgba(255,80,80,0.2)',
                }}>
                    <h4 style={{ marginBottom: '4px', color: 'var(--error)' }}>
                        {t('enterprise.openclaw.dangerZone')}
                    </h4>
                    <p style={{ fontSize: '12px', color: 'var(--text-tertiary)', marginBottom: '12px' }}>
                        {t('enterprise.openclaw.dangerZoneDesc')}
                    </p>

                    {showDeleteConfirm ? (
                        <div style={{
                            padding: '14px', borderRadius: '8px',
                            background: 'rgba(255,80,80,0.06)', border: '1px solid rgba(255,80,80,0.2)',
                        }}>
                            <div style={{ fontSize: '13px', fontWeight: 500, marginBottom: '8px', color: 'var(--text-primary)' }}>
                                {t('enterprise.openclaw.confirmDeleteAgent', { name: agent?.name })}
                            </div>
                            <div style={{ fontSize: '12px', color: 'var(--text-secondary)', marginBottom: '12px' }}>
                                {t('enterprise.openclaw.irreversible')}
                            </div>
                            <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end' }}>
                                <button
                                    className="btn btn-secondary"
                                    onClick={() => setShowDeleteConfirm(false)}
                                    style={{ padding: '5px 14px', fontSize: '12px' }}
                                >
                                    {t('admin.cancel')}
                                </button>
                                <button
                                    className="btn btn-danger"
                                    onClick={handleDelete}
                                    disabled={deleting}
                                    style={{ padding: '5px 14px', fontSize: '12px' }}
                                >
                                    {deleting
                                        ? t('enterprise.openclaw.deleting')
                                        : t('enterprise.openclaw.delete')}
                                </button>
                            </div>
                        </div>
                    ) : (
                        <button
                            className="btn btn-danger"
                            onClick={() => setShowDeleteConfirm(true)}
                            style={{ padding: '6px 20px', fontSize: '12px' }}
                        >
                            {t('enterprise.openclaw.deleteThisAgent')}
                        </button>
                    )}
                </div>
            )}
        </div>
    );
}
