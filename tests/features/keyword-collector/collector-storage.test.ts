import { describe, it, expect, vi, beforeEach } from 'vitest';
import { getCollectedFadaks, saveCollectedFadaks, clearCollectedFadaks } from '@features/keyword-collector/collector-storage';
import type { CollectedFadak } from '@shared/types';

const mockStorage: Record<string, unknown> = {};

vi.stubGlobal('chrome', {
  storage: {
    local: {
      get: vi.fn((keys: string[]) =>
        Promise.resolve(
          Object.fromEntries(keys.filter((k) => k in mockStorage).map((k) => [k, mockStorage[k]])),
        ),
      ),
      set: vi.fn((items: Record<string, unknown>) => {
        Object.assign(mockStorage, items);
        return Promise.resolve();
      }),
    },
  },
});

const sample: CollectedFadak = {
  userId: 'u1',
  handle: 'testuser',
  displayName: 'Test User',
  bio: '테슬라 팬',
  tweetTexts: ['테슬라 주가 올랐다'],
  firstSeenAt: 1000,
  lastSeenAt: 2000,
};

beforeEach(() => {
  Object.keys(mockStorage).forEach((k) => delete mockStorage[k]);
});

describe('getCollectedFadaks', () => {
  it('should return empty array when storage is empty', async () => {
    expect(await getCollectedFadaks()).toEqual([]);
  });

  it('should return stored list', async () => {
    mockStorage['collectedFadaks'] = [sample];
    const list = await getCollectedFadaks();
    expect(list).toHaveLength(1);
    expect(list[0]?.handle).toBe('testuser');
  });
});

describe('saveCollectedFadaks', () => {
  it('should persist list to storage', async () => {
    await saveCollectedFadaks([sample]);
    expect(mockStorage['collectedFadaks']).toEqual([sample]);
  });
});

describe('clearCollectedFadaks', () => {
  it('should reset list to empty array', async () => {
    mockStorage['collectedFadaks'] = [sample];
    await clearCollectedFadaks();
    expect(mockStorage['collectedFadaks']).toEqual([]);
  });
});
