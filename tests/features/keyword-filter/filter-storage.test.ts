import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockStorage: Record<string, unknown> = {};

vi.mock('wxt/browser', () => ({
  browser: {
    storage: {
      local: {
        get: vi.fn((keys: string[]) =>
          Promise.resolve(
            Object.fromEntries(
              keys.filter((k: string) => k in mockStorage).map((k: string) => [k, mockStorage[k]]),
            ),
          ),
        ),
        set: vi.fn((items: Record<string, unknown>) => {
          Object.assign(mockStorage, items);
          return Promise.resolve();
        }),
      },
    },
  },
}));

const {
  getCustomFilterList,
  saveCustomFilterList,
  getDisabledFilterCategories,
  saveDisabledFilterCategories,
} = await import('@features/keyword-filter/filter-storage');

beforeEach(() => {
  Object.keys(mockStorage).forEach((k) => delete mockStorage[k]);
});

describe('getCustomFilterList', () => {
  it('should return empty string when storage is empty', async () => {
    const result = await getCustomFilterList();
    expect(result).toBe('');
  });

  it('should return stored filter list', async () => {
    mockStorage['customFilterList'] = '테슬라\n년차';
    const result = await getCustomFilterList();
    expect(result).toBe('테슬라\n년차');
  });
});

describe('saveCustomFilterList', () => {
  it('should save filter list to storage', async () => {
    await saveCustomFilterList('테슬라\n년차');
    expect(mockStorage['customFilterList']).toBe('테슬라\n년차');
  });
});

describe('disabled filter categories', () => {
  it('should return empty array when storage is empty', async () => {
    await expect(getDisabledFilterCategories()).resolves.toEqual([]);
  });

  it('should read stored disabled categories', async () => {
    mockStorage['disabledFilterCategories'] = ['금융'];
    await expect(getDisabledFilterCategories()).resolves.toEqual(['금융']);
  });

  it('should save disabled categories', async () => {
    await saveDisabledFilterCategories(['정치']);
    expect(mockStorage['disabledFilterCategories']).toEqual(['정치']);
  });
});
