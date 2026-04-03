// src/content/storage-listener.ts
// chrome.storage.onChanged 리스너: 설정/팔로우/화이트리스트/필터 변경 시 반응.
import { setTweetHiderLanguage } from '@features/content-filter';
import { STORAGE_KEYS } from '@shared/constants';
import type { Settings } from '@shared/types';
import { getSettings, setSettings, setFollowSet, setWhitelistSet } from './state';
import { restoreHiddenTweets, reprocessExistingTweets } from './tweet-orchestrator';
import { loadFilterRules, flushCollector } from './collector-buffer';
import { removeFadakBanner } from './fadak-banner';

export function listenForSettingsChanges(setDebugFlag: (enabled: boolean) => void): void {
  chrome.storage.onChanged.addListener((changes) => {
    const settingsChange = changes[STORAGE_KEYS.SETTINGS];
    if (settingsChange) {
      handleSettingsChange(settingsChange.newValue as Settings, setDebugFlag);
    }
    if (changes[STORAGE_KEYS.FOLLOW_LIST]) {
      handleFollowListChange(changes[STORAGE_KEYS.FOLLOW_LIST].newValue as string[]);
    }
    if (changes[STORAGE_KEYS.WHITELIST]) {
      handleWhitelistChange(changes[STORAGE_KEYS.WHITELIST].newValue as string[]);
    }
    if (changes[STORAGE_KEYS.CUSTOM_FILTER_LIST]) {
      void loadFilterRules().then(() => { restoreHiddenTweets(); reprocessExistingTweets(); });
    }
    if (changes[STORAGE_KEYS.DISABLED_FILTER_CATEGORIES]) {
      void loadFilterRules().then(() => { restoreHiddenTweets(); reprocessExistingTweets(); });
    }
  });
}

function handleSettingsChange(newSettings: Settings, setDebugFlag: (enabled: boolean) => void): void {
  const prev = getSettings();
  setSettings(newSettings);
  setTweetHiderLanguage(newSettings.language);
  setDebugFlag(newSettings.debugMode);

  if (prev.keywordCollectorEnabled && !newSettings.keywordCollectorEnabled) {
    void flushCollector();
  }

  const needsReprocess =
    prev.enabled !== newSettings.enabled ||
    prev.keywordFilterEnabled !== newSettings.keywordFilterEnabled ||
    prev.retweetFilter !== newSettings.retweetFilter ||
    prev.hideMode !== newSettings.hideMode ||
    prev.quoteMode !== newSettings.quoteMode ||
    prev.filter.timeline !== newSettings.filter.timeline ||
    prev.filter.replies !== newSettings.filter.replies ||
    prev.filter.search !== newSettings.filter.search ||
    prev.filter.bookmarks !== newSettings.filter.bookmarks;

  if (needsReprocess) {
    restoreHiddenTweets();
    reprocessExistingTweets();
  }

  if (prev.defaultFilterEnabled !== newSettings.defaultFilterEnabled) {
    void loadFilterRules().then(() => { restoreHiddenTweets(); reprocessExistingTweets(); });
  }
}

function handleFollowListChange(newFollowList: string[]): void {
  setFollowSet(new Set(newFollowList));
  const pathHandle = window.location.pathname.split('/')[1]?.toLowerCase();
  if (pathHandle && newFollowList.map((h) => h.toLowerCase()).includes(pathHandle)) {
    removeFadakBanner();
  }
}

function handleWhitelistChange(newWhitelist: string[]): void {
  setWhitelistSet(new Set(newWhitelist));
  restoreHiddenTweets();
  reprocessExistingTweets();
}
