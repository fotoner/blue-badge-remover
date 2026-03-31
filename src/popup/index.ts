import { getSettings, saveSettings } from '@features/settings';
import { STORAGE_KEYS } from '@shared/constants';
import { t, type Language } from '@shared/i18n';
import type { Settings } from '@shared/types';

let settings: Settings;

async function init(): Promise<void> {
  settings = await getSettings();
  renderSettings();
  applyTranslations();
  renderSyncStatus();
  bindEvents();
}

function applyTranslations(): void {
  const lang = settings.language;

  document.querySelectorAll('[data-i18n]').forEach((el) => {
    const key = el.getAttribute('data-i18n');
    if (key) {
      el.textContent = t(key as Parameters<typeof t>[0], lang);
    }
  });

  document.querySelectorAll('[data-i18n-placeholder]').forEach((el) => {
    const key = el.getAttribute('data-i18n-placeholder');
    if (key && el instanceof HTMLInputElement) {
      el.placeholder = t(key as Parameters<typeof t>[0], lang);
    }
  });
}

function renderSettings(): void {
  (document.getElementById('enabled') as HTMLInputElement).checked = settings.enabled;
  (document.getElementById('filter-timeline') as HTMLInputElement).checked = settings.filter.timeline;
  (document.getElementById('filter-replies') as HTMLInputElement).checked = settings.filter.replies;
  (document.getElementById('filter-search') as HTMLInputElement).checked = settings.filter.search;
  (document.getElementById('retweetFilter') as HTMLInputElement).checked = settings.retweetFilter;
  (document.getElementById('debugMode') as HTMLInputElement).checked = settings.debugMode;

  const languageSelect = document.getElementById('language') as HTMLSelectElement;
  languageSelect.value = settings.language;

  const hideModeRadio = document.querySelector(`input[name="hideMode"][value="${settings.hideMode}"]`) as HTMLInputElement | null;
  if (hideModeRadio) hideModeRadio.checked = true;

  const quoteModeRadio = document.querySelector(`input[name="quoteMode"][value="${settings.quoteMode}"]`) as HTMLInputElement | null;
  if (quoteModeRadio) quoteModeRadio.checked = true;

  (document.getElementById('keywordFilterEnabled') as HTMLInputElement).checked =
    settings.keywordFilterEnabled;
  (document.getElementById('keywordCollectorEnabled') as HTMLInputElement).checked =
    settings.keywordCollectorEnabled;
  const filterModeGroup = document.getElementById('filter-mode-group') as HTMLElement;
  filterModeGroup.style.display = settings.keywordFilterEnabled ? 'block' : 'none';
}

async function renderSyncStatus(): Promise<void> {
  const lang = settings.language;
  const stored = await chrome.storage.local.get([STORAGE_KEYS.LAST_SYNC_AT, STORAGE_KEYS.FOLLOW_LIST, STORAGE_KEYS.CURRENT_USER_ID]);
  const lastSync = stored[STORAGE_KEYS.LAST_SYNC_AT] as string | null;
  const followList = (stored[STORAGE_KEYS.FOLLOW_LIST] as string[] | undefined) ?? [];
  const currentAccount = stored[STORAGE_KEYS.CURRENT_USER_ID] as string | null;
  const accountEl = document.getElementById('current-account');
  if (accountEl) {
    accountEl.textContent = currentAccount
      ? t('currentAccount', lang, { account: currentAccount })
      : t('accountNotDetected', lang);
  }

  const localeMap: Record<Language, string> = { ko: 'ko-KR', en: 'en-US', ja: 'ja-JP' };
  const timeStr = lastSync ? new Date(lastSync).toLocaleString(localeMap[lang]) : '-';
  document.getElementById('sync-status')!.textContent = t('lastSync', lang, { time: timeStr });

  const countEl = document.getElementById('follow-count');
  if (countEl) {
    countEl.textContent = t('collectedFollows', lang, { count: String(followList.length) });
  }
}

function bindEvents(): void {
  const save = async (): Promise<void> => {
    settings.enabled = (document.getElementById('enabled') as HTMLInputElement).checked;
    settings.filter.timeline = (document.getElementById('filter-timeline') as HTMLInputElement).checked;
    settings.filter.replies = (document.getElementById('filter-replies') as HTMLInputElement).checked;
    settings.filter.search = (document.getElementById('filter-search') as HTMLInputElement).checked;
    settings.retweetFilter = (document.getElementById('retweetFilter') as HTMLInputElement).checked;
    settings.debugMode = (document.getElementById('debugMode') as HTMLInputElement).checked;
    settings.language = (document.getElementById('language') as HTMLSelectElement).value as Settings['language'];
    settings.hideMode = (document.querySelector('input[name="hideMode"]:checked') as HTMLInputElement).value as Settings['hideMode'];
    settings.quoteMode = (document.querySelector('input[name="quoteMode"]:checked') as HTMLInputElement).value as Settings['quoteMode'];
    settings.keywordFilterEnabled = (
      document.getElementById('keywordFilterEnabled') as HTMLInputElement
    ).checked;
    settings.keywordCollectorEnabled = (
      document.getElementById('keywordCollectorEnabled') as HTMLInputElement
    ).checked;
    await saveSettings(settings);
  };

  document.querySelectorAll('input').forEach((input) => {
    input.addEventListener('change', save);
  });

  const languageSelect = document.getElementById('language') as HTMLSelectElement;
  languageSelect.addEventListener('change', async () => {
    await save();
    applyTranslations();
    await renderSyncStatus();
  });

  document.getElementById('sync-btn')!.addEventListener('click', async () => {
    const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
    const currentTab = tabs[0];
    if (currentTab?.id) {
      await chrome.tabs.create({ url: 'https://x.com/following', active: true });
    }
    const btn = document.getElementById('sync-btn') as HTMLButtonElement;
    btn.textContent = t('scrollOnFollowingPage', settings.language);
    setTimeout(() => { btn.textContent = t('openFollowingPage', settings.language); }, 3000);
  });

  document.getElementById('open-whitelist-btn')!.addEventListener('click', () => {
    void chrome.tabs.create({ url: chrome.runtime.getURL('src/whitelist/index.html') });
  });

  document.getElementById('clear-cache-btn')!.addEventListener('click', async () => {
    const stored = await chrome.storage.local.get([STORAGE_KEYS.CURRENT_USER_ID, STORAGE_KEYS.FOLLOW_CACHE]);
    const currentAccount = stored[STORAGE_KEYS.CURRENT_USER_ID] as string | null;
    if (!currentAccount) return;
    const cache = (stored[STORAGE_KEYS.FOLLOW_CACHE] as Record<string, string[]> | undefined) ?? {};
    delete cache[currentAccount];
    await chrome.storage.local.set({
      [STORAGE_KEYS.FOLLOW_CACHE]: cache,
      [STORAGE_KEYS.FOLLOW_LIST]: [],
      [STORAGE_KEYS.LAST_SYNC_AT]: null,
    });
    await renderSyncStatus();
    const btn = document.getElementById('clear-cache-btn') as HTMLButtonElement;
    btn.textContent = t('clearCacheDone', settings.language);
    setTimeout(() => { btn.textContent = t('clearFollowCache', settings.language); }, 2000);
  });

  document.getElementById('keywordFilterEnabled')!.addEventListener('change', async () => {
    const enabled = (document.getElementById('keywordFilterEnabled') as HTMLInputElement).checked;
    const filterModeGroup = document.getElementById('filter-mode-group') as HTMLElement;
    filterModeGroup.style.display = enabled ? 'block' : 'none';
    await save();
  });

  document.getElementById('open-options-btn')!.addEventListener('click', () => {
    chrome.runtime.openOptionsPage();
  });

  document.getElementById('open-collector-btn')!.addEventListener('click', () => {
    void chrome.tabs.create({ url: chrome.runtime.getURL('src/collector/index.html') });
  });
}

init();
