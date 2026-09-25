import { beforeEach, describe, expect, it, vi } from 'vitest';

type ChangeListener = (changes: Record<string, unknown>, areaName: string) => void;
const listeners: ChangeListener[] = [];
const mockStorage: Record<string, unknown> = {};

vi.mock('wxt/browser', () => ({
  browser: {
    storage: {
      local: {
        get: vi.fn(async (keys: string[]) => Object.fromEntries(
          keys.filter((key) => key in mockStorage).map((key) => [key, mockStorage[key]]),
        )),
      },
      onChanged: { addListener: vi.fn((listener: ChangeListener) => { listeners.push(listener); }) },
    },
    tabs: { create: vi.fn() },
    runtime: { getURL: (path: string) => path },
  },
}));

const { watchSyncStatus } = await import('../../src/dashboard/settings-section');
const { STORAGE_KEYS } = await import('../../src/shared/constants');

async function flush(): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, 0));
}

beforeEach(() => {
  listeners.length = 0;
  Object.keys(mockStorage).forEach((key) => delete mockStorage[key]);
  document.body.innerHTML = '<span id="current-account"></span><span id="sync-status"></span><span id="follow-count"></span>';
});

// 대시보드를 연 채로 다른 탭에서 팔로우를 동기화해도 현황이 갱신되지 않던 문제
describe('watchSyncStatus', () => {
  it('팔로우 목록이 바뀌면 동기화 현황을 다시 그린다', async () => {
    watchSyncStatus(() => 'ko');
    mockStorage[STORAGE_KEYS.FOLLOW_LIST] = ['a', 'b', 'c'];
    mockStorage[STORAGE_KEYS.CURRENT_USER_ID] = 'me';

    listeners.forEach((listener) => listener({ [STORAGE_KEYS.FOLLOW_LIST]: { newValue: ['a', 'b', 'c'] } }, 'local'));
    await flush();

    expect(document.getElementById('follow-count')!.textContent).toContain('3');
    expect(document.getElementById('current-account')!.textContent).toContain('me');
  });

  it('관련 없는 키나 다른 storage 영역의 변경은 무시한다', async () => {
    watchSyncStatus(() => 'ko');
    mockStorage[STORAGE_KEYS.FOLLOW_LIST] = ['a'];

    listeners.forEach((listener) => listener({ settings: { newValue: {} } }, 'local'));
    listeners.forEach((listener) => listener({ [STORAGE_KEYS.FOLLOW_LIST]: { newValue: ['a'] } }, 'sync'));
    await flush();

    expect(document.getElementById('follow-count')!.textContent).toBe('');
  });
});
