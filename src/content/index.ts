// src/content/index.ts
import { BadgeCache, parseBadgeInfo, detectBadgeSvg } from '@features/badge-detection';
import { FeedObserver, shouldHideTweet, shouldHideRetweet, getQuoteAction, hideTweet, hideQuoteBlock, setTweetHiderLanguage } from '@features/content-filter';
import { getSettings } from '@features/settings';
import { MESSAGE_TYPES, STORAGE_KEYS } from '@shared/constants';
import type { Settings } from '@shared/types';
import { logger } from '@shared/utils/logger';
import { showFadakProfileBanner, removeFadakBanner } from './fadak-banner';
import { listenForNavigation, setOnNavigate } from './navigation';
import { collectFollowsFromDOM, saveFollowHandles, getMyHandle, disconnectFollowObserver } from './follow-collector';
import { extractTweetAuthor, extractRetweeterName, findQuoteBlock, extractQuoteAuthor, extractDisplayName, formatUserLabel, addDebugLabel } from './tweet-processing';
import { isProfilePage, getPageType } from './page-utils';

const badgeCache = new BadgeCache();
let currentSettings: Settings;
let followSet = new Set<string>(); // lowercase handle
let whitelistSet = new Set<string>(); // @handle format
let feedObserver: FeedObserver;

async function init(): Promise<void> {
  currentSettings = await getSettings();

  const stored = await chrome.storage.local.get([STORAGE_KEYS.FOLLOW_LIST, STORAGE_KEYS.WHITELIST, STORAGE_KEYS.FOLLOW_CACHE, STORAGE_KEYS.CURRENT_USER_ID]);
  const currentAccount = (stored[STORAGE_KEYS.CURRENT_USER_ID] as string | null) ?? '';
  const cache = (stored[STORAGE_KEYS.FOLLOW_CACHE] as Record<string, string[]> | undefined) ?? {};
  const cachedFollows = currentAccount ? (cache[currentAccount] ?? []) : ((stored[STORAGE_KEYS.FOLLOW_LIST] as string[] | undefined) ?? []);
  followSet = new Set(cachedFollows);
  const whitelist = (stored[STORAGE_KEYS.WHITELIST] as string[] | undefined) ?? [];
  whitelistSet = new Set(whitelist);

  setTweetHiderLanguage(currentSettings.language);
  setDebugFlag(currentSettings.debugMode);
  injectFetchInterceptor();
  listenForMessages();
  listenForSettingsChanges();

  feedObserver = new FeedObserver(processTweet);
  startObserving();

  setOnNavigate(handleNavigate);
  listenForNavigation();
  collectFollowsFromDOM(followCollectorDeps);
  listenForFollowButtonClicks();

  setTimeout(() => {
    detectAndHandleAccountSwitch();
    showFadakProfileBanner(fadakBannerDeps);
  }, 3000);

  if (currentSettings.debugMode) {
    const allStorage = await chrome.storage.local.get(null);
    console.log('[BBR STORAGE]', JSON.stringify({
      followCount: ((allStorage['followList'] as string[]) ?? []).length,
      whitelistCount: ((allStorage['whitelist'] as string[]) ?? []).length,
      token: allStorage['token'] ? 'SET' : 'UNSET',
      lastSyncAt: allStorage['lastSyncAt'],
    }));
  }
  if (currentSettings.debugMode) logger.info('Blue Badge Remover initialized');
}

function setDebugFlag(enabled: boolean): void {
  window.postMessage({ type: 'BBR_SET_DEBUG', enabled }, window.location.origin);
}

function injectFetchInterceptor(): void {
  const script = document.createElement('script');
  script.src = chrome.runtime.getURL('fetch-interceptor.js');
  (document.head ?? document.documentElement).appendChild(script);
  script.onload = () => script.remove();
}

function listenForMessages(): void {
  window.addEventListener('message', (event) => {
    if (event.source !== window || event.origin !== window.location.origin) return;

    if (event.data?.type === MESSAGE_TYPES.BADGE_DATA) {
      for (const userData of event.data.users) {
        const badge = parseBadgeInfo(userData);
        if (badge) {
          badgeCache.set(badge.userId, badge.isBluePremium);
        }
      }
    }

    if (event.data?.type === MESSAGE_TYPES.FOLLOW_DATA) {
      const myHandle = getMyHandle();
      const pathUser = window.location.pathname.split('/')[1]?.toLowerCase();
      if (myHandle && pathUser && pathUser !== myHandle) return;
      const handles = event.data.handles as string[];
      if (handles?.length) {
        void saveFollowHandles(handles, followCollectorDeps);
      }
    }
  });
}

function listenForSettingsChanges(): void {
  chrome.storage.onChanged.addListener((changes) => {
    const settingsChange = changes[STORAGE_KEYS.SETTINGS];
    if (settingsChange) {
      currentSettings = settingsChange.newValue as Settings;
      setTweetHiderLanguage(currentSettings.language);
    }
    const followChange = changes[STORAGE_KEYS.FOLLOW_LIST];
    if (followChange) {
      followSet = new Set(followChange.newValue as string[]);
    }
    const whitelistChange = changes[STORAGE_KEYS.WHITELIST];
    if (whitelistChange) {
      whitelistSet = new Set(whitelistChange.newValue as string[]);
    }
  });
}

function isHandleFollowed(handle: string): boolean {
  return followSet.has(handle.toLowerCase());
}

function isHandleWhitelisted(handle: string): boolean {
  return whitelistSet.has('@' + handle.toLowerCase());
}

const fadakBannerDeps = {
  isProfilePage,
  isHandleFollowed,
  isHandleWhitelisted,
  getCurrentSettings: () => currentSettings,
};

const followCollectorDeps = {
  getCurrentSettings: () => currentSettings,
  setFollowSet: (set: Set<string>) => { followSet = set; },
};

async function detectAndHandleAccountSwitch(): Promise<void> {
  const profileLink = document.querySelector('a[data-testid="AppTabBar_Profile_Link"]');
  if (!profileLink) return;
  const href = profileLink.getAttribute('href');
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
    followSet = new Set(cachedFollows);
    if (currentSettings.debugMode) logger.info('Account switched', { from: savedHandle, to: currentHandle, cachedFollows: cachedFollows.length });
  }
}

function checkFadak(userId: string, element: HTMLElement): boolean {
  let isFadak = badgeCache.get(userId);
  if (isFadak === undefined) {
    isFadak = detectBadgeSvg(element);
    badgeCache.set(userId, isFadak);
  }
  return isFadak;
}

function processTweet(tweetEl: HTMLElement): void {
  if (isProfilePage()) return;
  const author = extractTweetAuthor(tweetEl);
  if (!author) return;

  const { handle, userId } = author;
  const isFadak = checkFadak(userId, tweetEl);
  const displayName = extractDisplayName(tweetEl, handle);
  const userLabel = formatUserLabel(handle, displayName);

  const socialContext = tweetEl.querySelector('[data-testid="socialContext"]');
  const isRetweet = socialContext !== null;
  const inFollow = isHandleFollowed(handle);

  if (currentSettings.debugMode) {
    const hasQuote = !!findQuoteBlock(tweetEl);
    addDebugLabel(tweetEl, { handle: `@${handle}`, isFadak, isRetweet, hasQuote, inFollow, retweeter: isRetweet ? (extractRetweeterName(tweetEl) ?? '?') : undefined });
    console.log('[BBR]', userLabel, { isFadak, isRetweet, inFollow, hasQuote });
  }

  if (isRetweet) {
    const retweeterName = extractRetweeterName(tweetEl) ?? '';
    const originalIsFadak = isFadak;
    if (originalIsFadak) {
      if (isHandleFollowed(handle) || whitelistSet.has(`@${handle}`)) return;
      const hideRetweet = shouldHideRetweet({ settings: currentSettings, isFadak: true, isRetweet: true });
      if (hideRetweet) {
        hideTweet(tweetEl, currentSettings.hideMode, { reason: 'retweet', handle: `@${handle}`, retweetedBy: retweeterName || undefined });
        return;
      }
    }
    return;
  }

  if (isFadak && !inFollow) {
    const hide = shouldHideTweet({ settings: currentSettings, followList: new Set<string>(), whitelist: whitelistSet, isFadak: true, userId, handle: `@${handle}`, pageType: getPageType() });
    if (hide) {
      hideTweet(tweetEl, currentSettings.hideMode, { reason: 'fadak', handle: `@${handle}` });
      return;
    }
  }

  const quoteBlock = findQuoteBlock(tweetEl);
  if (quoteBlock) {
    const quoteAuthor = extractQuoteAuthor(quoteBlock);
    const quotedHandle = quoteAuthor?.handle ?? null;
    const quotedIsFadak = quotedHandle
      ? checkFadak(quotedHandle, quoteBlock)
      : detectBadgeSvg(quoteBlock);
    if (quotedIsFadak && !isHandleFollowed(quotedHandle ?? '') && !whitelistSet.has(`@${quotedHandle ?? ''}`)) {
      const quoteAction = getQuoteAction(currentSettings, true);
      if (quoteAction === 'hide-entire') {
        hideTweet(tweetEl, currentSettings.hideMode, { reason: 'quote-entire', handle: `@${quotedHandle ?? ''}`, quotedBy: userLabel });
        return;
      }
      if (quoteAction === 'hide-quote') {
        hideQuoteBlock(quoteBlock, { handle: `@${quotedHandle ?? ''}` });
        return;
      }
    }
  }
}

function listenForFollowButtonClicks(): void {
  // 팔로우 버튼 클릭 감지: aria-label="팔로우 @handle" 또는 "Following @handle"
  document.addEventListener('click', (e) => {
    const target = e.target as HTMLElement;
    const button = target.closest('button[aria-label]');
    if (!button) return;
    const label = button.getAttribute('aria-label') ?? '';
    const match = label.match(/^(?:팔로우|Follow)\s+@(\S+)$/i);
    if (!match?.[1]) return;
    const handle = match[1].toLowerCase();
    // followSet에 추가 + storage에 저장
    if (!followSet.has(handle)) {
      followSet.add(handle);
      void saveFollowHandles([handle], followCollectorDeps);
      if (currentSettings.debugMode) logger.info('Follow button clicked, added to follow list', { handle });
      // 배너가 있으면 제거 (방금 팔로우했으니까)
      removeFadakBanner();
    }
  }, true);
}

function startObserving(): void {
  const feed = document.querySelector('main') ?? document.body;
  feedObserver.observe(feed);
}

function handleNavigate(): void {
  feedObserver.disconnect();
  removeFadakBanner();
  // Disconnect follow observer when leaving /following page (I4)
  if (!window.location.pathname.includes('/following')) {
    disconnectFollowObserver();
  }
  requestAnimationFrame(() => {
    startObserving();
    reprocessExistingTweets();
    showFadakProfileBanner(fadakBannerDeps);
    // Re-collect follows if navigated to /following
    if (window.location.pathname.includes('/following')) {
      collectFollowsFromDOM(followCollectorDeps);
    }
  });
}

function reprocessExistingTweets(): void {
  const feed = document.querySelector('main') ?? document.body;
  const tweets = feed.querySelectorAll('article[data-testid="tweet"]');
  tweets.forEach((tweet) => {
    if (tweet.querySelector('[data-bbr-debug]')) return;
    try {
      processTweet(tweet as HTMLElement);
    } catch {
      // Ignore individual tweet errors
    }
  });
}

if (typeof document !== 'undefined') {
  init();
}
