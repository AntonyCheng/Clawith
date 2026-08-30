/**
 * Dashboard 业务常量配置
 *
 * 用户在 v2 模型中确认的所有数值都集中在这里。
 * 未来业务方需要调整时，改这一个文件即可。
 *
 * 配套文档：DATA.md §8.5
 */

export const ACTIVITY_CONSTANTS = {
  /** 单次活动（assistant/tool_call）估时，单位：秒 */
  SECONDS_PER_ACTIVITY: 5,

  /** 标准工作日时长，单位：小时 */
  STANDARD_WORK_HOURS_PER_DAY: 8,

  /** 月工作日数（中国标准） */
  WORKING_DAYS_PER_MONTH: 22,

  /** 人日单价，单位：元 */
  DAILY_RATE_CNY: 1000,

  /** token 单位换算：100 万 = 1e6 */
  TOKENS_PER_MILLION: 1_000_000,

  /** LLM 粗单价，单位：元/百万 token（不区分模型） */
  PRICE_CNY_PER_MILLION: 5,
} as const;

/**
 * 活动角色集合
 *
 * ChatMessage.role 在这些值范围内的视为"活动"。
 *  - assistant: LLM 产生回复
 *  - tool_call:  调用工具/技能
 *
 * 不计：
 *  - user:     用户提问（不算 agent 工作）
 *  - system:   系统提示
 */
export const ACTIVITY_ROLES: ReadonlySet<string> = new Set([
  'assistant',
  'tool_call',
]);

/** React Query 缓存时间：5 分钟内不重复拉取活动数据 */
export const ANALYTICS_STALE_TIME_MS = 5 * 60 * 1000;

/** 拉取单 agent 全部 conversations × messages 的并发上限，避免打爆后端 */
export const ANALYTICS_CONCURRENCY_LIMIT = 10;