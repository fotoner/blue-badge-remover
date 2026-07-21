// src/content/storage-listener.ts
// browser.storage.onChanged 리스너: 설정/팔로우/화이트리스트/필터 변경 시 반응.
import { browser } from 'wxt/browser';
import { setTweetHiderLanguage } from '@features/content-filter';
import { STORAGE_KEYS } from '@shared/constants';
import type { Settings } from '@shared/types';
import { getFollowSet, getSettings, setSettings, setFollowSet, setWhitelistSet, setProtectedKeywords } from './state';
import { restoreHiddenTweets, reprocessExistingTweets } from './tweet-orchestrator';
import { flushCollector } from './collector-buffer';
import { loadFilterRules } from './filter-pipeline';
import { removeFadakBanner } from './fadak-banner';
import { scheduleFollowReprocess } from './message-handler';

export function listenForSettingsChanges(
  setDebugFlag: (enabled: boolean) => void,
  onSettingsChanged: (settings: Settings) => void = () => {},
): void {
  browser.storage.onChanged.addListener((changes) => {
    const settingsChange = changes[STORAGE_KEYS.SETTINGS];
    if (settingsChange) {
      handleSettingsChange(settingsChange.newValue as Settings, setDebugFlag, onSettingsChanged);
    }
    const followChange = changes[STORAGE_KEYS.FOLLOW_LIST];
    if (followChange?.newValue) {
      handleFollowListChange(followChange.newValue as string[], followChange.oldValue as string[] | undefined);
    }
    const whitelistChange = changes[STORAGE_KEYS.WHITELIST];
    if (whitelistChange?.newValue) {
      handleWhitelistChange(whitelistChange.newValue as string[]);
    }
    if (changes[STORAGE_KEYS.CUSTOM_FILTER_LIST]) {
      void loadFilterRules().then(() => { restoreHiddenTweets(); reprocessExistingTweets(); });
    }
    if (changes[STORAGE_KEYS.DISABLED_FILTER_CATEGORIES]) {
      void loadFilterRules().then(() => { restoreHiddenTweets(); reprocessExistingTweets(); });
    }
    if (changes[STORAGE_KEYS.FILTER_PACKS]) {
      void loadFilterRules().then(() => { restoreHiddenTweets(); reprocessExistingTweets(); });
    }
    const protectedKeywordsChange = changes[STORAGE_KEYS.PROTECTED_KEYWORDS];
    if (protectedKeywordsChange) {
      setProtectedKeywords((protectedKeywordsChange.newValue as string[] | undefined) ?? []);
      restoreHiddenTweets();
      reprocessExistingTweets();
    }
  });
}

function handleSettingsChange(
  newSettings: Settings,
  setDebugFlag: (enabled: boolean) => void,
  onSettingsChanged: (settings: Settings) => void,
): void {
  const prev = getSettings();
  setSettings(newSettings);
  setTweetHiderLanguage(newSettings.language);
  setDebugFlag(newSettings.debugMode);
  onSettingsChanged(newSettings);

  if (prev.keywordCollectorEnabled && !newSettings.keywordCollectorEnabled) {
    void flushCollector();
  }

  const needsReprocess =
    prev.enabled !== newSettings.enabled ||
    prev.keywordFilterEnabled !== newSettings.keywordFilterEnabled ||
    prev.aggressorFilterEnabled !== newSettings.aggressorFilterEnabled ||
    prev.retweetFilter !== newSettings.retweetFilter ||
    prev.hideMode !== newSettings.hideMode ||
    prev.quoteMode !== newSettings.quoteMode ||
    prev.filter.timeline !== newSettings.filter.timeline ||
    prev.filter.replies !== newSettings.filter.replies ||
    prev.filter.search !== newSettings.filter.search ||
    prev.filter.bookmarks !== newSettings.filter.bookmarks ||
    prev.filter.lists !== newSettings.filter.lists;

  if (needsReprocess) {
    restoreHiddenTweets();
    reprocessExistingTweets();
  }

  if (prev.defaultFilterEnabled !== newSettings.defaultFilterEnabled) {
    void loadFilterRules().then(() => { restoreHiddenTweets(); reprocessExistingTweets(); });
  }
}

function handleFollowListChange(newFollowList: string[], oldFollowList: string[] | undefined): void {
  const knownBeforeStorageEvent = getFollowSet();
  setFollowSet(new Set(newFollowList));
  const pathHandle = window.location.pathname.split('/')[1]?.toLowerCase();
  if (pathHandle && newFollowList.map((h) => h.toLowerCase()).includes(pathHandle)) {
    removeFadakBanner();
  }

  // Defect 3 수정: 팔로우 버튼 클릭이나 다른 탭에서의 팔로우로 STORAGE_KEYS.FOLLOW_LIST가
  // 바뀐 경우, 이전에는 Set만 재구성하고 끝나서 이미 숨겨진 트윗이 복원되지 않았다.
  // added(새로 추가된 핸들)가 있을 때만 공유 디바운스로 restore+reprocess를 예약한다 —
  // 삭제만 있는 변경(언팔로우)은 재처리가 필요 없다.
  const oldSet = new Set((oldFollowList ?? []).map((h) => h.toLowerCase()));
  const added = newFollowList.filter((h) => {
    const normalized = h.toLowerCase();
    return !oldSet.has(normalized) && !knownBeforeStorageEvent.has(normalized);
  });
  if (added.length > 0) {
    scheduleFollowReprocess(added);
  }
}

function handleWhitelistChange(newWhitelist: string[]): void {
  setWhitelistSet(new Set(newWhitelist.map((h) => h.toLowerCase())));
  restoreHiddenTweets();
  reprocessExistingTweets();
}
