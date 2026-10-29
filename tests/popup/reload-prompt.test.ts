import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { MESSAGE_TYPES, TIMINGS, X_CONTENT_HOSTS } from '@shared/constants';
import { t } from '@shared/i18n';

const mocks = vi.hoisted(() => ({
  get: vi.fn(),
  query: vi.fn(),
  sendMessage: vi.fn(),
  reload: vi.fn(),
  addUpdatedListener: vi.fn(),
  removeUpdatedListener: vi.fn(),
}));

vi.mock('wxt/browser', () => ({
  browser: {
    tabs: {
      get: mocks.get,
      query: mocks.query,
      sendMessage: mocks.sendMessage,
      reload: mocks.reload,
      onUpdated: { addListener: mocks.addUpdatedListener, removeListener: mocks.removeUpdatedListener },
    },
  },
}));

const { isSupportedXUrl, resolveTargetTab, checkTabNeedsReload, initReloadPrompt } = await import('../../src/popup/reload-prompt');

type TabArg = Parameters<typeof checkTabNeedsReload>[0];

function xTab(overrides: Partial<TabArg> = {}): TabArg {
  return { id: 5, url: 'https://x.com/home', status: 'complete', ...overrides } as TabArg;
}

const OK_RESPONSE = { mainWorldStart: { readyState: 'loading', version: '1.8.2' } };

/** 재시도 대기를 넘기고 결과를 받는다 */
async function settle<T>(pending: Promise<T>): Promise<T> {
  await vi.advanceTimersByTimeAsync(TIMINGS.RELOAD_PROBE_RETRY);
  return pending;
}

beforeEach(() => {
  vi.useFakeTimers();
  Object.values(mocks).forEach((mock) => mock.mockReset());
});

afterEach(() => {
  vi.useRealTimers();
});

describe('isSupportedXUrl', () => {
  it.each(['https://x.com/home', 'https://twitter.com/home', 'https://x.com/', 'https://twitter.com/i/lists/1'])(
    'content script가 붙는 주소다: %s',
    (url) => {
      expect(isSupportedXUrl(url)).toBe(true);
    },
  );

  it.each([
    undefined,
    '',
    'not a url',
    'http://x.com/home',
    'https://www.twitter.com/home',
    'https://mobile.twitter.com/home',
    'https://x.com.evil.example/home',
    'https://notx.com/home',
    'https://x.com:8443/home',
    'moz-extension://abc/popup.html',
    'chrome://extensions',
  ])('x.com·twitter.com이 아니면 거른다: %s', (url) => {
    expect(isSupportedXUrl(url)).toBe(false);
  });
});

describe('manifest matches와 호스트 목록', () => {
  it('팝업이 보는 호스트는 content script의 matches와 같다', () => {
    const source = readFileSync(resolve(process.cwd(), 'entrypoints/content.ts'), 'utf8');
    const matches = [...source.matchAll(/'https:\/\/([^/']+)\/\*'/g)].map((m) => m[1]);

    expect(matches).toEqual([...X_CONTENT_HOSTS]);
  });
});

describe('resolveTargetTab', () => {
  it('sourceTabId가 있으면 그 탭을 대상으로 한다 (팝업이 탭으로 열린 경우)', async () => {
    mocks.get.mockResolvedValue(xTab({ id: 9 }));

    const tab = await resolveTargetTab('?sourceTabId=9');

    expect(mocks.get).toHaveBeenCalledWith(9);
    expect(mocks.query).not.toHaveBeenCalled();
    expect(tab?.id).toBe(9);
  });

  it('sourceTabId가 없으면 현재 창의 활성 탭이다', async () => {
    mocks.query.mockResolvedValue([xTab({ id: 3 })]);

    const tab = await resolveTargetTab('');

    expect(mocks.query).toHaveBeenCalledWith({ active: true, currentWindow: true });
    expect(mocks.get).not.toHaveBeenCalled();
    expect(tab?.id).toBe(3);
  });

  it('sourceTabId 탭이 이미 닫혔으면 대상이 없다', async () => {
    mocks.get.mockRejectedValue(new Error('No tab with id: 9'));

    expect(await resolveTargetTab('?sourceTabId=9')).toBeUndefined();
  });
});

describe('checkTabNeedsReload', () => {
  it('content script가 응답하고 MAIN world가 제때 시작했으면 안내하지 않는다', async () => {
    mocks.sendMessage.mockResolvedValue(OK_RESPONSE);

    expect(await checkTabNeedsReload(xTab())).toBe(false);
    expect(mocks.sendMessage).toHaveBeenCalledWith(5, { type: MESSAGE_TYPES.RELOAD_PROBE });
  });

  it('메시지가 실패하면 1회 다시 시도한 뒤 새로고침을 안내한다', async () => {
    mocks.sendMessage.mockRejectedValue(new Error('Receiving end does not exist'));

    expect(await settle(checkTabNeedsReload(xTab()))).toBe(true);
    expect(mocks.sendMessage).toHaveBeenCalledTimes(2);
  });

  it('첫 시도가 실패해도 재시도가 응답하면 안내하지 않는다 (document_idle 주입이 늦은 경우)', async () => {
    mocks.sendMessage.mockRejectedValueOnce(new Error('Receiving end does not exist')).mockResolvedValueOnce(OK_RESPONSE);

    expect(await settle(checkTabNeedsReload(xTab()))).toBe(false);
    expect(mocks.sendMessage).toHaveBeenCalledTimes(2);
  });

  it('응답이 비어 있어도 실패로 보고 재시도한다', async () => {
    mocks.sendMessage.mockResolvedValue(undefined);

    expect(await settle(checkTabNeedsReload(xTab()))).toBe(true);
    expect(mocks.sendMessage).toHaveBeenCalledTimes(2);
  });

  it('MAIN world 기록이 없으면(mainWorldStart: null) 다시 시도하지 않고 안내한다', async () => {
    mocks.sendMessage.mockResolvedValue({ mainWorldStart: null });

    expect(await checkTabNeedsReload(xTab())).toBe(true);
    expect(mocks.sendMessage).toHaveBeenCalledTimes(1);
  });

  it.each(['interactive', 'complete'])('MAIN world가 %s에 늦게 시작했으면 안내한다', async (readyState) => {
    mocks.sendMessage.mockResolvedValue({ mainWorldStart: { readyState, version: '1.8.2' } });

    expect(await checkTabNeedsReload(xTab())).toBe(true);
  });

  it('x.com·twitter.com이 아닌 탭은 확인하지 않는다', async () => {
    expect(await checkTabNeedsReload(xTab({ url: 'https://example.com/' }))).toBe(false);
    expect(mocks.sendMessage).not.toHaveBeenCalled();
  });

  it('로딩 중인 탭은 확인하지 않는다', async () => {
    expect(await checkTabNeedsReload(xTab({ status: 'loading' }))).toBe(false);
    expect(mocks.sendMessage).not.toHaveBeenCalled();
  });

  it('탭 ID가 없으면 확인하지 않는다', async () => {
    expect(await checkTabNeedsReload(xTab({ id: undefined }))).toBe(false);
    expect(mocks.sendMessage).not.toHaveBeenCalled();
  });
});

describe('initReloadPrompt', () => {
  let promptEl: HTMLElement;
  let buttonEl: HTMLButtonElement;

  beforeEach(() => {
    document.body.innerHTML = `
      <div id="reload-prompt" style="display:none;">
        <span data-i18n="reloadNeeded"></span>
        <button type="button" id="reload-tab-btn" data-i18n="reloadTab"></button>
      </div>`;
    promptEl = document.getElementById('reload-prompt')!;
    buttonEl = document.getElementById('reload-tab-btn') as HTMLButtonElement;
  });

  it('새로고침이 필요한 탭이면 안내를 보여 준다', async () => {
    mocks.query.mockResolvedValue([xTab()]);
    mocks.sendMessage.mockRejectedValue(new Error('Receiving end does not exist'));

    await settle(initReloadPrompt(document, ''));

    expect(promptEl.style.display).toBe('flex');
  });

  it('정상 탭이면 안내를 숨긴 채 둔다', async () => {
    mocks.query.mockResolvedValue([xTab()]);
    mocks.sendMessage.mockResolvedValue(OK_RESPONSE);

    await initReloadPrompt(document, '');

    expect(promptEl.style.display).toBe('none');
  });

  it('x.com이 아닌 탭이면 안내를 숨긴 채 둔다', async () => {
    mocks.query.mockResolvedValue([xTab({ url: 'https://example.com/' })]);

    await initReloadPrompt(document, '');

    expect(promptEl.style.display).toBe('none');
    expect(mocks.sendMessage).not.toHaveBeenCalled();
  });

  it('sourceTabId 탭을 확인하고, 새로고침 버튼도 그 탭을 새로고친다', async () => {
    mocks.get.mockResolvedValue(xTab({ id: 9 }));
    mocks.sendMessage.mockResolvedValue({ mainWorldStart: null });

    await initReloadPrompt(document, '?sourceTabId=9');
    buttonEl.click();

    expect(mocks.sendMessage).toHaveBeenCalledWith(9, { type: MESSAGE_TYPES.RELOAD_PROBE });
    expect(mocks.query).not.toHaveBeenCalled();
    expect(promptEl.style.display).toBe('flex');
    expect(mocks.reload).toHaveBeenCalledWith(9);
  });

  it('새로고침 뒤 탭이 complete가 되면 다시 확인해서 안내를 걷는다', async () => {
    mocks.query.mockResolvedValue([xTab()]);
    mocks.sendMessage.mockResolvedValue({ mainWorldStart: null });
    await initReloadPrompt(document, '');
    expect(promptEl.style.display).toBe('flex');

    buttonEl.click();
    expect(mocks.reload).toHaveBeenCalledWith(5);
    expect(mocks.addUpdatedListener).toHaveBeenCalledTimes(1);
    const onUpdated = mocks.addUpdatedListener.mock.calls[0]![0] as (tabId: number, info: { status?: string }) => Promise<void>;

    // 로딩 중 이벤트·다른 탭 이벤트는 무시한다
    mocks.sendMessage.mockClear();
    await onUpdated(5, { status: 'loading' });
    await onUpdated(99, { status: 'complete' });
    expect(mocks.sendMessage).not.toHaveBeenCalled();
    expect(promptEl.style.display).toBe('flex');

    mocks.get.mockResolvedValue(xTab());
    mocks.sendMessage.mockResolvedValue(OK_RESPONSE);
    await onUpdated(5, { status: 'complete' });

    expect(promptEl.style.display).toBe('none');
    expect(mocks.removeUpdatedListener).toHaveBeenCalledWith(onUpdated);
  });

  it('새로고침해도 여전히 응답이 없으면 안내가 남고 버튼을 다시 누를 수 있다', async () => {
    mocks.query.mockResolvedValue([xTab()]);
    mocks.sendMessage.mockResolvedValue({ mainWorldStart: null });
    await initReloadPrompt(document, '');

    buttonEl.click();
    const onUpdated = mocks.addUpdatedListener.mock.calls[0]![0] as (tabId: number, info: { status?: string }) => Promise<void>;
    mocks.get.mockResolvedValue(xTab());
    await onUpdated(5, { status: 'complete' });
    expect(promptEl.style.display).toBe('flex');

    buttonEl.click();
    expect(mocks.reload).toHaveBeenCalledTimes(2);
    expect(mocks.addUpdatedListener).toHaveBeenCalledTimes(2);
  });
});

describe('팝업 연결', () => {
  const popupSource = readFileSync(resolve(process.cwd(), 'src/popup/index.ts'), 'utf8');
  const html = readFileSync(resolve(process.cwd(), 'entrypoints/popup/index.html'), 'utf8');

  it('팝업 초기화가 새로고침 안내 확인을 시작한다', () => {
    expect(popupSource).toContain('initReloadPrompt');
  });

  it('안내 문장과 버튼 라벨은 번역 키를 쓰는 마크업 두 곳뿐이다', () => {
    expect(html).toContain('id="reload-prompt"');
    expect(html).toContain('data-i18n="reloadNeeded"');
    expect(html).toContain('id="reload-tab-btn"');
    expect(html).toContain('data-i18n="reloadTab"');
  });

  it('안내 문구가 ko/en/ja에 있다', () => {
    expect(t('reloadNeeded', 'ko')).toBe('이 탭을 새로고침해야 적용됩니다');
    expect(t('reloadNeeded', 'en')).not.toBe('reloadNeeded');
    expect(t('reloadNeeded', 'ja')).not.toBe('reloadNeeded');
    expect(t('reloadTab', 'ko')).toBe('새로고침');
    expect(t('reloadTab', 'en')).not.toBe('reloadTab');
    expect(t('reloadTab', 'ja')).not.toBe('reloadTab');
  });
});
