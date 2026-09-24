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

  it('같은 statusPath의 재활용 DOM 노드는 세션에서 한 번만 센다', async () => {
    recordHide(makeElement(), 'spam', undefined, '/alice/status/123');
    recordHide(makeElement(), 'spam', undefined, '/alice/status/123');

    await flushStats();

    expect(mockSaveDayStats).toHaveBeenCalledWith(
      expect.objectContaining({ totalHidden: 1 }),
    );
  });

  it('서로 다른 statusPath는 각각 센다', async () => {
    recordHide(makeElement(), undefined, undefined, '/alice/status/201');
    recordHide(makeElement(), undefined, undefined, '/alice/status/202');

    await flushStats();

    expect(mockSaveDayStats).toHaveBeenCalledWith(
      expect.objectContaining({ totalHidden: 2 }),
    );
  });

  it('statusPath 세션 Set은 5000개를 넘으면 가장 오래된 항목을 제거한다', async () => {
    for (let i = 0; i < 5001; i++) {
      recordHide(makeElement(), undefined, undefined, `/user/status/cap-${i}`);
    }
    recordHide(makeElement(), undefined, undefined, '/user/status/cap-0');

    await flushStats();

    expect(mockSaveDayStats).toHaveBeenCalledWith(
      expect.objectContaining({ totalHidden: 5002 }),
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

  // flush의 storage 왕복 중 recordHide된 건이 buffer 리셋으로 사라지거나 일별/누계가 어긋나던 문제
  it('flush 도중 기록된 숨김은 유실되지 않고 일별·누계에 같은 수로 반영된다', async () => {
    const savedDays: number[] = [];
    const increments: number[] = [];
    let dayTotal = 0;
    mockGetTodayStats.mockImplementation(async () => {
      await Promise.resolve();
      recordHide(makeElement()); // 읽기 대기 중 기록
      return { date: '2026-04-05', totalHidden: dayTotal, totalShown: 0, byCategory: {}, byPack: {} };
    });
    mockSaveDayStats.mockImplementation(async (day: { totalHidden: number }) => {
      recordHide(makeElement()); // 저장 대기 중 기록
      dayTotal = day.totalHidden;
      savedDays.push(day.totalHidden);
    });
    mockIncrementTotal.mockImplementation(async (count: number) => { increments.push(count); });

    recordHide(makeElement());
    await flushStats();
    mockGetTodayStats.mockImplementation(async () => (
      { date: '2026-04-05', totalHidden: dayTotal, totalShown: 0, byCategory: {}, byPack: {} }
    ));
    mockSaveDayStats.mockImplementation(async (day: { totalHidden: number }) => {
      dayTotal = day.totalHidden;
      savedDays.push(day.totalHidden);
    });
    await flushStats();

    expect(dayTotal).toBe(3);
    expect(increments.reduce((sum, n) => sum + n, 0)).toBe(3);
  });

  it('동시에 호출된 flush는 직렬화되어 서로의 저장을 덮어쓰지 않는다', async () => {
    let dayTotal = 0;
    mockGetTodayStats.mockImplementation(async () => {
      const snapshot = dayTotal; // 읽기 시점 값 — 느린 storage 왕복 재현
      await new Promise((resolve) => setTimeout(resolve, 5));
      return { date: '2026-04-05', totalHidden: snapshot, totalShown: 0, byCategory: {}, byPack: {} };
    });
    mockSaveDayStats.mockImplementation(async (day: { totalHidden: number }) => { dayTotal = day.totalHidden; });

    recordHide(makeElement());
    const first = flushStats();
    recordHide(makeElement());
    const second = flushStats();
    await Promise.all([first, second]);

    expect(dayTotal).toBe(2);
  });

  it('저장이 실패하면 기록을 버퍼로 되돌려 다음 flush에서 다시 저장한다', async () => {
    mockGetTodayStats.mockImplementation(async () => (
      { date: '2026-04-05', totalHidden: 0, totalShown: 0, byCategory: {}, byPack: {} }
    ));
    mockSaveDayStats.mockRejectedValueOnce(new Error('quota'));
    recordHide(makeElement(), 'spam');
    await flushStats(); // 호출부가 fire-and-forget이므로 reject하지 않는다
    expect(mockIncrementTotal).not.toHaveBeenCalled();

    await flushStats();
    expect(mockSaveDayStats).toHaveBeenLastCalledWith(
      expect.objectContaining({ totalHidden: 1, byCategory: expect.objectContaining({ spam: 1 }) }),
    );
    expect(mockIncrementTotal).toHaveBeenCalledWith(1);
  });

  it('누계 조회/콜백이 실패해도 flush는 reject하지 않는다 (fire-and-forget 호출부)', async () => {
    const onFlush = vi.fn();
    setOnFlush(onFlush);
    mockGetAllTimeTotal.mockRejectedValueOnce(new Error('storage unavailable'));
    recordHide(makeElement());

    await expect(flushStats()).resolves.toBeUndefined();
    expect(onFlush).not.toHaveBeenCalled();
    setOnFlush(() => {});
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
