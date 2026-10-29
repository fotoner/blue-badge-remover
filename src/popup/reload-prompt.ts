// src/popup/reload-prompt.ts
// 설치·업데이트 직후 이미 열려 있던 X 탭은 새 content script가 없다 — 팝업에서 새로고침을 안내한다 (#121).
import { browser, type Browser } from 'wxt/browser';
import { MESSAGE_TYPES, TIMINGS, X_CONTENT_HOSTS } from '@shared/constants';
import { parseReloadProbeResponse, type ReloadProbeResponse } from '@shared/utils/reload-probe';
import { parseSourceTabId } from '@shared/utils/popup-source-tab';

type Tab = Browser.tabs.Tab;

const PROMPT_VISIBLE_DISPLAY = 'flex';

/** manifest matches(https://x.com/*, https://twitter.com/*)와 같은 주소인지 — 하위 도메인·다른 포트는 아니다 */
export function isSupportedXUrl(url: string | undefined): boolean {
  if (!url) return false;
  try {
    const parsed = new URL(url);
    return parsed.protocol === 'https:' && (X_CONTENT_HOSTS as readonly string[]).includes(parsed.host);
  } catch {
    return false;
  }
}

/** 팝업이 탭으로 열렸으면 sourceTabId의 탭, 아니면 현재 창의 활성 탭 */
export async function resolveTargetTab(search: string): Promise<Tab | undefined> {
  const sourceTabId = parseSourceTabId(search);
  try {
    if (sourceTabId !== undefined) return await browser.tabs.get(sourceTabId);
    const [active] = await browser.tabs.query({ active: true, currentWindow: true });
    return active;
  } catch {
    return undefined;
  }
}

function wait(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function probeOnce(tabId: number): Promise<ReloadProbeResponse | null> {
  try {
    return parseReloadProbeResponse(await browser.tabs.sendMessage(tabId, { type: MESSAGE_TYPES.RELOAD_PROBE }));
  } catch {
    return null;
  }
}

/** 실패(수신자 없음·빈 응답)면 한 번만 다시 시도한다 */
async function probeTab(tabId: number): Promise<ReloadProbeResponse | null> {
  const first = await probeOnce(tabId);
  if (first) return first;
  await wait(TIMINGS.RELOAD_PROBE_RETRY);
  return probeOnce(tabId);
}

/** X 탭이고 로딩이 끝났을 때만 확인한다 — 응답이 없거나 MAIN world가 늦게 시작했으면 true */
export async function checkTabNeedsReload(tab: Tab): Promise<boolean> {
  if (tab.id === undefined || tab.status !== 'complete' || !isSupportedXUrl(tab.url)) return false;
  const response = await probeTab(tab.id);
  const start = response?.mainWorldStart;
  return !start || start.readyState !== 'loading';
}

async function refreshPrompt(tabId: number, promptEl: HTMLElement): Promise<void> {
  try {
    const needsReload = await checkTabNeedsReload(await browser.tabs.get(tabId));
    promptEl.style.display = needsReload ? PROMPT_VISIBLE_DISPLAY : 'none';
  } catch {
    promptEl.style.display = 'none';
  }
}

type UpdatedListener = (tabId: number, changeInfo: { status?: string }) => Promise<void>;

export async function initReloadPrompt(doc: Document = document, search: string = window.location.search): Promise<void> {
  const promptEl = doc.getElementById('reload-prompt');
  const buttonEl = doc.getElementById('reload-tab-btn');
  const tab = await resolveTargetTab(search);
  if (!promptEl || !buttonEl || tab?.id === undefined) return;
  const tabId = tab.id;
  let pending: UpdatedListener | null = null;

  // 새로고침한 탭이 complete가 되면 같은 확인을 다시 해서 안내를 갱신한다
  buttonEl.addEventListener('click', () => {
    if (pending) browser.tabs.onUpdated.removeListener(pending);
    const listener: UpdatedListener = async (updatedTabId, changeInfo) => {
      if (updatedTabId !== tabId || changeInfo.status !== 'complete') return;
      browser.tabs.onUpdated.removeListener(listener);
      pending = null;
      await refreshPrompt(tabId, promptEl);
    };
    pending = listener;
    browser.tabs.onUpdated.addListener(listener);
    void browser.tabs.reload(tabId);
  });

  promptEl.style.display = (await checkTabNeedsReload(tab)) ? PROMPT_VISIBLE_DISPLAY : 'none';
}
