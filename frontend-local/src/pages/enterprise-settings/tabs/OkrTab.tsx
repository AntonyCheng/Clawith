import React, { useEffect, useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { useDialog } from '../../../components/Dialog/DialogProvider';
import { fetchJson } from '../utils/fetchJson';

// ─── OKR Tab ──────────────────────────────────────────
export default function OkrTab({ tenantId, t }: { tenantId: string; t: any }) {
    const qc = useQueryClient();
    const dialog = useDialog();
    const { t: tt } = useTranslation();
    const okrSaveTimerRef = useRef<number | null>(null);
    const [okrSaveState, setOkrSaveState] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');
    const [okrSaveError, setOkrSaveError] = useState('');
    const [dailyTestState, setDailyTestState] = useState<'idle' | 'running' | 'success' | 'error'>('idle');
    const [dailyTestMessage, setDailyTestMessage] = useState('');

    const { data: settings, isLoading } = useQuery({
        queryKey: ['okr-settings', tenantId],
        queryFn: () => fetchJson<any>('/okr/settings')
    });
    const { data: tenantInfo } = useQuery({
        queryKey: ['tenant-timezone', tenantId],
        queryFn: () => fetchJson<any>(`/tenants/${tenantId}`),
        enabled: !!tenantId,
    });
    const updateSettings = useMutation({
        mutationFn: (data: any) => fetchJson('/okr/settings', { method: 'PUT', body: JSON.stringify(data) }),
        onSuccess: () => {
            qc.invalidateQueries({ queryKey: ['okr-settings'] });
            setOkrSaveState('saved');
            if (okrSaveTimerRef.current) window.clearTimeout(okrSaveTimerRef.current);
            okrSaveTimerRef.current = window.setTimeout(() => {
                setOkrSaveState('idle');
                okrSaveTimerRef.current = null;
            }, 1800);
        },
        onError: (error: any) => {
            setOkrSaveState('error');
            setOkrSaveError(error?.message || tt('common.saveFailed', 'Save failed, please retry'));
        },
    });

    useEffect(() => () => {
        if (okrSaveTimerRef.current) window.clearTimeout(okrSaveTimerRef.current);
    }, []);

    const saveOkrSettings = (nextSettings: any) => {
        if (okrSaveTimerRef.current) {
            window.clearTimeout(okrSaveTimerRef.current);
            okrSaveTimerRef.current = null;
        }
        setOkrSaveError('');
        setOkrSaveState('saving');
        updateSettings.mutate(nextSettings);
    };

    const runDailyCollectionTest = async () => {
        setDailyTestState('running');
        setDailyTestMessage('');
        try {
            const result = await fetchJson<any>('/okr/trigger-daily-collection', { method: 'POST' });
            setDailyTestState('success');
            setDailyTestMessage(
                result?.message || tt('enterprise.okr.dailyCollectionTriggered', 'Daily collection test triggered.')
            );
            qc.invalidateQueries({ queryKey: ['okr-members-without-okr-settings'] });
        } catch (error: any) {
            setDailyTestState('error');
            setDailyTestMessage(error?.message || tt('enterprise.okr.testCollectionFailed', 'Failed to trigger the test collection.'));
        }
    };

    // Fetch members-without-okr to get okr_agent_id and company_okr_exists for the guidance card
    const { data: membersData } = useQuery({
        queryKey: ['okr-members-without-okr-settings', tenantId],
        queryFn: () => fetchJson<any>('/okr/members-without-okr'),
        enabled: !!settings?.enabled,
        retry: false,
    });

    if (isLoading) return <div style={{ padding: '20px' }}>{t('common.loading', 'Loading...')}</div>;
    const s = settings || { enabled: false, first_enabled_at: null, daily_report_enabled: false, daily_report_time: '18:00', daily_report_skip_non_workdays: true, weekly_report_enabled: false, weekly_report_day: 0, period_frequency: 'quarterly', period_length_days: null, period_frequency_locked: false };
    const periodFrequencyLocked = !!s.period_frequency_locked || !!s.first_enabled_at;
    const effectiveTimezone = tenantInfo?.timezone || 'UTC';

    // Primary source: /settings now embeds okr_agent_id directly.
    // Fallback to members-without-okr response for backward compat.
    const okrAgentId: string | null = settings?.okr_agent_id ?? membersData?.okr_agent_id ?? null;
    const companyOkrExists = membersData?.company_okr_exists ?? false;

    return (
        <div style={{ maxWidth: '800px' }}>
            <div className="card" style={{ marginBottom: '24px' }}>
                {/* Toggle row */}
                <div style={{ padding: '20px', borderBottom: s.enabled ? '1px solid var(--border-subtle)' : 'none' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <div>
                            <div style={{ fontWeight: 600, fontSize: '15px', color: 'var(--text-primary)', marginBottom: '4px' }}>
                                {tt('enterprise.okr.okrSystem')}
                            </div>
                            <div style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>
                                {tt('enterprise.okr.okrSystemEnabled')}
                            </div>
                        </div>
                        {/* Wider toggle so the knob has comfortable room */}
                        <label style={{ position: 'relative', display: 'inline-block', width: '52px', height: '28px', flexShrink: 0 }}>
                            <input
                                type="checkbox"
                                checked={s.enabled}
                                onChange={(e) => saveOkrSettings({ ...s, enabled: e.target.checked })}
                                style={{ opacity: 0, width: 0, height: 0 }}
                            />
                            <span style={{
                                position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, borderRadius: '28px', cursor: 'pointer',
                                background: s.enabled ? 'var(--accent-primary)' : 'var(--border-subtle)', transition: '0.2s'
                            }}>
                                <span style={{
                                    position: 'absolute', left: s.enabled ? '26px' : '2px', top: '2px', width: '24px', height: '24px',
                                    borderRadius: '50%', background: '#fff', transition: '0.2s', boxShadow: '0 1px 3px rgba(0,0,0,0.15)'
                                }} />
                            </span>
                        </label>
                    </div>
                    {!s.enabled && !periodFrequencyLocked && (
                        <div style={{ marginTop: '20px' }}>
                            <div style={{ fontWeight: 500, marginBottom: '8px', fontSize: '13px' }}>
                                {tt('enterprise.okr.chooseCadenceFirst')}
                            </div>
                            <div style={{ marginBottom: '10px', fontSize: '12px', color: 'var(--text-tertiary)', lineHeight: 1.5, maxWidth: '560px' }}>
                                {tt('enterprise.okr.chooseCadenceDesc')}
                            </div>
                            <select
                                className="form-input"
                                value={s.period_frequency}
                                onChange={(e) => saveOkrSettings({ ...s, period_frequency: e.target.value })}
                                style={{ maxWidth: '300px', cursor: 'pointer' }}
                            >
                                <option value="quarterly">{tt('enterprise.okr.quarterly')}</option>
                                <option value="monthly">{tt('enterprise.okr.monthly')}</option>
                            </select>
                        </div>
                    )}
                </div>

                {okrSaveState !== 'idle' && (
                    <div
                        style={{
                            padding: '10px 20px 0',
                            fontSize: '12px',
                            color: okrSaveState === 'error'
                                ? 'var(--danger, #dc2626)'
                                : okrSaveState === 'saved'
                                    ? 'var(--success, #16a34a)'
                                    : 'var(--text-tertiary)',
                        }}
                    >
                        {okrSaveState === 'saving' && tt('enterprise.okr.savingOkrSettings')}
                        {okrSaveState === 'saved' && tt('enterprise.okr.settingsSaved')}
                        {okrSaveState === 'error' && okrSaveError}
                    </div>
                )}

                {s.enabled && (
                    <div style={{ padding: '20px' }}>
                        {/* Phase 1 Onboarding Guidance Card */}
                        <div style={{
                            marginBottom: '24px',
                            padding: '16px 20px',
                            borderRadius: '10px',
                            background: companyOkrExists ? 'rgba(34,197,94,0.06)' : 'rgba(99,102,241,0.06)',
                            border: `1px solid ${companyOkrExists ? 'rgba(34,197,94,0.2)' : 'rgba(99,102,241,0.2)'}`,
                        }}>
                            <div style={{ display: 'flex', alignItems: 'flex-start', gap: '16px' }}>
                                {/* Status icon */}
                                <div style={{
                                    width: 36, height: 36, borderRadius: '8px', flexShrink: 0,
                                    background: companyOkrExists ? 'rgba(34,197,94,0.15)' : 'rgba(99,102,241,0.12)',
                                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                                }}>
                                    {companyOkrExists ? (
                                        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#22c55e" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                                            <polyline points="20 6 9 17 4 12"/>
                                        </svg>
                                    ) : (
                                        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#6366f1" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                            <circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/>
                                        </svg>
                                    )}
                                </div>

                                <div style={{ flex: 1, minWidth: 0 }}>
                                    <div style={{
                                        fontWeight: 600, fontSize: '14px',
                                        color: companyOkrExists ? '#22c55e' : 'var(--text-primary)',
                                        marginBottom: '4px',
                                    }}>
                                        {companyOkrExists
                                            ? tt('enterprise.okr.companyOkrSet')
                                            : tt('enterprise.okr.step1SetCompanyOkr')
                                        }
                                    </div>
                                    <div style={{ fontSize: '12px', color: 'var(--text-secondary)', lineHeight: 1.6 }}>
                                        {companyOkrExists
                                            ? tt('enterprise.okr.companyObjectivesDesc')
                                            : tt('enterprise.okr.firstStepDesc')
                                        }
                                    </div>
                                </div>

                                {/* Action button — links to OKR Agent chat (agent detail page at /agents/{id}) */}
                                {okrAgentId ? (
                                    <a
                                        id="okr-chat-agent-btn"
                                        href={`/agents/${okrAgentId}#chat`}
                                        style={{
                                            display: 'inline-flex', alignItems: 'center', gap: '6px',
                                            padding: '7px 14px', borderRadius: '6px',
                                            background: companyOkrExists ? 'var(--bg-secondary)' : 'var(--accent-primary)',
                                            color: companyOkrExists ? 'var(--text-secondary)' : '#fff',
                                            border: companyOkrExists ? '1px solid var(--border-subtle)' : 'none',
                                            fontSize: '12px', fontWeight: 500, textDecoration: 'none',
                                            whiteSpace: 'nowrap', flexShrink: 0,
                                            transition: 'opacity 0.15s',
                                        }}
                                    >
                                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                            <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>
                                        </svg>
                                        {companyOkrExists
                                            ? tt('enterprise.okr.chatWithOkrAgent')
                                            : tt('enterprise.okr.openOkrAgentChat')
                                        }
                                    </a>
                                ) : (
                                    <span style={{ fontSize: '12px', color: 'var(--text-tertiary)', flexShrink: 0 }}>
                                        {tt('enterprise.okr.okrAgentNotFound')}
                                    </span>
                                )}
                            </div>
                        </div>

                        {/* Sync Relationship Network */}
                        <div style={{
                            marginBottom: '24px',
                            padding: '14px 18px',
                            borderRadius: '8px',
                            background: 'var(--bg-secondary)',
                            border: '1px solid var(--border-subtle)',
                            display: 'flex', alignItems: 'center', gap: '16px', flexWrap: 'wrap',
                        }}>
                            <div style={{ flex: 1, minWidth: 0 }}>
                                <div style={{ fontSize: '13px', fontWeight: 500, marginBottom: '2px' }}>
                                    {tt('enterprise.okr.syncRelationships')}
                                </div>
                                <div style={{ fontSize: '12px', color: 'var(--text-tertiary)' }}>
                                    {tt('enterprise.okr.syncRelationshipsDesc')}
                                </div>
                            </div>
                            <button
                                id="okr-sync-relationships-btn"
                                onClick={async () => {
                                    try {
                                        const token = localStorage.getItem('token');
                                        const res = await fetch('/api/okr/sync-relationships', {
                                            method: 'POST',
                                            headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
                                        });
                                        if (res.ok) {
                                            await dialog.alert(tt('enterprise.okr.syncComplete'), {
                                                type: 'success',
                                            });
                                            qc.invalidateQueries({ queryKey: ['okr-members-without-okr-settings'] });
                                        } else {
                                            const err = await res.json().catch(() => ({}));
                                            await dialog.alert(tt('enterprise.okr.relationshipSyncFailed'), {
                                                type: 'error',
                                                details: String(err.detail || res.status),
                                            });
                                        }
                                    } catch (e) {
                                        await dialog.alert(tt('enterprise.okr.syncFailedRetry'), {
                                            type: 'error',
                                            details: String((e as any)?.message || e),
                                        });
                                    }
                                }}
                                style={{
                                    padding: '6px 14px', borderRadius: '6px', fontSize: '12px', fontWeight: 500,
                                    background: 'var(--accent-primary)', color: '#fff', border: 'none', cursor: 'pointer',
                                    whiteSpace: 'nowrap', flexShrink: 0,
                                }}
                            >
                                {tt('enterprise.okr.syncNow')}
                            </button>
                        </div>

                        {/* Period preference */}
                        <div style={{ marginBottom: '24px' }}>
                            <div style={{ fontWeight: 500, marginBottom: '12px', fontSize: '13px' }}>
                                {tt('enterprise.okr.periodPreference')}
                            </div>
                            <select
                                className="form-input"
                                value={s.period_frequency}
                                disabled={periodFrequencyLocked}
                                title={periodFrequencyLocked
                                    ? tt('enterprise.okr.cadenceLocked')
                                    : undefined}
                                onChange={(e) => saveOkrSettings({ ...s, period_frequency: e.target.value })}
                                style={{
                                    maxWidth: '300px',
                                    opacity: periodFrequencyLocked ? 0.65 : 1,
                                    cursor: periodFrequencyLocked ? 'not-allowed' : 'pointer',
                                }}
                            >
                                <option value="quarterly">{tt('enterprise.okr.quarterly')}</option>
                                <option value="monthly">{tt('enterprise.okr.monthly')}</option>
                            </select>
                            {periodFrequencyLocked && (
                                <div style={{ marginTop: '8px', fontSize: '12px', color: 'var(--text-tertiary)', lineHeight: 1.5 }}>
                                    {tt('enterprise.okr.cadenceLockedDesc')}
                                </div>
                            )}
                        </div>

                        {/* Daily report */}
                        <div style={{ marginBottom: '24px' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '12px' }}>
                                <input
                                    type="checkbox"
                                    checked={s.daily_report_enabled}
                                    onChange={(e) => saveOkrSettings({ ...s, daily_report_enabled: e.target.checked })}
                                />
                                <div>
                                    <div style={{ fontWeight: 500, fontSize: '13px' }}>
                                        {tt('enterprise.okr.enableMemberDaily')}
                                    </div>
                                    <div style={{ fontSize: '12px', color: 'var(--text-tertiary)' }}>
                                        {tt('enterprise.okr.enableMemberDailyDesc')}
                                    </div>
                                </div>
                            </div>
                            {s.daily_report_enabled && (
                                <div style={{ marginLeft: '28px', display: 'flex', flexDirection: 'column', alignItems: 'flex-start', gap: '12px' }}>
                                    <label style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '12px', color: 'var(--text-secondary)' }}>
                                        <input
                                            type="checkbox"
                                            checked={s.daily_report_skip_non_workdays ?? true}
                                            onChange={(e) => saveOkrSettings({ ...s, daily_report_skip_non_workdays: e.target.checked })}
                                        />
                                        {tt('enterprise.okr.skipNonWorkdays')}
                                    </label>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                                    <div style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>
                                        {tt('enterprise.okr.collectionTime')}
                                    </div>
                                    <input
                                        type="time"
                                        className="form-input"
                                        value={s.daily_report_time}
                                        onChange={(e) => saveOkrSettings({ ...s, daily_report_time: e.target.value })}
                                        style={{ width: '120px' }}
                                    />
                                    <button
                                        type="button"
                                        className="btn btn-secondary"
                                        onClick={runDailyCollectionTest}
                                        disabled={dailyTestState === 'running'}
                                        style={{ padding: '6px 12px', fontSize: '12px' }}
                                    >
                                        {dailyTestState === 'running'
                                            ? tt('enterprise.okr.testing')
                                            : tt('enterprise.okr.testCollectionNow')}
                                    </button>
                                    </div>
                                    <div style={{ fontSize: '12px', color: 'var(--text-secondary)', lineHeight: 1.6, maxWidth: '560px' }}>
                                        {tt('enterprise.okr.timezoneDesc', { timezone: effectiveTimezone })}
                                    </div>
                                        {effectiveTimezone === 'UTC' && (
                                            <div style={{ fontSize: '12px', color: 'var(--warning, #d97706)', lineHeight: 1.6, maxWidth: '560px' }}>
                                                {tt('enterprise.okr.timezoneWarning')}
                                            </div>
                                        )}
                                    {dailyTestState !== 'idle' && (
                                        <div
                                            style={{
                                                fontSize: '12px',
                                                color: dailyTestState === 'error'
                                                    ? 'var(--danger, #dc2626)'
                                                    : dailyTestState === 'success'
                                                        ? 'var(--success, #16a34a)'
                                                        : 'var(--text-tertiary)',
                                                lineHeight: 1.6,
                                                maxWidth: '560px',
                                            }}
                                        >
                                            {dailyTestMessage || (dailyTestState === 'running'
                                                ? tt('enterprise.okr.triggeringTest')
                                                : '')}
                                        </div>
                                    )}
                                    <div style={{ fontSize: '12px', color: 'var(--text-tertiary)', lineHeight: 1.6, maxWidth: '560px' }}>
                                        {tt('enterprise.okr.scheduleDesc')}
                                    </div>
                                </div>
                            )}
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
}
