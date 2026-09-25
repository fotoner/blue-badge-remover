import { beforeEach, describe, expect, it, vi } from 'vitest';

const mockStorage: Record<string, unknown> = {};

vi.mock('wxt/browser', () => ({
  browser: {
    storage: {
      local: {
        get: vi.fn((keys: string[]) => Promise.resolve(
          Object.fromEntries(keys.filter((key) => key in mockStorage).map((key) => [key, mockStorage[key]])),
        )),
        set: vi.fn((items: Record<string, unknown>) => {
          Object.assign(mockStorage, items);
          return Promise.resolve();
        }),
      },
    },
  },
}));

const { handleWhitelistRequest } = await import('@features/settings/whitelist-storage');

beforeEach(() => {
  Object.keys(mockStorage).forEach((key) => delete mockStorage[key]);
});

describe('handleWhitelistRequest', () => {
  it('서로 다른 컨텍스트의 동시 추가를 백그라운드 큐에서 모두 보존한다', async () => {
    await Promise.all([
      handleWhitelistRequest({ type: 'BBR_WHITELIST', operation: 'add', handles: ['@alice'] }),
      handleWhitelistRequest({ type: 'BBR_WHITELIST', operation: 'add', handles: ['@bob'] }),
    ]);

    expect(mockStorage['whitelist']).toEqual(['@alice', '@bob']);
  });

  it('동시 추가와 삭제를 순서대로 반영한다', async () => {
    mockStorage['whitelist'] = ['@alice'];

    await Promise.all([
      handleWhitelistRequest({ type: 'BBR_WHITELIST', operation: 'add', handles: ['@bob'] }),
      handleWhitelistRequest({ type: 'BBR_WHITELIST', operation: 'remove', handles: ['@alice'] }),
    ]);

    expect(mockStorage['whitelist']).toEqual(['@bob']);
  });

  it('읽기도 같은 큐에서 기존 목록을 정규화하고 반환한다', async () => {
    mockStorage['whitelist'] = ['@Alice', 'alice', '@Bob'];

    const response = await handleWhitelistRequest({ type: 'BBR_WHITELIST', operation: 'get' });

    expect(response).toEqual({ whitelist: ['@alice', '@bob'] });
    expect(mockStorage['whitelist']).toEqual(['@alice', '@bob']);
  });

  // 백업 가져오기가 큐를 우회해 storage를 직접 덮어쓰던 문제 — replace도 같은 큐로 처리
  it('replace는 같은 큐에서 목록 전체를 정규화해 교체한다', async () => {
    mockStorage['whitelist'] = ['@old'];
    await Promise.all([
      handleWhitelistRequest({ type: 'BBR_WHITELIST', operation: 'add', handles: ['@before'] }),
      handleWhitelistRequest({ type: 'BBR_WHITELIST', operation: 'replace', handles: ['@Alice', 'alice', '@bob'] }),
      handleWhitelistRequest({ type: 'BBR_WHITELIST', operation: 'add', handles: ['@after'] }),
    ]);
    expect(mockStorage['whitelist']).toEqual(['@alice', '@bob', '@after']);
  });

  it('replace는 백업 상한(10,000개)까지 허용하고 초과하면 거부한다', async () => {
    const many = Array.from({ length: 10_000 }, (_, i) => `@user${i}`);
    const ok = await handleWhitelistRequest({ type: 'BBR_WHITELIST', operation: 'replace', handles: many });
    expect(ok?.whitelist).toHaveLength(10_000);
    const tooMany = await handleWhitelistRequest({ type: 'BBR_WHITELIST', operation: 'replace', handles: [...many, '@extra'] });
    expect(tooMany).toBeUndefined();
  });

  it('잘못된 요청은 저장소를 변경하지 않는다', async () => {
    mockStorage['whitelist'] = ['@alice'];

    const response = await handleWhitelistRequest({ type: 'BBR_WHITELIST', operation: 'add', handles: 'bob' });

    expect(response).toBeUndefined();
    expect(mockStorage['whitelist']).toEqual(['@alice']);
  });
});
