import { describe, it, expect, vi, beforeEach } from 'vitest';
import { STORAGE_KEYS } from '@shared/constants';

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

const { removeLegacyFollowData } = await import('@features/settings/follow-list-reset');

describe('removeLegacyFollowData (#70)', () => {
  beforeEach(() => {
    for (const k of Object.keys(mockStorage)) delete mockStorage[k];
  });

  it('오염된 v1 팔로우 데이터와 동기화 시각을 지우고 v2·계정·화이트리스트는 남긴다', async () => {
    Object.assign(mockStorage, {
      followList: ['polluted_a', 'me'],
      followCache: { me: ['polluted_a'], other: ['x'] },
      lastSyncAt: '2026-10-27T00:00:00.000Z',
      [STORAGE_KEYS.FOLLOW_LIST]: ['really_followed'],
      currentUserId: 'me',
      whitelist: ['@kept'],
    });

    expect(await removeLegacyFollowData()).toBe(true);

    expect(mockStorage).not.toHaveProperty('followList');
    expect(mockStorage).not.toHaveProperty('followCache');
    expect(mockStorage).not.toHaveProperty('lastSyncAt');
    expect(mockStorage[STORAGE_KEYS.FOLLOW_LIST]).toEqual(['really_followed']);
    expect(mockStorage['currentUserId']).toBe('me');
    expect(mockStorage['whitelist']).toEqual(['@kept']);
  });

  // 리뷰: 정리 전에 읽은 오염 캐시를 정리 뒤에 다시 쓰는 경합 — 옛 키에만 닿고 새 목록에는 섞이지 않아야 한다
  it('정리 뒤 옛 키로 늦게 도착한 쓰기는 새 팔로우 목록에 섞이지 않는다', async () => {
    Object.assign(mockStorage, { followCache: { me: ['polluted_a'] } });
    await removeLegacyFollowData();

    mockStorage['followCache'] = { me: ['polluted_a', 'polluted_b'] };

    expect(STORAGE_KEYS.FOLLOW_CACHE).not.toBe('followCache');
    expect(mockStorage[STORAGE_KEYS.FOLLOW_CACHE]).toBeUndefined();
    expect(await removeLegacyFollowData()).toBe(true);
    expect(mockStorage).not.toHaveProperty('followCache');
  });

  // 리뷰 S2: 늦은 v1 쓰기 뒤 v2로 정상 동기화된 상태에서 다음 업데이트가 와도 v2 동기화 시각은 남아야 한다
  it('v1을 지울 때 v2 동기화 시각은 건드리지 않는다', async () => {
    Object.assign(mockStorage, {
      followCache: { me: ['polluted_a'] },
      lastSyncAt: '2026-10-01T00:00:00.000Z',
      [STORAGE_KEYS.FOLLOW_LIST]: ['really_followed'],
      [STORAGE_KEYS.LAST_SYNC_AT]: '2026-10-27T09:00:00.000Z',
    });

    await removeLegacyFollowData();

    expect(STORAGE_KEYS.LAST_SYNC_AT).not.toBe('lastSyncAt');
    expect(mockStorage[STORAGE_KEYS.LAST_SYNC_AT]).toBe('2026-10-27T09:00:00.000Z');
    expect(mockStorage).not.toHaveProperty('lastSyncAt');
  });

  it('v1 데이터가 없으면 아무것도 지우지 않는다', async () => {
    Object.assign(mockStorage, { [STORAGE_KEYS.LAST_SYNC_AT]: '2026-10-27T00:00:00.000Z', [STORAGE_KEYS.FOLLOW_LIST]: ['a'] });

    expect(await removeLegacyFollowData()).toBe(false);
    expect(mockStorage[STORAGE_KEYS.LAST_SYNC_AT]).toBe('2026-10-27T00:00:00.000Z');
  });
});
