/**
 * 花名册（数字员工本地壳层页面）
 * 平铺展示平台数字员工，紧凑卡（RosterAgentCard），按价值贡献（活动数×Token，同仪表盘口径）降序排列，
 * 右上角「进入对话」一键直达对话页。数据全部来自现成接口。
 */
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { IconSearch } from '@tabler/icons-react';
import { agentApi, dashboardApi, enterpriseApi } from '../../services/api';
import { valueScore } from '../services/analytics';
import RosterAgentCard from '../components/RosterAgentCard';

export default function Roster() {
    const { t } = useTranslation();
    const navigate = useNavigate();
    const [search, setSearch] = useState('');

    const { data: agents = [], isLoading } = useQuery({
        queryKey: ['agents'],
        queryFn: () => agentApi.list(),
    });
    // 模型列表：全页共享 1 次（卡片脚注的模型名）
    const { data: models = [] } = useQuery({
        queryKey: ['llm-models'],
        queryFn: () => enterpriseApi.llmModels(),
        staleTime: 60_000,
    });
    // 员工概览数据（1 次共享请求）：取活动数×Token 算价值贡献用于排序。
    // 两个请求都就绪才渲染列表，否则先出无序再跳排序会闪（overview 出错时放行，按 0 分兜底）。
    const { data: overview, isLoading: overviewLoading } = useQuery({
        queryKey: ['dashboard-overview'],
        queryFn: () => dashboardApi.overview(),
        staleTime: 60_000,
    });
    const scoreById = new Map<string, number>();
    for (const row of (overview as any)?.agents ?? []) {
        scoreById.set(String(row.id), valueScore(row.total || 0, row.tokens_used_total || 0));
    }
    const pageLoading = isLoading || overviewLoading;

    const kw = search.trim().toLowerCase();
    const filtered = (kw
        ? agents.filter(a =>
            a.name.toLowerCase().includes(kw)
            || (a.role_description || '').toLowerCase().includes(kw))
        : [...agents]
    ).sort((a, b) => (scoreById.get(b.id) ?? 0) - (scoreById.get(a.id) ?? 0));

    return (
        <div style={{ padding: '4px 2px 24px' }}>
            {/* 头部：标题 + 总数 + 搜索 */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '14px', marginBottom: '18px', flexWrap: 'wrap', maxWidth: '1280px', margin: '0 auto 18px' }}>
                <h2 style={{ margin: 0, fontSize: '20px', fontWeight: 700, color: 'var(--text-primary)' }}>
                    {t('roster.title', '花名册')}
                </h2>
                <span style={{ fontSize: '13px', color: 'var(--text-tertiary)' }}>
                    {t('roster.total', { count: agents.length })} · {t('roster.sortByValue', '按价值贡献排序')}
                </span>
                <div style={{ marginLeft: 'auto', position: 'relative' }}>
                    <IconSearch size={14} stroke={2} style={{ position: 'absolute', left: '10px', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-tertiary)' }} />
                    <input
                        className="input"
                        value={search}
                        onChange={e => setSearch(e.target.value)}
                        placeholder={t('roster.search', '搜索姓名或职责…')}
                        style={{ paddingLeft: '30px', width: '220px', height: '34px', fontSize: '13px' }}
                    />
                </div>
            </div>

            {/* 档案卡纵向列表 */}
            {pageLoading ? (
                <div style={{ color: 'var(--text-tertiary)', fontSize: '13px', padding: '40px 0', textAlign: 'center' }}>
                    {t('roster.loading', '正在加载花名册…')}
                </div>
            ) : filtered.length === 0 ? (
                <div style={{ color: 'var(--text-tertiary)', fontSize: '13px', padding: '40px 0', textAlign: 'center' }}>
                    {agents.length === 0 ? t('roster.empty', '暂无数字员工') : t('roster.noMatch', '没有匹配的数字员工')}
                </div>
            ) : (
                <div style={{ maxWidth: '1280px', margin: '0 auto', display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(380px, 1fr))', gap: '14px' }}>
                    {filtered.map(a => (
                        <RosterAgentCard
                            key={a.id}
                            agent={a}
                            models={models as any[]}
                            onEnterChat={() => navigate(`/agents/${a.id}/chat`)}
                        />
                    ))}
                </div>
            )}
        </div>
    );
}
