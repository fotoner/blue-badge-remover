import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockStorage: Record<string, unknown> = {};

vi.mock('wxt/browser', () => ({
  browser: {
    storage: {
      local: {
        get: vi.fn((keys: string | string[]) => {
          const list = Array.isArray(keys) ? keys : [keys];
          return Promise.resolve(Object.fromEntries(list.filter((k) => k in mockStorage).map((k) => [k, mockStorage[k]])));
        }),
        set: vi.fn((items: Record<string, unknown>) => { Object.assign(mockStorage, items); return Promise.resolve(); }),
        remove: vi.fn((keys: string | string[]) => {
          for (const k of Array.isArray(keys) ? keys : [keys]) delete mockStorage[k];
          return Promise.resolve();
        }),
      },
    },
  },
}));

const { resetPollutedFollowListOnce } = await import('@features/settings/follow-list-reset');

describe('resetPollutedFollowListOnce (#70)', () => {
  beforeEach(() => {
    for (const k of Object.keys(mockStorage)) delete mockStorage[k];
    Object.assign(mockStorage, {
      followList: ['polluted_a', 'polluted_b', 'me'],
      followCache: { me: ['polluted_a', 'me'], other: ['x'] },
      lastSyncAt: '2026-10-27T00:00:00.000Z',
      currentUserId: 'me',
      whitelist: ['@kept'],
    });
  });

  it('처음 한 번은 팔로우 목록·캐시·동기화 시각을 비우고 계정·화이트리스트는 남긴다', async () => {
    const didReset = await resetPollutedFollowListOnce();

    expect(didReset).toBe(true);
    expect(mockStorage['followList']).toEqual([]);
    expect(mockStorage['followCache']).toEqual({});
    expect(mockStorage).not.toHaveProperty('lastSyncAt');
    expect(mockStorage['currentUserId']).toBe('me');
    expect(mockStorage['whitelist']).toEqual(['@kept']);
  });

  it('이미 비운 뒤에는 다시 비우지 않아 새로 모은 팔로우를 지킨다', async () => {
    await resetPollutedFollowListOnce();
    mockStorage['followList'] = ['really_followed'];

    const didReset = await resetPollutedFollowListOnce();

    expect(didReset).toBe(false);
    expect(mockStorage['followList']).toEqual(['really_followed']);
  });
});
