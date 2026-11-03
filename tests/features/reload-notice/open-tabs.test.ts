import { beforeEach, describe, expect, it, vi } from 'vitest';
import { MESSAGE_TYPES, TIMINGS } from '@shared/constants';
import { t } from '@shared/i18n';

const mocks = vi.hoisted(() => ({
  query: vi.fn(),
  sendMessage: vi.fn(),
  executeScript: vi.fn(),
  browser: {} as Record<string, unknown>,
}));

vi.mock('wxt/browser', () => ({ browser: mocks.browser }));

const { buildReloadToastText, notifyOpenXTabs } = await import('../../../src/features/reload-notice');

const OK_RESPONSE = { mainWorldStart: { readyState: 'loading', version: '1.8.2' } };
const TEXT = { message: 'm', reload: 'r', close: 'c' };
const show = vi.fn();

function xTab(id: number, overrides: Record<string, unknown> = {}) {
  return { id, url: 'https://x.com/home', status: 'complete', ...overrides };
}

/** 응답 없는 탭의 재시도 대기를 넘기고 결과를 받는다 */
async function settle<T>(pending: Promise<T>): Promise<T> {
  await vi.advanceTimersByTimeAsync(TIMINGS.RELOAD_PROBE_RETRY);
  return pending;
}

beforeEach(() => {
  vi.useFakeTimers();
  [mocks.query, mocks.sendMessage, mocks.executeScript, show].forEach((mock) => mock.mockReset());
  mocks.browser['tabs'] = { query: mocks.query, sendMessage: mocks.sendMessage };
  mocks.browser['scripting'] = { executeScript: mocks.executeScript };
  mocks.executeScript.mockResolvedValue([]);
});

describe('notifyOpenXTabs', () => {
  it('x.com·twitter.com 탭만 찾는다', async () => {
    mocks.query.mockResolvedValue([]);
    await notifyOpenXTabs(TEXT, show);

    expect(mocks.query).toHaveBeenCalledWith({ url: ['https://x.com/*', 'https://twitter.com/*'] });
  });

  it('새 content script가 응답하지 않는 탭에만 안내를 넣는다', async () => {
    mocks.query.mockResolvedValue([xTab(1), xTab(2)]);
    mocks.sendMessage.mockImplementation(async (tabId: number) => {
      if (tabId === 1) throw new Error('Could not establish connection. Receiving end does not exist.');
      return OK_RESPONSE;
    });

    const count = await settle(notifyOpenXTabs(TEXT, show));

    expect(count).toBe(1);
    expect(mocks.executeScript).toHaveBeenCalledOnce();
    expect(mocks.executeScript).toHaveBeenCalledWith({ target: { tabId: 1 }, func: show, args: [TEXT] });
    expect(mocks.sendMessage).toHaveBeenCalledWith(2, { type: MESSAGE_TYPES.RELOAD_PROBE });
  });

  it('아직 불러오는 중이거나 버려진 탭은 건드리지 않는다 — 다시 불러오면 새 content script가 들어간다', async () => {
    mocks.query.mockResolvedValue([xTab(1, { status: 'loading' }), xTab(2, { status: 'unloaded' })]);

    expect(await notifyOpenXTabs(TEXT, show)).toBe(0);
    expect(mocks.sendMessage).not.toHaveBeenCalled();
    expect(mocks.executeScript).not.toHaveBeenCalled();
  });

  it('한 탭에 넣지 못해도 나머지 탭에는 넣는다', async () => {
    mocks.query.mockResolvedValue([xTab(1), xTab(2)]);
    mocks.sendMessage.mockRejectedValue(new Error('no receiver'));
    mocks.executeScript.mockImplementation(async ({ target }: { target: { tabId: number } }) => {
      if (target.tabId === 1) throw new Error('The tab was closed.');
      return [];
    });

    expect(await settle(notifyOpenXTabs(TEXT, show))).toBe(1);
  });

  it('scripting API가 없으면(Firefox 빌드) 아무것도 하지 않는다', async () => {
    delete mocks.browser['scripting'];

    expect(await notifyOpenXTabs(TEXT, show)).toBe(0);
    expect(mocks.query).not.toHaveBeenCalled();
  });
});

describe('buildReloadToastText', () => {
  it.each(['ko', 'en', 'ja'] as const)('%s: 설치와 업데이트 문구를 나누고 버튼은 기존 문구를 쓴다', (lang) => {
    const installed = buildReloadToastText('install', lang);
    const updated = buildReloadToastText('update', lang);

    expect(installed.message).toBe(t('reloadToastInstalled', lang));
    expect(updated.message).toBe(t('reloadToastUpdated', lang));
    expect(installed.message).not.toBe(updated.message);
    expect(installed.reload).toBe(t('reloadTab', lang));
    expect(installed.close).toBe(t('dismiss', lang));
  });
});
