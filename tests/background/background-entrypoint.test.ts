import { afterEach, describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { MESSAGE_TYPES } from '@shared/constants';

type MessageListener = (message: unknown, sender: unknown, sendResponse: (response?: unknown) => void) => unknown;

const { mockStorage, messageListeners } = vi.hoisted(() => ({
  mockStorage: {} as Record<string, unknown>,
  messageListeners: [] as MessageListener[],
}));

vi.mock('wxt/browser', () => ({
  browser: {
    runtime: {
      onInstalled: { addListener: vi.fn() },
      onMessage: { addListener: (listener: MessageListener) => messageListeners.push(listener) },
      getURL: (path: string) => `chrome-extension://test-extension${path}`,
    },
    storage: {
      local: {
        get: vi.fn((keys: string[] | null) => Promise.resolve(
          keys === null ? { ...mockStorage } : Object.fromEntries(keys.filter((key) => key in mockStorage).map((key) => [key, mockStorage[key]])),
        )),
        set: vi.fn((items: Record<string, unknown>) => {
          Object.assign(mockStorage, items);
          return Promise.resolve();
        }),
        remove: vi.fn(() => Promise.resolve()),
      },
    },
    tabs: { create: vi.fn(), update: vi.fn() },
  },
}));

async function startBackground(): Promise<void> {
  vi.stubGlobal('defineBackground', (main: () => void) => ({ main }));
  vi.spyOn(console, 'info').mockImplementation(() => {});
  const { default: background } = await import('../../entrypoints/background');
  (background as unknown as { main: () => void }).main();
}

function sendWhitelistGet(sendResponse: (response?: unknown) => void): unknown[] {
  return messageListeners.map((listener) => listener({ type: MESSAGE_TYPES.WHITELIST, operation: 'get' }, {}, sendResponse));
}

describe('background whitelist wiring', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
    messageListeners.length = 0;
    Object.keys(mockStorage).forEach((key) => delete mockStorage[key]);
  });

  // 리스너가 돌려준 Promise를 응답으로 쓰는 것은 Chrome 148부터다. 그 전 규약을 따르는 브라우저에서는 답이 undefined가 된다
  it('화이트리스트 요청에 sendResponse로 답하고 응답 채널을 열어 둔다', async () => {
    await startBackground();
    mockStorage['whitelist'] = ['@Foo'];
    const sendResponse = vi.fn();

    const returned = sendWhitelistGet(sendResponse);

    expect(returned).toContain(true);
    await vi.waitFor(() => expect(sendResponse).toHaveBeenCalledWith({ whitelist: ['@foo'] }));
  });

  // 열어 둔 채널에 끝내 답하지 않으면 화이트리스트 화면과 추가 버튼이 응답을 계속 기다린다
  it('저장소 읽기가 실패해도 빈 응답으로 채널을 닫는다', async () => {
    await startBackground();
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    const { browser } = await import('wxt/browser');
    vi.mocked(browser.storage.local.get).mockRejectedValueOnce(new Error('storage failed'));
    const sendResponse = vi.fn();

    sendWhitelistGet(sendResponse);

    await vi.waitFor(() => expect(sendResponse).toHaveBeenCalledWith(undefined));
  });
});

describe('background language wiring', () => {
  it('새로 설치할 때만 브라우저 언어를 저장한다', () => {
    const source = readFileSync(resolve(process.cwd(), 'entrypoints/background.ts'), 'utf8');

    expect(source).toContain("if (details.reason === 'install') void welcomeOnInstall()");
    expect(source).not.toContain('keepLegacyLanguageOnUpdate');
  });
});

describe('background follow list reset wiring', () => {
  // #70: 오염된 v1 팔로우 데이터를 설치·업데이트 때 지운다 (새 코드는 v2 키만 사용)
  it('설치·업데이트 때 v1 팔로우 데이터를 지운다', () => {
    const source = readFileSync(resolve(process.cwd(), 'entrypoints/background.ts'), 'utf8');

    expect(source).toContain("import { removeLegacyFollowData } from '@features/settings/follow-list-reset'");
    expect(source).toContain("if (details.reason === 'install' || details.reason === 'update') void removeLegacyFollowData()");
  });
});

describe('background popup source tab wiring', () => {
  // #121: Firefox Android는 팝업을 탭으로 열어 활성 탭이 팝업 자신이 된다 — 클릭한 탭 ID를 넘긴다
  it('Firefox Android 아이콘 클릭 때 클릭한 탭 ID를 팝업 주소에 싣는다', () => {
    const source = readFileSync(resolve(process.cwd(), 'entrypoints/background.ts'), 'utf8');

    expect(source).toContain("import { buildPopupUrl } from '@shared/utils/popup-source-tab'");
    expect(source).toContain('actionApi.onClicked.addListener((tab) =>');
    expect(source).toContain("buildPopupUrl(browser.runtime.getURL('/popup.html'), tab?.id)");
  });
});

describe('background welcome page wiring', () => {
  // #121: 설치 직후 감사·안내 페이지를 새 탭으로 연다. 이미 열린 X 탭에 코드를 넣지 않는다(scripting 권한 없음)
  it('새로 설치할 때만 환영 페이지를 연다', () => {
    const source = readFileSync(resolve(process.cwd(), 'entrypoints/background.ts'), 'utf8');

    expect(source).toContain("browser.tabs.create({ url: browser.runtime.getURL('/welcome.html') })");
    expect(source).not.toContain('executeScript');
  });

  it('언어를 저장한 뒤에 환영 페이지를 연다', () => {
    const source = readFileSync(resolve(process.cwd(), 'entrypoints/background.ts'), 'utf8');

    expect(source.indexOf('await initLanguageOnInstall()')).toBeLessThan(source.indexOf("getURL('/welcome.html')"));
  });
});
