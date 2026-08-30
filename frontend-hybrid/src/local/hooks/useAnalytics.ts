/**
 * Dashboard 分析数据 React Query hooks
 *
 * 把 services/analytics 的纯函数包成带缓存的 query。
 * 5 分钟内不会重复拉数据，避免频繁切 Tab 时反复请求后端。
 */

import { useQuery } from '@tanstack/react-query';
import { ANALYTICS_STALE_TIME_MS } from '../config/analytics';
import { loadAnalytics, loadTokenTrend } from '../services/analytics';
import type { CostOverview, EmployeeOverview, TokenTrend, ValueOverview } from '../types/analytics';

interface AnalyticsResult {
    employee: EmployeeOverview;
    cost: CostOverview;
    value: ValueOverview;
}

/**
 * 一次性拿到三 Tab 的全部数据。
 * 大多数场景三 Tab 共用底层数据，避免 N+1 重复拉。
 */
export function useAnalytics(tenantId: string | undefined) {
    return useQuery<AnalyticsResult>({
        queryKey: ['analytics', tenantId],
        queryFn: () => loadAnalytics(tenantId ?? ''),
        staleTime: ANALYTICS_STALE_TIME_MS,
        gcTime: ANALYTICS_STALE_TIME_MS * 2,
        enabled: !!tenantId,
        refetchOnWindowFocus: false,
    });
}

/**
 * 仅 Tab 1 用的便捷 hook（语义化封装）
 */
export function useEmployeeOverview(tenantId: string | undefined) {
    const q = useAnalytics(tenantId);
    return { ...q, data: q.data?.employee };
}

/**
 * 仅 Tab 2 用的便捷 hook
 */
export function useCostOverview(tenantId: string | undefined) {
    const q = useAnalytics(tenantId);
    return { ...q, data: q.data?.cost };
}

/**
 * 仅 Tab 3 用的便捷 hook
 */
export function useValueOverview(tenantId: string | undefined) {
    const q = useAnalytics(tenantId);
    return { ...q, data: q.data?.value };
}

/**
 * Token 时序趋势（后端 /dashboard/token-trend）。
 * 独立 query，与三 Tab 聚合数据分开缓存。
 */
export function useTokenTrend(tenantId: string | undefined, days = 30) {
    return useQuery<TokenTrend>({
        queryKey: ['token-trend', tenantId, days],
        queryFn: () => loadTokenTrend(days),
        staleTime: ANALYTICS_STALE_TIME_MS,
        gcTime: ANALYTICS_STALE_TIME_MS * 2,
        enabled: !!tenantId,
        refetchOnWindowFocus: false,
    });
}