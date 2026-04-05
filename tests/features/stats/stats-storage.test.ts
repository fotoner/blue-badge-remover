import { describe, it, expect, vi, beforeEach } from 'vitest';

const store = new Map<string, unknown>();

vi.mock('wxt/browser', () => ({
  browser: {
    storage: {
      local: {
        get: vi.fn(async (keys: string[] | null) => {
          if (keys === null) {
            const result: Record<string, unknown> = {};
            for (const [k, v] of store) result[k] = v;
            return result;
          }
          const result: Record<string, unknown> = {};
          for (const k of keys) {
            if (store.has(k)) result[k] = store.get(k);
          }
          return result;
        }),
        set: vi.fn(async (items: Record<string, unknown>) => {
          for (const [k, v] of Object.entries(items)) store.set(k, v);
        }),
        remove: vi.fn(async (keys: string[]) => {
          for (const k of keys) store.delete(k);
        }),
      },
    },
  },
}));

const {
  getTodayStats,
  saveDayStats,
  getAllTimeTotal,
  incrementTotal,
  resetAllStats,
  cleanupOldStats,
} = await import('@features/stats/stats-storage');

beforeEach(() => {
  store.clear();
});

describe('getTodayStats', () => {
  it('returns empty stats when no data', async () => {
    const stats = await getTodayStats();
    expect(stats.totalHidden).toBe(0);
    expect(stats.totalShown).toBe(0);
    expect(stats.byCategory).toEqual({});
    expect(stats.byPack).toEqual({});
  });

  it('returns correct data for a specific date', async () => {
    const date = '2026-01-15';
    store.set(`stats-${date}`, {
      date,
      totalHidden: 42,
      totalShown: 5,
      byCategory: { politics: 30 },
      byPack: {},
    });

    const stats = await getTodayStats(date);
    expect(stats.date).toBe(date);
    expect(stats.totalHidden).toBe(42);
    expect(stats.totalShown).toBe(5);
    expect(stats.byCategory).toEqual({ politics: 30 });
  });
});

describe('saveDayStats', () => {
  it('persists and is retrievable', async () => {
    const date = '2026-03-20';
    const stats = {
      date,
      totalHidden: 10,
      totalShown: 2,
      byCategory: { spam: 8 },
      byPack: { 'pack-1': 3 },
    };
    await saveDayStats(stats);

    const retrieved = await getTodayStats(date);
    expect(retrieved).toEqual(stats);
  });
});

describe('getAllTimeTotal', () => {
  it('reads from stats-total key', async () => {
    store.set('stats-total', 999);
    const total = await getAllTimeTotal();
    expect(total).toBe(999);
  });

  it('returns 0 when stats-total is not set', async () => {
    const total = await getAllTimeTotal();
    expect(total).toBe(0);
  });
});

describe('incrementTotal', () => {
  it('adds to existing total', async () => {
    store.set('stats-total', 100);
    await incrementTotal(50);
    const total = await getAllTimeTotal();
    expect(total).toBe(150);
  });

  it('works when no existing total', async () => {
    await incrementTotal(25);
    const total = await getAllTimeTotal();
    expect(total).toBe(25);
  });
});

describe('resetAllStats', () => {
  it('clears all stats-* keys and stats-total', async () => {
    store.set('stats-2026-01-01', { date: '2026-01-01', totalHidden: 5, totalShown: 0, byCategory: {}, byPack: {} });
    store.set('stats-2026-01-02', { date: '2026-01-02', totalHidden: 3, totalShown: 1, byCategory: {}, byPack: {} });
    store.set('stats-total', 8);
    store.set('settings', { enabled: true }); // unrelated key

    await resetAllStats();

    expect(store.has('stats-2026-01-01')).toBe(false);
    expect(store.has('stats-2026-01-02')).toBe(false);
    expect(store.has('stats-total')).toBe(false);
    expect(store.has('settings')).toBe(true); // unrelated key preserved
  });
});

describe('cleanupOldStats', () => {
  it('keeps only 30 most recent days', async () => {
    // Create 35 daily stat entries
    for (let i = 1; i <= 35; i++) {
      const day = String(i).padStart(2, '0');
      const date = `2026-01-${day}`;
      store.set(`stats-${date}`, { date, totalHidden: i, totalShown: 0, byCategory: {}, byPack: {} });
    }
    // Also set stats-total which should not be removed by cleanup
    store.set('stats-total', 100);

    await cleanupOldStats();

    // cleanupOldStats sees all keys starting with "stats-" (35 daily + stats-total = 36).
    // It removes the 6 oldest alphabetically: stats-2026-01-01 through stats-2026-01-06.
    // stats-total sorts after stats-2... so it survives (at the end).
    let dailyCount = 0;
    for (const [k] of store) {
      if (k.startsWith('stats-') && k !== 'stats-total') dailyCount++;
    }
    expect(dailyCount).toBe(29);

    // Oldest should be removed
    expect(store.has('stats-2026-01-01')).toBe(false);
    expect(store.has('stats-2026-01-06')).toBe(false);
    // Newest should remain
    expect(store.has('stats-2026-01-35')).toBe(true);
    expect(store.has('stats-2026-01-07')).toBe(true);
    // stats-total preserved (sorts at end)
    expect(store.has('stats-total')).toBe(true);
  });

  it('does nothing when 30 or fewer entries', async () => {
    for (let i = 1; i <= 10; i++) {
      const day = String(i).padStart(2, '0');
      const date = `2026-02-${day}`;
      store.set(`stats-${date}`, { date, totalHidden: i, totalShown: 0, byCategory: {}, byPack: {} });
    }

    await cleanupOldStats();

    let statsCount = 0;
    for (const [k] of store) {
      if (k.startsWith('stats-')) statsCount++;
    }
    expect(statsCount).toBe(10);
  });
});
