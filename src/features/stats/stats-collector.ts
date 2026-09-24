// src/features/stats/stats-collector.ts
// 메모리 버퍼 + 주기적 flush 패턴 (collector-buffer와 동일).
import type { DailyStats } from './types';
import { getTodayStats, saveDayStats, getAllTimeTotal, incrementTotal } from './stats-storage';
import { logger } from '@shared/utils/logger';

// 마일스톤 콜백 — content script에서 설정
let onFlushCallback: ((totalHidden: number) => void) | null = null;
export function setOnFlush(cb: (totalHidden: number) => void): void { onFlushCallback = cb; }

const FLUSH_INTERVAL_MS = 5000;
const COUNTED_ATTR = 'data-bbr-counted';
const MAX_COUNTED_STATUS_PATHS = 5000;

// 메모리 버퍼 — flush 시 storage에 병합
let buffer: DailyStats = emptyBuffer();
let flushTimerId: ReturnType<typeof setInterval> | null = null;
const countedStatusPaths = new Set<string>();

function localDateStr(): string {
  const d = new Date();
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
}

function emptyBuffer(): DailyStats {
  return { date: localDateStr(), totalHidden: 0, totalShown: 0, byCategory: {}, byPack: {} };
}

/** 트윗 숨김 시 호출. statusPath 우선, 없으면 DOM 속성으로 중복 방지. */
export function recordHide(
  tweetEl: HTMLElement,
  category?: string,
  packId?: string,
  statusPath?: string | null,
): void {
  if (statusPath) {
    if (countedStatusPaths.has(statusPath)) return;
    rememberStatusPath(statusPath);
  } else if (tweetEl.hasAttribute(COUNTED_ATTR)) {
    return;
  }
  tweetEl.setAttribute(COUNTED_ATTR, '1');

  buffer.totalHidden++;
  if (category) {
    buffer.byCategory[category] = (buffer.byCategory[category] ?? 0) + 1;
  }
  if (packId) {
    buffer.byPack[packId] = (buffer.byPack[packId] ?? 0) + 1;
  }
}

function rememberStatusPath(statusPath: string): void {
  if (countedStatusPaths.size >= MAX_COUNTED_STATUS_PATHS) {
    const oldest = countedStatusPaths.values().next().value;
    if (oldest !== undefined) countedStatusPaths.delete(oldest);
  }
  countedStatusPaths.add(statusPath);
}

/** 트윗 표시(예외 처리) 시 호출 */
export function recordShow(): void {
  buffer.totalShown++;
}

function addCounts(target: Record<string, number>, source: Record<string, number>): void {
  for (const [key, count] of Object.entries(source)) {
    target[key] = (target[key] ?? 0) + count;
  }
}

function mergeInto(target: DailyStats, source: DailyStats): void {
  target.totalHidden += source.totalHidden;
  target.totalShown += source.totalShown;
  addCounts(target.byCategory, source.byCategory);
  addCounts(target.byPack, source.byPack);
}

// flush 직렬화 — 타이머/네비게이션/visibilitychange가 동시에 flush해도 storage 쓰기가 겹치지 않게 한다
let flushChain: Promise<void> = Promise.resolve();

/** 메모리 버퍼를 storage에 병합 */
export function flushStats(): Promise<void> {
  const run = flushChain.then(flushPending);
  flushChain = run.catch(() => {});
  return run;
}

async function flushPending(): Promise<void> {
  if (buffer.totalHidden === 0 && buffer.totalShown === 0) return;
  // 시작 시점에 버퍼를 넘겨받는다 — 이후 storage 왕복 중 기록은 새 버퍼에 쌓여 유실되지 않는다
  const pending = buffer;
  buffer = emptyBuffer();
  try {
    // pending.date 기준으로 저장 — 자정 경계에서도 올바른 날짜에 귀속
    const today = await getTodayStats(pending.date);
    mergeInto(today, pending);
    await saveDayStats(today);
  } catch (error) {
    // 일별 저장 실패 시 다음 flush에서 재시도하도록 버퍼로 되돌린다 (날짜는 기록 시점 유지)
    mergeInto(pending, buffer);
    buffer = pending;
    logger.warn('Stats flush failed', { error: String(error) });
    return;
  }
  // 일별 저장 이후 실패는 되돌리지 않는다 — 재시도하면 일별 통계가 이중 집계된다
  if (pending.totalHidden > 0) {
    await incrementTotal(pending.totalHidden).catch((error: unknown) => {
      logger.warn('Stats total increment failed', { error: String(error) });
    });
  }
  if (onFlushCallback) {
    const allTime = await getAllTimeTotal();
    onFlushCallback(allTime);
  }
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
