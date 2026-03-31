import { describe, it, expect, vi, beforeEach } from 'vitest';
import { getCustomFilterList, saveCustomFilterList } from '@features/keyword-filter/filter-storage';

const mockStorage: Record<string, unknown> = {};

vi.stubGlobal('chrome', {
  storage: {
    local: {
      get: vi.fn((keys: string[]) =>
        Promise.resolve(
          Object.fromEntries(
            keys.filter((k) => k in mockStorage).map((k) => [k, mockStorage[k]]),
          ),
        ),
      ),
      set: vi.fn((items: Record<string, unknown>) => {
        Object.assign(mockStorage, items);
        return Promise.resolve();
      }),
    },
  },
});

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
