// content script 시작이 background 응답에 묶이지 않는지 본다.
// iOS Orion처럼 background가 내려가거나 메시지에 답하지 않는 환경에서도 파딱 숨김은 시작해야 한다 (#135).
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { DEFAULT_SETTINGS, STORAGE_KEYS } from '@shared/constants';

const { mockStorage, mockSendMessage } = vi.hoisted(() => ({
  mockStorage: {} as Record<string, unknown>,
  mockSendMessage: vi.fn(),
}));

function pick(keys: string | string[] | null): Record<string, unknown> {
  if (keys === null) return { ...mockStorage };
  const list = Array.isArray(keys) ? keys : [keys];
  return Object.fromEntries(list.filter((key) => key in mockStorage).map((key) => [key, mockStorage[key]]));
}

vi.mock('wxt/browser', () => ({
  browser: {
    storage: {
      local: {
        get: vi.fn((keys: string | string[] | null) => Promise.resolve(pick(keys))),
        set: vi.fn((items: Record<string, unknown>) => {
          Object.assign(mockStorage, items);
          return Promise.resolve();
        }),
      },
      onChanged: { addListener: vi.fn() },
    },
    runtime: {
      id: 'test-extension',
      sendMessage: mockSendMessage,
      onMessage: { addListener: vi.fn() },
      getURL: (path: string) => `chrome-extension://test-extension/${path}`,
      getManifest: () => ({ version: '0.0.0' }),
    },
    i18n: { getUILanguage: () => 'ko-KR' },
  },
}));

// 실제 X 화면 캡처: user_1이 파딱 user_2의 트윗을 리트윗했다
const fixture = readFileSync(resolve(process.cwd(), 'tests/fixtures/x-dom/repost-wrapped-social-context.html'), 'utf8');

function tweet(): HTMLElement {
  const article = document.querySelector<HTMLElement>('main article[data-testid="tweet"]');
  if (!article) throw new Error('fixture has no tweet article');
  return article;
}

async function startContentScript(): Promise<void> {
  vi.resetModules();
  await import('../../src/content/index');
}

beforeEach(() => {
  Object.keys(mockStorage).forEach((key) => delete mockStorage[key]);
  mockSendMessage.mockReset();
  // background가 내려가 메시지에 끝내 답하지 않는 상태
  mockSendMessage.mockImplementation(() => new Promise(() => {}));
  window.history.replaceState(null, '', '/home');
  document.body.innerHTML = `<main>${fixture}</main>`;
});

describe('background가 응답하지 않을 때 content script 시작', () => {
  it('파딱 트윗을 숨긴다', async () => {
    await startContentScript();

    await vi.waitFor(() => expect(tweet().hasAttribute('data-bbr-original')).toBe(true), { timeout: 2000 });
  });

  it('저장소의 화이트리스트를 정규화해 적용한다', async () => {
    // 디버그 모드는 판정한 트윗마다 라벨을 붙인다 — 판정이 끝났는지 알 수 있다
    mockStorage[STORAGE_KEYS.SETTINGS] = { ...DEFAULT_SETTINGS, debugMode: true };
    mockStorage[STORAGE_KEYS.WHITELIST] = ['User_2'];
    vi.spyOn(console, 'debug').mockImplementation(() => {});
    vi.spyOn(console, 'info').mockImplementation(() => {});

    await startContentScript();

    await vi.waitFor(() => expect(tweet().querySelector('[data-bbr-debug]')).not.toBeNull(), { timeout: 2000 });
    expect(tweet().hasAttribute('data-bbr-original')).toBe(false);
  });
});
