// src/features/stats/stats-collector.ts
// 메모리 버퍼 + 주기적 flush 패턴 (collector-buffer와 동일).
import type { DailyStats } from './types';
import { getTodayStats, saveDayStats } from './stats-storage';

// 마일스톤 콜백 — content script에서 설정
let onFlushCallback: ((totalHidden: number) => void) | null = null;
export function setOnFlush(cb: (totalHidden: number) => void): void { onFlushCallback = cb; }

const FLUSH_INTERVAL_MS = 5000;
const COUNTED_ATTR = 'data-bbr-counted';

// 메모리 버퍼 — flush 시 storage에 병합
let buffer: DailyStats = emptyBuffer();
let flushTimerId: ReturnType<typeof setInterval> | null = null;

function emptyBuffer(): DailyStats {
  return { date: new Date().toISOString().slice(0, 10), totalHidden: 0, totalShown: 0, byCategory: {}, byPack: {} };
}

/** 트윗 숨김 시 호출. tweetEl로 중복 방지. */
export function recordHide(tweetEl: HTMLElement, category?: string, packId?: string): void {
  if (tweetEl.hasAttribute(COUNTED_ATTR)) return;
  tweetEl.setAttribute(COUNTED_ATTR, '1');

  buffer.totalHidden++;
  if (category) {
    buffer.byCategory[category] = (buffer.byCategory[category] ?? 0) + 1;
  }
  if (packId) {
    buffer.byPack[packId] = (buffer.byPack[packId] ?? 0) + 1;
  }
}

/** 트윗 표시(예외 처리) 시 호출 */
export function recordShow(): void {
  buffer.totalShown++;
}

/** 메모리 버퍼를 storage에 병합 */
export async function flushStats(): Promise<void> {
  if (buffer.totalHidden === 0 && buffer.totalShown === 0) return;

  const today = await getTodayStats();
  today.totalHidden += buffer.totalHidden;
  today.totalShown += buffer.totalShown;
  for (const [cat, count] of Object.entries(buffer.byCategory)) {
    today.byCategory[cat] = (today.byCategory[cat] ?? 0) + count;
  }
  for (const [pack, count] of Object.entries(buffer.byPack)) {
    today.byPack[pack] = (today.byPack[pack] ?? 0) + count;
  }
  await saveDayStats(today);
  buffer = emptyBuffer();
  if (onFlushCallback) onFlushCallback(today.totalHidden);
}

/** 5초 간격 flush 시작 */
export function startStatsFlush(): void {
  if (flushTimerId !== null) return;
  flushTimerId = setInterval(() => { void flushStats(); }, FLUSH_INTERVAL_MS);
}

/** flush 중지 (탭 언로드 시) */
export function stopStatsFlush(): void {
  if (flushTimerId !== null) {
    clearInterval(flushTimerId);
    flushTimerId = null;
  }
  void flushStats();
}
