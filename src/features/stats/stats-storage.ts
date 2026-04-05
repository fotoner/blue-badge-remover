// src/features/stats/stats-storage.ts
// 일별 통계 저장/조회/정리 — chrome.storage.local 기반.
import { browser } from 'wxt/browser';
import type { DailyStats } from './types';

const KEY_PREFIX = 'stats-';
const MAX_DAYS = 30;

function todayKey(): string {
  return KEY_PREFIX + new Date().toISOString().slice(0, 10);
}

function emptyStats(date: string): DailyStats {
  return { date, totalHidden: 0, totalShown: 0, byCategory: {}, byPack: {} };
}

export async function getTodayStats(): Promise<DailyStats> {
  const key = todayKey();
  const result = await browser.storage.local.get([key]);
  return (result[key] as DailyStats | undefined) ?? emptyStats(key.slice(KEY_PREFIX.length));
}

export async function saveDayStats(stats: DailyStats): Promise<void> {
  const key = KEY_PREFIX + stats.date;
  try {
    await browser.storage.local.set({ [key]: stats });
  } catch {
    // storage quota exceeded — 조용히 실패
  }
}

export async function getStatsRange(days: number): Promise<DailyStats[]> {
  const keys: string[] = [];
  const now = new Date();
  for (let i = 0; i < days; i++) {
    const d = new Date(now);
    d.setDate(d.getDate() - i);
    keys.push(KEY_PREFIX + d.toISOString().slice(0, 10));
  }
  const result = await browser.storage.local.get(keys);
  return keys.map((k) => (result[k] as DailyStats | undefined) ?? emptyStats(k.slice(KEY_PREFIX.length)));
}

export async function getAllTimeTotal(): Promise<number> {
  const all = await browser.storage.local.get(null);
  let total = 0;
  for (const [key, value] of Object.entries(all)) {
    if (key.startsWith(KEY_PREFIX) && value && typeof value === 'object') {
      total += (value as DailyStats).totalHidden ?? 0;
    }
  }
  return total;
}

export async function resetAllStats(): Promise<void> {
  const all = await browser.storage.local.get(null);
  const statsKeys = Object.keys(all).filter((k) => k.startsWith(KEY_PREFIX));
  if (statsKeys.length > 0) {
    await browser.storage.local.remove(statsKeys);
  }
}

export async function cleanupOldStats(): Promise<void> {
  const all = await browser.storage.local.get(null);
  const statsKeys = Object.keys(all).filter((k) => k.startsWith(KEY_PREFIX));
  if (statsKeys.length <= MAX_DAYS) return;

  const sorted = statsKeys.sort();
  const toRemove = sorted.slice(0, sorted.length - MAX_DAYS);
  if (toRemove.length > 0) {
    await browser.storage.local.remove(toRemove);
  }
}
