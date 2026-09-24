import { describe, expect, it, vi } from 'vitest';

// stats-storage를 목킹하지 않고 실제 모듈로 flush → storage 경로를 검증한다
const store = new Map<string, unknown>();
const setMock = vi.fn(async (items: Record<string, unknown>) => {
  for (const [key, value] of Object.entries(items)) store.set(key, value);
});

vi.mock('wxt/browser', () => ({
  browser: {
    storage: {
      local: {
        get: vi.fn(async (keys: string[]) => Object.fromEntries(
          keys.filter((key) => store.has(key)).map((key) => [key, store.get(key)]),
        )),
        set: (items: Record<string, unknown>) => setMock(items),
      },
    },
  },
}));

const { recordHide, flushStats } = await import('@features/stats/stats-collector');

describe('stats flush + storage 통합', () => {
  it('일별 통계 쓰기가 실패하면 기록을 보존했다가 다음 flush에서 일별·누계에 한 번씩 반영한다', async () => {
    setMock.mockRejectedValueOnce(new Error('QUOTA_BYTES quota exceeded'));
    recordHide(document.createElement('div'));
    recordHide(document.createElement('div'));

    await flushStats();
    expect(store.get('stats-total')).toBeUndefined();

    await flushStats();
    const dayKeys = [...store.keys()].filter((key) => key.startsWith('stats-') && key !== 'stats-total');
    expect(dayKeys).toHaveLength(1);
    expect((store.get(dayKeys[0]!) as { totalHidden: number }).totalHidden).toBe(2);
    expect(store.get('stats-total')).toBe(2);
  });
});
