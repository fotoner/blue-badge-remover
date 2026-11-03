// 이 X 탭에 새 content script가 제때 들어갔는지 확인한다 — 팝업 안내와 설치·업데이트 직후 안내가 같이 쓴다 (#121).
import { browser, type Browser } from 'wxt/browser';
import { MESSAGE_TYPES, TIMINGS, X_CONTENT_HOSTS } from '@shared/constants';
import { parseReloadProbeResponse, type ReloadProbeResponse } from '@shared/utils/reload-probe';

type Tab = Browser.tabs.Tab;

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
