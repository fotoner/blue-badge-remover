export { recordHide, recordShow, flushStats, startStatsFlush, stopStatsFlush, setOnFlush } from './stats-collector';
export { getTodayStats, getStatsRange, getAllTimeTotal, incrementTotal, resetAllStats, cleanupOldStats } from './stats-storage';
export type { DailyStats, MilestoneState } from './types';
