// src/content/index.ts
// Content script 진입점. 초기화 + 모듈 연결만 담당.
import { browser } from 'wxt/browser';
import { FeedObserver, setTweetHiderLanguage } from '@features/content-filter';
import { getSettings as loadSettings, addToWhitelist } from '@features/settings';
import { MESSAGE_TYPES, STORAGE_KEYS, TIMINGS } from '@shared/constants';
import { logger } from '@shared/utils/logger';
import { showFadakProfileBanner, showFadakDetailBanner, removeFadakBanner } from './fadak-banner';
import { listenForNavigation, setOnNavigate } from './navigation';
import { collectFollowsFromDOM, disconnectFollowObserver, listenForFollowButtonClicks, getMyHandle } from './follow-collector';
import { isProfilePage, getProfileLinkHref } from './page-utils';
import { observeSettingsShortcut } from './settings-shortcut';
import { setSettings, setFollowSet, setWhitelistSet, setProtectedKeywords, setCurrentUserHandle, getSettings, getFollowSet, isHandleFollowed, isHandleWhitelisted, profileCache, collectorBuffer } from './state';
import { flushCollector } from './collector-buffer';
import { loadFilterRules } from './filter-pipeline';
import { processTweet, restoreHiddenTweets, reprocessExistingTweets, applyCurrentUserFallback } from './tweet-orchestrator';
import { listenForMessages } from './message-handler';
import { listenForSettingsChanges } from './storage-listener';
import { startStatsFlush, flushStats, setOnFlush } from '@features/stats';
import { checkMilestone } from './milestone-banner';
import { HoverCardObserver } from './hover-card-observer';

let feedObserver: FeedObserver;
let accountSwitchTimerId: ReturnType<typeof setInterval> | null = null;
let collectorFlushTimerId: ReturnType<typeof setInterval> | null = null;
const hoverCardObserver = new HoverCardObserver(handleHoverCardBio);

function setDebugFlag(enabled: boolean): void {
  window.postMessage({ type: 'BBR_SET_DEBUG', enabled }, window.location.origin);
}

const fadakBannerDeps = {
  isProfilePage,
  isHandleFollowed,
  isHandleWhitelisted,
  getCurrentSettings: () => getSettings(),
  addToWhitelist,
};

const followCollectorDeps = {
  getCurrentSettings: () => getSettings(),
  setFollowSet: (set: Set<string>) => { setFollowSet(set); },
  getFollowSet: () => getFollowSet(),
  onFollowed: () => { removeFadakBanner(); },
  onUnfollowed: () => { showFadakProfileBanner(fadakBannerDeps); },
};

async function detectAndHandleAccountSwitch(): Promise<void> {
  const href = getProfileLinkHref();
  if (!href) return;
  const currentHandle = href.slice(1).toLowerCase();
  if (!currentHandle) return;

  const stored = await browser.storage.local.get([STORAGE_KEYS.CURRENT_USER_ID, STORAGE_KEYS.FOLLOW_CACHE]);
  const savedHandle = stored[STORAGE_KEYS.CURRENT_USER_ID] as string | null;

  if (savedHandle !== currentHandle) {
    const cache = (stored[STORAGE_KEYS.FOLLOW_CACHE] as Record<string, string[]> | undefined) ?? {};
    const cachedFollows = cache[currentHandle] ?? [];
    await browser.storage.local.set({
      [STORAGE_KEYS.CURRENT_USER_ID]: currentHandle,
      [STORAGE_KEYS.FOLLOW_LIST]: cachedFollows,
    });
    setFollowSet(new Set(cachedFollows));
    setCurrentUserHandle(currentHandle);
    const settings = getSettings();
    if (settings.debugMode) logger.info('Account switched', { from: savedHandle, to: currentHandle, cachedFollows: cachedFollows.length });
    restoreHiddenTweets();
    reprocessExistingTweets();
  }
}

function startAccountSwitchWatcher(): void {
  if (accountSwitchTimerId !== null) clearInterval(accountSwitchTimerId);
  let lastHref = getProfileLinkHref() ?? '';
  accountSwitchTimerId = setInterval(() => {
    const href = getProfileLinkHref() ?? '';
    if (href && href !== lastHref) {
      lastHref = href;
      void detectAndHandleAccountSwitch();
    }
  }, TIMINGS.ACCOUNT_SWITCH_POLL);
}

function startObserving(): void {
  const feed = document.querySelector('main') ?? document.body;
  feedObserver.observe(feed);
}

function handleNavigate(): void {
  const settings = getSettings();
  if (settings.keywordCollectorEnabled) void flushCollector();
  void flushStats();
  feedObserver.disconnect();
  removeFadakBanner();
  if (!window.location.pathname.includes('/following')) {
    disconnectFollowObserver();
  }
  requestAnimationFrame(() => {
    startObserving();
    reprocessExistingTweets();
    showFadakProfileBanner(fadakBannerDeps);
    showFadakDetailBanner(fadakBannerDeps);
    if (window.location.pathname.includes('/following')) {
      collectFollowsFromDOM(followCollectorDeps);
    }
  });
}

function handleHoverCardBio(key: string, bio: string): void {
  const cached = profileCache.get(key);
  if (cached && !cached.bio) profileCache.set(key, { ...cached, bio });

  const settings = getSettings();
  if (settings.keywordCollectorEnabled) {
    const buffered = collectorBuffer.get(key);
    if (buffered && !buffered.bio) {
      buffered.bio = bio;
      if (settings.debugMode) logger.debug('Hover card bio received', { handle: key, bioPreview: bio.slice(0, 40) });
    }
  }
}

function syncHoverCardObserver(settings: ReturnType<typeof getSettings>): void {
  const enabled = settings.keywordFilterEnabled || settings.keywordCollectorEnabled;
  hoverCardObserver.sync(enabled, document.body);
}

async function init(): Promise<void> {
  const settings = await loadSettings();
  setSettings(settings);
  await loadFilterRules();

  const stored = await browser.storage.local.get([STORAGE_KEYS.FOLLOW_LIST, STORAGE_KEYS.WHITELIST, STORAGE_KEYS.FOLLOW_CACHE, STORAGE_KEYS.CURRENT_USER_ID, STORAGE_KEYS.PROTECTED_KEYWORDS]);
  const currentAccount = (stored[STORAGE_KEYS.CURRENT_USER_ID] as string | null) ?? '';
  setCurrentUserHandle(currentAccount || null);
  const cache = (stored[STORAGE_KEYS.FOLLOW_CACHE] as Record<string, string[]> | undefined) ?? {};
  const cachedFollows = currentAccount ? (cache[currentAccount] ?? []) : ((stored[STORAGE_KEYS.FOLLOW_LIST] as string[] | undefined) ?? []);
  setFollowSet(new Set(cachedFollows));
  setWhitelistSet(new Set(((stored[STORAGE_KEYS.WHITELIST] as string[] | undefined) ?? []).map((h) => h.toLowerCase())));
  setProtectedKeywords((stored[STORAGE_KEYS.PROTECTED_KEYWORDS] as string[] | undefined) ?? []);

  setTweetHiderLanguage(settings.language);
  setDebugFlag(settings.debugMode);
  listenForMessages(followCollectorDeps);
  listenForSettingsChanges(setDebugFlag, syncHoverCardObserver);
  if (collectorFlushTimerId !== null) clearInterval(collectorFlushTimerId);
  collectorFlushTimerId = setInterval(() => { if (getSettings().keywordCollectorEnabled) void flushCollector(); }, TIMINGS.COLLECTOR_FLUSH_INTERVAL);
  setOnFlush((totalHidden) => void checkMilestone(totalHidden));
  startStatsFlush();
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') void flushStats();
  });

  window.postMessage({ type: MESSAGE_TYPES.CONTENT_READY }, window.location.origin);

  feedObserver = new FeedObserver(processTweet);
  startObserving();
  reprocessExistingTweets();
  syncHoverCardObserver(settings);

  setOnNavigate(handleNavigate);
  listenForNavigation();
  observeSettingsShortcut();
  collectFollowsFromDOM(followCollectorDeps);
  listenForFollowButtonClicks(followCollectorDeps);

  setTimeout(() => {
    void detectAndHandleAccountSwitch();
    applyCurrentUserFallback(getMyHandle);
    showFadakProfileBanner(fadakBannerDeps);
    showFadakDetailBanner(fadakBannerDeps);
    startAccountSwitchWatcher();
  }, TIMINGS.INITIAL_SETUP_DELAY);

  if (settings.debugMode) {
    const allStorage = await browser.storage.local.get(null);
    logger.debug('Storage state', {
      followCount: ((allStorage['followList'] as string[]) ?? []).length,
      whitelistCount: ((allStorage['whitelist'] as string[]) ?? []).length,
      lastSyncAt: allStorage['lastSyncAt'],
    });
    logger.info('Blue Badge Remover initialized');
  }
}

if (typeof document !== 'undefined') {
  init();
}
