// 설치 직후 환영 페이지가 이미 열려 있던 X 탭 중 새로고침이 필요한 탭을 찾고 새로고침한다 (#121).
// 탭에 코드를 넣지 않는다 — tabs.query·sendMessage·reload는 x.com 호스트 권한만으로 된다.
import { browser, type Browser } from 'wxt/browser';
import { X_CONTENT_HOSTS } from '@shared/constants';
import { checkTabNeedsReload } from './tab-check';

type Tab = Browser.tabs.Tab;

const X_TAB_PATTERNS = X_CONTENT_HOSTS.map((host) => `https://${host}/*`);

/** 열린 X 탭 중 새 content script가 응답하지 않는 탭 */
export async function findTabsNeedingReload(): Promise<Tab[]> {
  const tabs = await browser.tabs.query({ url: X_TAB_PATTERNS });
  const needs = await Promise.all(tabs.map((tab) => checkTabNeedsReload(tab)));
  return tabs.filter((_, index) => needs[index]);
}

/** 탭을 새로고침하고, 새로고침한 탭 수를 돌려준다 */
export async function reloadTabs(tabs: Tab[]): Promise<number> {
  const results = await Promise.all(tabs.map(async (tab) => {
    if (tab.id === undefined) return false;
    try {
      await browser.tabs.reload(tab.id);
      return true;
    } catch {
      // 그사이 닫힌 탭 — 다시 열면 새 content script가 들어간다
      return false;
    }
  }));
  return results.filter(Boolean).length;
}
