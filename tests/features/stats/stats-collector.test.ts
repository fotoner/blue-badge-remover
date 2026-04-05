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

// Mock stats-storage to spy on calls
const mockGetTodayStats = vi.fn();
const mockSaveDayStats = vi.fn();
const mockGetAllTimeTotal = vi.fn();
const mockIncrementTotal = vi.fn();

vi.mock('@features/stats/stats-storage', () => ({
  getTodayStats: (...args: unknown[]) => mockGetTodayStats(...args),
  saveDayStats: (...args: unknown[]) => mockSaveDayStats(...args),
  getAllTimeTotal: (...args: unknown[]) => mockGetAllTimeTotal(...args),
  incrementTotal: (...args: unknown[]) => mockIncrementTotal(...args),
}));

const { recordHide, flushStats, setOnFlush } = await import('@features/stats/stats-collector');

function makeElement(): HTMLElement {
  const el = document.createElement('div');
  return el;
}

beforeEach(() => {
  store.clear();
  vi.clearAllMocks();
  mockGetTodayStats.mockResolvedValue({
    date: '2026-04-05',
    totalHidden: 0,
    totalShown: 0,
    byCategory: {},
    byPack: {},
  });
  mockSaveDayStats.mockResolvedValue(undefined);
  mockGetAllTimeTotal.mockResolvedValue(0);
  mockIncrementTotal.mockResolvedValue(undefined);
});

describe('recordHide', () => {
  it('increments buffer totalHidden', async () => {
    const el = makeElement();
    recordHide(el);

    // flush to verify buffer state
    await flushStats();
    expect(mockSaveDayStats).toHaveBeenCalledWith(
      expect.objectContaining({ totalHidden: 1 }),
    );
  });

  it('skips duplicate when data-bbr-counted attr is set', async () => {
    const el = makeElement();
    el.setAttribute('data-bbr-counted', '1');
    recordHide(el);

    await flushStats();
    // Buffer should be empty, flushStats is a no-op
    expect(mockSaveDayStats).not.toHaveBeenCalled();
  });

  it('tracks byCategory when category is provided', async () => {
    const el = makeElement();
    recordHide(el, 'politics');

    await flushStats();
    expect(mockSaveDayStats).toHaveBeenCalledWith(
      expect.objectContaining({
        byCategory: expect.objectContaining({ politics: 1 }),
      }),
    );
  });

  it('tracks byPack when packId is provided', async () => {
    const el = makeElement();
    recordHide(el, undefined, 'pack-abc');

    await flushStats();
    expect(mockSaveDayStats).toHaveBeenCalledWith(
      expect.objectContaining({
        byPack: expect.objectContaining({ 'pack-abc': 1 }),
      }),
    );
  });
});

describe('flushStats', () => {
  it('is a no-op when buffer is empty', async () => {
    await flushStats();
    expect(mockSaveDayStats).not.toHaveBeenCalled();
    expect(mockIncrementTotal).not.toHaveBeenCalled();
  });

  it('merges buffer into storage and resets buffer', async () => {
    const el1 = makeElement();
    const el2 = makeElement();
    recordHide(el1, 'spam');
    recordHide(el2, 'spam');

    mockGetTodayStats.mockResolvedValue({
      date: '2026-04-05',
      totalHidden: 5,
      totalShown: 0,
      byCategory: { spam: 3 },
      byPack: {},
    });

    await flushStats();

    expect(mockSaveDayStats).toHaveBeenCalledWith(
      expect.objectContaining({
        totalHidden: 7, // 5 existing + 2 new
        byCategory: expect.objectContaining({ spam: 5 }), // 3 existing + 2 new
      }),
    );

    // Buffer is reset — second flush is no-op
    await flushStats();
    expect(mockSaveDayStats).toHaveBeenCalledTimes(1);
  });

  it('calls incrementTotal with hidden count', async () => {
    const el = makeElement();
    recordHide(el);

    await flushStats();
    expect(mockIncrementTotal).toHaveBeenCalledWith(1);
  });

  it('calls onFlush callback with all-time total', async () => {
    const onFlush = vi.fn();
    setOnFlush(onFlush);
    mockGetAllTimeTotal.mockResolvedValue(500);

    const el = makeElement();
    recordHide(el);

    await flushStats();
    expect(onFlush).toHaveBeenCalledWith(500);

    // Clean up
    setOnFlush(() => {});
  });
});
