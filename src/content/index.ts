// src/content/index.ts
// Content script 진입점. 초기화 + 모듈 연결만 담당.
import { FeedObserver, setTweetHiderLanguage } from '@features/content-filter';
import { getSettings as loadSettings, addToWhitelist } from '@features/settings';
import { MESSAGE_TYPES, STORAGE_KEYS, TIMINGS } from '@shared/constants';
import { logger } from '@shared/utils/logger';
import { showFadakProfileBanner, removeFadakBanner } from './fadak-banner';
import { listenForNavigation, setOnNavigate } from './navigation';
import { collectFollowsFromDOM, saveFollowHandles, disconnectFollowObserver, listenForFollowButtonClicks, getMyHandle } from './follow-collector';
import { isProfilePage, getProfileLinkHref } from './page-utils';
import { observeSettingsShortcut } from './settings-shortcut';
import { setSettings, setFollowSet, setWhitelistSet, setCurrentUserHandle, getSettings, getFollowSet, getCurrentUserHandle, isHandleFollowed, isHandleWhitelisted, profileCache, collectorBuffer } from './state';
import { loadFilterRules, flushCollector } from './collector-buffer';
import { processTweet, restoreHiddenTweets, reprocessExistingTweets } from './tweet-orchestrator';
import { listenForMessages } from './message-handler';
import { listenForSettingsChanges } from './storage-listener';

let feedObserver: FeedObserver;

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

  const stored = await chrome.storage.local.get([STORAGE_KEYS.CURRENT_USER_ID, STORAGE_KEYS.FOLLOW_CACHE]);
  const savedHandle = stored[STORAGE_KEYS.CURRENT_USER_ID] as string | null;

  if (savedHandle !== currentHandle) {
    const cache = (stored[STORAGE_KEYS.FOLLOW_CACHE] as Record<string, string[]> | undefined) ?? {};
    const cachedFollows = cache[currentHandle] ?? [];
    await chrome.storage.local.set({
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
  let lastHref = getProfileLinkHref() ?? '';
  setInterval(() => {
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
  feedObserver.disconnect();
  removeFadakBanner();
  if (!window.location.pathname.includes('/following')) {
    disconnectFollowObserver();
  }
  requestAnimationFrame(() => {
    startObserving();
    reprocessExistingTweets();
    showFadakProfileBanner(fadakBannerDeps);
    if (window.location.pathname.includes('/following')) {
      collectFollowsFromDOM(followCollectorDeps);
    }
  });
}

function observeHoverCards(): void {
  const observer = new MutationObserver((mutations) => {
    for (const mutation of mutations) {
      for (const node of mutation.addedNodes) {
        if (!(node instanceof HTMLElement)) continue;
        const card = node.matches('[data-testid="HoverCard"]')
          ? node
          : node.querySelector('[data-testid="HoverCard"]');
        if (!card) continue;
        waitForHoverCardBio(card as HTMLElement);
      }
    }
  });
  observer.observe(document.body, { childList: true, subtree: true });
}

function waitForHoverCardBio(card: HTMLElement): void {
  if (tryExtractBioFromHoverCard(card)) return;
  const inner = new MutationObserver(() => {
    if (tryExtractBioFromHoverCard(card)) inner.disconnect();
  });
  inner.observe(card, { childList: true, subtree: true });
  setTimeout(() => inner.disconnect(), TIMINGS.HOVER_CARD_TIMEOUT);
}

function tryExtractBioFromHoverCard(card: HTMLElement): boolean {
  const bioEl = card.querySelector('[data-testid="UserDescription"]');
  if (!bioEl) return false;
  const bio = bioEl.textContent?.trim() ?? '';
  if (!bio) return false;
  const handleLink = card.querySelector('a[role="link"][href^="/"]');
  if (!handleLink) return false;
  const href = handleLink.getAttribute('href') ?? '';
  const handle = href.slice(1).split('/')[0];
  if (!handle || handle === 'i' || href.includes('/status/')) return false;

  const key = handle.toLowerCase();
  const cached = profileCache.get(key);
  if (cached && !cached.bio) profileCache.set(key, { ...cached, bio });

  const settings = getSettings();
  if (settings.keywordCollectorEnabled) {
    const buffered = collectorBuffer.get(key);
    if (buffered && !buffered.bio) {
      buffered.bio = bio;
      if (settings.debugMode) console.log('[BBR HOVER BIO]', key, '->', bio.slice(0, 40));
    }
  }
  return true;
}

async function init(): Promise<void> {
  const settings = await loadSettings();
  setSettings(settings);
  await loadFilterRules();

  const stored = await chrome.storage.local.get([STORAGE_KEYS.FOLLOW_LIST, STORAGE_KEYS.WHITELIST, STORAGE_KEYS.FOLLOW_CACHE, STORAGE_KEYS.CURRENT_USER_ID]);
  const currentAccount = (stored[STORAGE_KEYS.CURRENT_USER_ID] as string | null) ?? '';
  setCurrentUserHandle(currentAccount || null);
  const cache = (stored[STORAGE_KEYS.FOLLOW_CACHE] as Record<string, string[]> | undefined) ?? {};
  const cachedFollows = currentAccount ? (cache[currentAccount] ?? []) : ((stored[STORAGE_KEYS.FOLLOW_LIST] as string[] | undefined) ?? []);
  setFollowSet(new Set(cachedFollows));
  setWhitelistSet(new Set((stored[STORAGE_KEYS.WHITELIST] as string[] | undefined) ?? []));

  setTweetHiderLanguage(settings.language);
  setDebugFlag(settings.debugMode);
  listenForMessages(followCollectorDeps);
  listenForSettingsChanges(setDebugFlag);
  setInterval(() => { if (getSettings().keywordCollectorEnabled) void flushCollector(); }, TIMINGS.COLLECTOR_FLUSH_INTERVAL);

  window.postMessage({ type: MESSAGE_TYPES.CONTENT_READY }, window.location.origin);

  feedObserver = new FeedObserver(processTweet);
  startObserving();
  reprocessExistingTweets();
  observeHoverCards();

  setOnNavigate(handleNavigate);
  listenForNavigation();
  observeSettingsShortcut();
  collectFollowsFromDOM(followCollectorDeps);
  listenForFollowButtonClicks(followCollectorDeps);

  setTimeout(() => {
    void detectAndHandleAccountSwitch();
    if (!getCurrentUserHandle()) {
      setCurrentUserHandle(getMyHandle());
    }
    showFadakProfileBanner(fadakBannerDeps);
    startAccountSwitchWatcher();
  }, TIMINGS.INITIAL_SETUP_DELAY);

  if (settings.debugMode) {
    const allStorage = await chrome.storage.local.get(null);
    console.log('[BBR STORAGE]', JSON.stringify({
      followCount: ((allStorage['followList'] as string[]) ?? []).length,
      whitelistCount: ((allStorage['whitelist'] as string[]) ?? []).length,
      lastSyncAt: allStorage['lastSyncAt'],
    }));
    logger.info('Blue Badge Remover initialized');
  }
}

if (typeof document !== 'undefined') {
  init();
}
