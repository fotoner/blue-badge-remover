import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Browser } from 'wxt/browser';
import { MESSAGE_TYPES, TIMINGS } from '@shared/constants';

const mocks = vi.hoisted(() => ({
  query: vi.fn(),
  sendMessage: vi.fn(),
  reload: vi.fn(),
}));

vi.mock('wxt/browser', () => ({
  browser: { tabs: { query: mocks.query, sendMessage: mocks.sendMessage, reload: mocks.reload } },
}));

const { findTabsNeedingReload, reloadTabs } = await import('../../../src/features/reload-notice');

const OK_RESPONSE = { mainWorldStart: { readyState: 'loading', version: '1.8.2' } };

function xTab(id: number, overrides: Record<string, unknown> = {}): Browser.tabs.Tab {
  return { id, url: 'https://x.com/home', status: 'complete', ...overrides } as unknown as Browser.tabs.Tab;
}

/** 응답 없는 탭의 재시도 대기를 넘기고 결과를 받는다 */
async function settle<T>(pending: Promise<T>): Promise<T> {
  await vi.advanceTimersByTimeAsync(TIMINGS.RELOAD_PROBE_RETRY);
  return pending;
}

beforeEach(() => {
  vi.useFakeTimers();
  [mocks.query, mocks.sendMessage, mocks.reload].forEach((mock) => mock.mockReset());
  mocks.reload.mockResolvedValue(undefined);
});

describe('findTabsNeedingReload', () => {
  it('x.com·twitter.com 탭만 찾는다', async () => {
    mocks.query.mockResolvedValue([]);
    await findTabsNeedingReload();

    expect(mocks.query).toHaveBeenCalledWith({ url: ['https://x.com/*', 'https://twitter.com/*'] });
  });

  it('새 content script가 응답하지 않는 탭만 돌려준다', async () => {
    mocks.query.mockResolvedValue([xTab(1), xTab(2)]);
    mocks.sendMessage.mockImplementation(async (tabId: number) => {
      if (tabId === 1) throw new Error('Could not establish connection. Receiving end does not exist.');
      return OK_RESPONSE;
    });

    const tabs = await settle(findTabsNeedingReload());

    expect(tabs.map((tab) => tab.id)).toEqual([1]);
    expect(mocks.sendMessage).toHaveBeenCalledWith(2, { type: MESSAGE_TYPES.RELOAD_PROBE });
  });

  it('아직 불러오는 중이거나 버려진 탭은 세지 않는다 — 다시 불러오면 새 content script가 들어간다', async () => {
    mocks.query.mockResolvedValue([xTab(1, { status: 'loading' }), xTab(2, { status: 'unloaded' })]);

    expect(await findTabsNeedingReload()).toEqual([]);
    expect(mocks.sendMessage).not.toHaveBeenCalled();
  });
});

describe('reloadTabs', () => {
  it('받은 탭을 새로고침하고 수를 돌려준다', async () => {
    expect(await reloadTabs([xTab(1), xTab(2)])).toBe(2);
    expect(mocks.reload).toHaveBeenCalledWith(1);
    expect(mocks.reload).toHaveBeenCalledWith(2);
  });

  it('한 탭이 그사이 닫혀도 나머지는 새로고침한다', async () => {
    mocks.reload.mockImplementation(async (tabId: number) => {
      if (tabId === 1) throw new Error('No tab with id: 1.');
    });

    expect(await reloadTabs([xTab(1), xTab(2)])).toBe(1);
  });
});
