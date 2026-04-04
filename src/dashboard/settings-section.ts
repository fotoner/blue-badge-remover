import { browser } from 'wxt/browser';
import { STORAGE_KEYS } from '@shared/constants';
import { t, type Language } from '@shared/i18n';
import type { Settings } from '@shared/types';

export function renderSettingsToDOM(settings: Settings): void {
  setChecked('filter-timeline', settings.filter.timeline);
  setChecked('filter-replies', settings.filter.replies);
  setChecked('filter-search', settings.filter.search);
  setChecked('filter-bookmarks', settings.filter.bookmarks);
  setChecked('retweetFilter', settings.retweetFilter);
  setChecked('debugMode', settings.debugMode);
  setChecked('keywordCollectorEnabled', settings.keywordCollectorEnabled);
  setChecked('defaultFilterEnabled', settings.defaultFilterEnabled);

  const langSelect = document.getElementById('language') as HTMLSelectElement;
  langSelect.value = settings.language;

  const hideModeRadio = document.querySelector(
    `input[name="hideMode"][value="${settings.hideMode}"]`,
  ) as HTMLInputElement | null;
  if (hideModeRadio) hideModeRadio.checked = true;

  const quoteModeRadio = document.querySelector(
    `input[name="quoteMode"][value="${settings.quoteMode}"]`,
  ) as HTMLInputElement | null;
  if (quoteModeRadio) quoteModeRadio.checked = true;
}

export async function renderSyncStatus(lang: Language): Promise<void> {
  const stored = await browser.storage.local.get([
    STORAGE_KEYS.LAST_SYNC_AT,
    STORAGE_KEYS.FOLLOW_LIST,
    STORAGE_KEYS.CURRENT_USER_ID,
  ]);

  const lastSync = stored[STORAGE_KEYS.LAST_SYNC_AT] as string | null;
  const followList = (stored[STORAGE_KEYS.FOLLOW_LIST] as string[] | undefined) ?? [];
  const currentAccount = stored[STORAGE_KEYS.CURRENT_USER_ID] as string | null;

  const accountEl = document.getElementById('current-account');
  if (accountEl) {
    accountEl.textContent = currentAccount
      ? t('currentAccount', lang, { account: currentAccount })
      : t('accountNotDetected', lang);
  }

  const localeMap: Record<Language, string> = {
    ko: 'ko-KR',
    en: 'en-US',
    ja: 'ja-JP',
  };
  const timeStr = lastSync
    ? new Date(lastSync).toLocaleString(localeMap[lang])
    : '-';
  const syncEl = document.getElementById('sync-status');
  if (syncEl) syncEl.textContent = t('lastSync', lang, { time: timeStr });

  const countEl = document.getElementById('follow-count');
  if (countEl) {
    countEl.textContent = t('collectedFollows', lang, {
      count: String(followList.length),
    });
  }
}

export function bindSettingsEvents(settings: Settings): void {
  // Sync button
  document.getElementById('sync-btn')?.addEventListener('click', () => {
    void browser.tabs.create({ url: 'https://x.com/following' });
    const btn = document.getElementById('sync-btn') as HTMLButtonElement;
    btn.textContent = t('scrollOnFollowingPage', settings.language);
    setTimeout(() => {
      btn.textContent = t('openFollowingPage', settings.language);
    }, 3000);
  });

  // Whitelist button
  document.getElementById('open-whitelist-btn')?.addEventListener('click', () => {
    void browser.tabs.create({
      url: browser.runtime.getURL('/whitelist.html'),
    });
  });
}

function setChecked(id: string, value: boolean): void {
  const el = document.getElementById(id) as HTMLInputElement | null;
  if (el) el.checked = value;
}
