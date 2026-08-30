import { useState, useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useNavigate, useOutletContext } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { agentApi } from '../../services/api';
import { useAnalytics } from '../hooks/useAnalytics';
import { EmployeeOverview } from '../components/dashboard/EmployeeOverview';
import { CostOverview } from '../components/dashboard/CostOverview';
import { ValueContribution } from '../components/dashboard/ValueContribution';
import { TokenTrend } from '../components/dashboard/TokenTrend';
import type { Agent } from '../../types';

type LayoutOutletContext = {
    openTalentMarket?: () => void;
};

/* ────── Tab bar icons ────── */

const TabIcons = {
    employees: (
        <svg width="18" height="18" viewBox="0 0 18 18" fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round">
            <circle cx="7" cy="6" r="2.5" />
            <path d="M2 16v-1a4 4 0 018 0v1" />
            <circle cx="12.5" cy="6" r="2" />
            <path d="M16 16v-.5a3.5 3.5 0 00-3.5-3.5" />
        </svg>
    ),
    cost: (
        <svg width="18" height="18" viewBox="0 0 18 18" fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round">
            <path d="M9 2l2 4 4 .5-3 3 1 4.5-4-2-4 2 1-4.5-3-3 4-.5z" />
        </svg>
    ),
    value: (
        <svg width="18" height="18" viewBox="0 0 18 18" fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round">
            <circle cx="9" cy="9" r="7" />
            <path d="M9 5v8M11 7H7.5a1.5 1.5 0 000 3h3a1.5 1.5 0 010 3H6" />
        </svg>
    ),
};

/* ────── Inline SVG Icons (monochrome) ────── */

const Icons = {
    users: (
        <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="6" cy="5" r="2.5" />
            <path d="M1.5 14v-1a3.5 3.5 0 017 0v1" />
            <circle cx="11.5" cy="5.5" r="2" />
            <path d="M14.5 14v-.5a3 3 0 00-3-3" />
        </svg>
    ),
    tasks: (
        <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
            <rect x="2" y="2" width="12" height="12" rx="2" />
            <path d="M5.5 8l2 2 3.5-3.5" />
        </svg>
    ),
    zap: (
        <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
            <path d="M8.5 1.5L3 9h4.5l-.5 5.5L13 7H8.5l.5-5.5z" />
        </svg>
    ),
    clock: (
        <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="8" cy="8" r="6" />
            <path d="M8 4.5V8l2.5 1.5" />
        </svg>
    ),
    activity: (
        <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
            <path d="M1 8h3l2-5 3 10 2-5h4" />
        </svg>
    ),
    plus: (
        <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
            <path d="M8 3v10M3 8h10" />
        </svg>
    ),
    bot: (
        <svg width="18" height="18" viewBox="0 0 18 18" fill="none" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round">
            <rect x="3" y="5" width="12" height="10" rx="2" />
            <circle cx="7" cy="10" r="1" fill="currentColor" stroke="none" />
            <circle cx="11" cy="10" r="1" fill="currentColor" stroke="none" />
            <path d="M9 2v3M6 2h6" />
        </svg>
    ),
};

/* ────── Main Dashboard ────── */

export default function Dashboard() {
    const { t } = useTranslation();
    const navigate = useNavigate();
    const outletContext = useOutletContext<LayoutOutletContext | null>();
    const openTalentMarket = outletContext?.openTalentMarket;
    const currentTenant = localStorage.getItem('current_tenant_id') || '';

    const { data: agents = [], isLoading } = useQuery({
        queryKey: ['agents', currentTenant],
        queryFn: () => agentApi.list(currentTenant || undefined),
        refetchInterval: 15000,
    });

    /* ── 三 Tab 聚合数据 ── */
    const analytics = useAnalytics(currentTenant);

    /* ── Tab 状态（持久化到 sessionStorage，刷新不丢） ── */
    const [activeTab, setActiveTab] = useState<'employees' | 'cost' | 'value'>(() => {
        const saved = sessionStorage.getItem('dashboard.activeTab');
        if (saved === 'employees' || saved === 'cost' || saved === 'value') return saved;
        return 'employees';
    });
    useEffect(() => {
        sessionStorage.setItem('dashboard.activeTab', activeTab);
    }, [activeTab]);

    return (
        <div>
            {/* ─── Header Banner ─── */}
            {isLoading ? (
                <div style={{ textAlign: 'center', padding: '60px', color: 'var(--text-tertiary)', fontSize: '13px' }}>
                    {t('common.loading')}
                </div>
            ) : agents.length === 0 ? (
                <div style={{ textAlign: 'center', padding: '80px' }}>
                    <div style={{ color: 'var(--text-tertiary)', marginBottom: '4px', fontSize: '32px' }}>
                        {Icons.bot}
                    </div>
                    <div style={{ color: 'var(--text-secondary)', marginBottom: '16px', fontSize: '14px' }}>
                        {t('dashboard.noAgents')}
                    </div>
                    <button
                        className="btn btn-primary"
                        onClick={() => {
                            if (openTalentMarket) {
                                openTalentMarket();
                                return;
                            }
                            navigate('/agents/new');
                        }}
                    >
                        {Icons.plus} {t('nav.newAgent')}
                    </button>
                </div>
            ) : (
                <>
                    {/* Tab 切换器 */}
                    <div className="dashboard-tabs">
                        <button
                            className={`dashboard-tab ${activeTab === 'employees' ? 'active' : ''}`}
                            onClick={() => setActiveTab('employees')}
                        >
                            <span className="dashboard-tab-icon">{TabIcons.employees}</span>
                            {t('dashboard.tabs.employees')}
                        </button>
                        <button
                            className={`dashboard-tab ${activeTab === 'cost' ? 'active' : ''}`}
                            onClick={() => setActiveTab('cost')}
                        >
                            <span className="dashboard-tab-icon">{TabIcons.cost}</span>
                            {t('dashboard.tabs.cost')}
                        </button>
                        <button
                            className={`dashboard-tab ${activeTab === 'value' ? 'active' : ''}`}
                            onClick={() => setActiveTab('value')}
                        >
                            <span className="dashboard-tab-icon">{TabIcons.value}</span>
                            {t('dashboard.tabs.value')}
                        </button>
                    </div>

                    {/* Tab 内容区 */}
                    {activeTab === 'employees' && (
                        <EmployeeOverview
                            data={analytics.data?.employee}
                            isLoading={analytics.isLoading}
                            isError={analytics.isError}
                        />
                    )}
                    {activeTab === 'cost' && (
                        <>
                            <CostOverview
                                data={analytics.data?.cost}
                                isLoading={analytics.isLoading}
                                isError={analytics.isError}
                            />
                            <div style={{ marginTop: '24px' }}>
                                <TokenTrend tenantId={currentTenant} />
                            </div>
                        </>
                    )}
                    {activeTab === 'value' && (
                        <ValueContribution
                            data={analytics.data?.value}
                            isLoading={analytics.isLoading}
                            isError={analytics.isError}
                        />
                    )}
                </>
            )}
        </div>
    );
}
