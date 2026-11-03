// 설치·업데이트 직후 이미 열린 X 탭은 새 content script가 없다 — 그 탭 화면에 새로고침 안내를 넣는다 (#121).
// Chrome·Edge만 해당한다. Firefox는 열린 탭에 content script를 다시 넣어 주고, 빌드에 scripting 권한도 없다.
import { browser } from 'wxt/browser';
import { X_CONTENT_HOSTS } from '@shared/constants';
import { t, type Language } from '@shared/i18n';
import { checkTabNeedsReload } from './tab-check';

export type ReloadNoticeReason = 'install' | 'update';

export interface ReloadToastText {
  message: string;
  reload: string;
  close: string;
}

const X_TAB_PATTERNS = X_CONTENT_HOSTS.map((host) => `https://${host}/*`);

export function buildReloadToastText(reason: ReloadNoticeReason, lang: Language): ReloadToastText {
  return {
    message: t(reason === 'install' ? 'reloadToastInstalled' : 'reloadToastUpdated', lang),
    reload: t('reloadTab', lang),
    close: t('dismiss', lang),
  };
}

/** 새로고침이 필요한 X 탭마다 안내를 넣고, 넣은 탭 수를 돌려준다 */
export async function notifyOpenXTabs(text: ReloadToastText, show: (text: ReloadToastText) => void): Promise<number> {
  const scripting = browser.scripting as typeof browser.scripting | undefined;
  if (!scripting) return 0;
  const tabs = await browser.tabs.query({ url: X_TAB_PATTERNS });
  const shown = await Promise.all(tabs.map(async (tab) => {
    if (tab.id === undefined || !(await checkTabNeedsReload(tab))) return false;
    try {
      await scripting.executeScript({ target: { tabId: tab.id }, func: show, args: [text] });
      return true;
    } catch {
      // 그사이 닫혔거나 넣을 수 없는 탭 — 다시 열면 새 content script가 들어간다
      return false;
    }
  }));
  return shown.filter(Boolean).length;
}
