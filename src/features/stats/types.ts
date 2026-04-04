// src/features/stats/types.ts
export interface DailyStats {
  date: string;
  totalHidden: number;
  totalShown: number;
  byCategory: Record<string, number>;
  byPack: Record<string, number>;
}

export interface MilestoneState {
  lastCelebrated: number;
}
