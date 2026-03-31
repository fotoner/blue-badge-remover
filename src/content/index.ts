// src/content/index.ts
import { BadgeCache, parseBadgeInfo, detectBadgeSvg } from '@features/badge-detection';
import { FeedObserver, shouldHideTweet, shouldHideRetweet, getQuoteAction, hideTweet, hideQuoteBlock, showTweet, setTweetHiderLanguage } from '@features/content-filter';
import { ProfileCache, matchesKeywordFilter, DEFAULT_FILTER_LIST, getCustomFilterList, buildActiveRules } from '@features/keyword-filter';
import { getCollectedFadaks, saveCollectedFadaks } from '@features/keyword-collector';
import { getSettings } from '@features/settings';
import { MESSAGE_TYPES, STORAGE_KEYS } from '@shared/constants';
import type { CollectedFadak, FilterRule, Settings } from '@shared/types';
import { logger } from '@shared/utils/logger';
import { showFadakProfileBanner, removeFadakBanner } from './fadak-banner';
import { listenForNavigation, setOnNavigate } from './navigation';
import { collectFollowsFromDOM, saveFollowHandles, removeFollowHandle, getMyHandle, disconnectFollowObserver, listenForFollowButtonClicks } from './follow-collector';
import { extractTweetAuthor, extractRetweeterName, findQuoteBlock, extractQuoteAuthor, extractDisplayName, extractTweetText, extractBioFromFiber, formatUserLabel, addDebugLabel, hasBadgeInAuthorArea } from './tweet-processing';
import { isProfilePage, getPageType } from './page-utils';

const badgeCache = new BadgeCache();
let currentSettings: Settings;
let followSet = new Set<string>(); // lowercase handle
let whitelistSet = new Set<string>(); // @handle format
let feedObserver: FeedObserver;
const profileCache = new ProfileCache();
let activeFilterRules: FilterRule[] = [];

// Keyword collector buffer — flushed to storage periodically and on navigation
const collectorBuffer = new Map<string, CollectedFadak>();
const MAX_TWEET_TEXTS_PER_USER = 50;

function bufferCollectedFadak(
  userId: string,
  handle: string,
  displayName: string,
  bio: string,
  tweetText: string,
): void {
  const now = Date.now();
  const existing = collectorBuffer.get(userId);
  if (existing) {
    if (displayName) existing.displayName = displayName;
    if (bio) existing.bio = bio;
    if (tweetText && !existing.tweetTexts.includes(tweetText)) {
      existing.tweetTexts.push(tweetText);
      if (existing.tweetTexts.length > MAX_TWEET_TEXTS_PER_USER) existing.tweetTexts.shift();
    }
    existing.lastSeenAt = now;
  } else {
    collectorBuffer.set(userId, {
      userId, handle, displayName, bio,
      tweetTexts: tweetText ? [tweetText] : [],
      firstSeenAt: now,
      lastSeenAt: now,
    });
  }
}

async function flushCollector(): Promise<void> {
  if (collectorBuffer.size === 0) return;
  const existing = await getCollectedFadaks();
  const merged = new Map<string, CollectedFadak>(existing.map((f) => [f.userId, f]));
  for (const entry of collectorBuffer.values()) {
    const prev = merged.get(entry.userId);
    if (prev) {
      if (entry.displayName) prev.displayName = entry.displayName;
      if (entry.bio) prev.bio = entry.bio;
      for (const t of entry.tweetTexts) {
        if (!prev.tweetTexts.includes(t)) {
          prev.tweetTexts.push(t);
          if (prev.tweetTexts.length > MAX_TWEET_TEXTS_PER_USER) prev.tweetTexts.shift();
        }
      }
      prev.lastSeenAt = entry.lastSeenAt;
    } else {
      merged.set(entry.userId, entry);
    }
  }
  await saveCollectedFadaks(Array.from(merged.values()));
}

async function loadFilterRules(): Promise<void> {
  const custom = await getCustomFilterList();
  activeFilterRules = buildActiveRules(currentSettings.defaultFilterEnabled, DEFAULT_FILTER_LIST, custom);
}

async function init(): Promise<void> {
  currentSettings = await getSettings();
  await loadFilterRules();

  const stored = await chrome.storage.local.get([STORAGE_KEYS.FOLLOW_LIST, STORAGE_KEYS.WHITELIST, STORAGE_KEYS.FOLLOW_CACHE, STORAGE_KEYS.CURRENT_USER_ID]);
  const currentAccount = (stored[STORAGE_KEYS.CURRENT_USER_ID] as string | null) ?? '';
  const cache = (stored[STORAGE_KEYS.FOLLOW_CACHE] as Record<string, string[]> | undefined) ?? {};
  const cachedFollows = currentAccount ? (cache[currentAccount] ?? []) : ((stored[STORAGE_KEYS.FOLLOW_LIST] as string[] | undefined) ?? []);
  followSet = new Set(cachedFollows);
  const whitelist = (stored[STORAGE_KEYS.WHITELIST] as string[] | undefined) ?? [];
  whitelistSet = new Set(whitelist);

  setTweetHiderLanguage(currentSettings.language);
  setDebugFlag(currentSettings.debugMode); // interceptor already loaded via document_start content script
  listenForMessages();
  listenForSettingsChanges();
  setInterval(() => { if (currentSettings.keywordCollectorEnabled) void flushCollector(); }, 5000);

  // Signal to fetch interceptor (MAIN world) that we're ready to receive messages.
  // This triggers a replay of any profiles cached before our listener was registered.
  window.postMessage({ type: MESSAGE_TYPES.CONTENT_READY }, window.location.origin);

  feedObserver = new FeedObserver(processTweet);
  startObserving();
  reprocessExistingTweets(); // Scan tweets already in DOM before observer started
  observeHoverCards();

  setOnNavigate(handleNavigate);
  listenForNavigation();
  collectFollowsFromDOM(followCollectorDeps);
  listenForFollowButtonClicks(followCollectorDeps);

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

    if (event.data?.type === MESSAGE_TYPES.PROFILE_DATA) {
      for (const p of event.data.profiles as Array<{
        userId: string;
        handle: string;
        displayName: string;
        bio: string;
      }>) {
        // Key by lowercase handle so processTweet lookups (which use handle) hit the cache
        const key = p.handle.toLowerCase();
        profileCache.set(key, { handle: p.handle, displayName: p.displayName, bio: p.bio });
        // Back-fill bio for already-buffered collector entries (same key as collectorBuffer)
        if (currentSettings.keywordCollectorEnabled) {
          const buffered = collectorBuffer.get(key);
          if (buffered) {
            if (p.bio && !buffered.bio) {
              if (currentSettings.debugMode) console.log('[BBR BIO BACKFILL]', key, '->', p.bio.slice(0, 40));
              buffered.bio = p.bio;
            }
            if (p.displayName) buffered.displayName = p.displayName;
          }
        }
      }
      if (currentSettings.debugMode) {
        const withBio = (event.data.profiles as Array<{ handle: string; bio: string }>).filter((p) => p.bio);
        if (withBio.length > 0) console.log('[BBR PROFILE_DATA bios]', withBio.map((p) => `${p.handle}: ${p.bio.slice(0, 30)}`));
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
      const prev = currentSettings;
      currentSettings = settingsChange.newValue as Settings;
      setTweetHiderLanguage(currentSettings.language);
      setDebugFlag(currentSettings.debugMode);
      if (prev.keywordCollectorEnabled && !currentSettings.keywordCollectorEnabled) {
        void flushCollector();
      }
      const modeChanged =
        prev.keywordFilterEnabled !== currentSettings.keywordFilterEnabled;
      if (modeChanged) {
        restoreHiddenTweets();
        reprocessExistingTweets();
      }
      const defaultFilterChanged =
        prev.defaultFilterEnabled !== currentSettings.defaultFilterEnabled;
      if (defaultFilterChanged) {
        void loadFilterRules().then(() => {
          restoreHiddenTweets();
          reprocessExistingTweets();
        });
      }
    }
    const followChange = changes[STORAGE_KEYS.FOLLOW_LIST];
    if (followChange) {
      followSet = new Set(followChange.newValue as string[]);
    }
    const whitelistChange = changes[STORAGE_KEYS.WHITELIST];
    if (whitelistChange) {
      whitelistSet = new Set(whitelistChange.newValue as string[]);
    }
    const filterListChange = changes[STORAGE_KEYS.CUSTOM_FILTER_LIST];
    if (filterListChange) {
      void loadFilterRules().then(() => {
        restoreHiddenTweets();
        reprocessExistingTweets();
      });
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
  getFollowSet: () => followSet,
  onFollowed: (_handle: string) => {
    removeFadakBanner();
  },
  onUnfollowed: (_handle: string) => {
    showFadakProfileBanner(fadakBannerDeps);
  },
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
      const cachedProfile = profileCache.get(handle.toLowerCase());
      const fiberBio = cachedProfile?.bio || extractBioFromFiber(tweetEl, handle);
      if (currentSettings.keywordCollectorEnabled && hasBadgeInAuthorArea(tweetEl)) {
        const profile = cachedProfile ?? { handle, displayName: extractDisplayName(tweetEl, handle) ?? handle, bio: fiberBio };
        bufferCollectedFadak(handle.toLowerCase(), handle, profile.displayName, profile.bio || fiberBio, extractTweetText(tweetEl));
      }
      if (currentSettings.keywordFilterEnabled) {
        const profile = cachedProfile ?? {
          handle,
          displayName: extractDisplayName(tweetEl, handle) ?? handle,
          bio: fiberBio,
        };
        const tweetText = extractTweetText(tweetEl);
        const { matched } = matchesKeywordFilter(profile, activeFilterRules, tweetText);
        if (!matched) return;
      }
      const hideRetweet = shouldHideRetweet({ settings: currentSettings, isFadak: true, isRetweet: true });
      if (hideRetweet) {
        hideTweet(tweetEl, currentSettings.hideMode, { reason: 'retweet', handle: `@${handle}`, retweetedBy: retweeterName || undefined });
        return;
      }
    }
    return;
  }

  if (isFadak && !inFollow) {
    const cachedProfile = profileCache.get(handle.toLowerCase());
    const fiberBio = cachedProfile?.bio || extractBioFromFiber(tweetEl, handle);
    if (currentSettings.keywordCollectorEnabled && hasBadgeInAuthorArea(tweetEl)) {
      const profile = cachedProfile ?? { handle, displayName: displayName ?? handle, bio: fiberBio };
      bufferCollectedFadak(handle.toLowerCase(), handle, profile.displayName, profile.bio || fiberBio, extractTweetText(tweetEl));
    }
    if (currentSettings.keywordFilterEnabled) {
      const profile = cachedProfile ?? {
        handle,
        displayName: displayName ?? handle,
        bio: fiberBio,
      };
      const tweetText = extractTweetText(tweetEl);
      const { matched } = matchesKeywordFilter(profile, activeFilterRules, tweetText);
      if (!matched) return;
    }
    const hide = shouldHideTweet({
      settings: currentSettings,
      followList: new Set<string>(),
      whitelist: whitelistSet,
      isFadak: true,
      userId,
      handle: `@${handle}`,
      pageType: getPageType(),
    });
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

function startObserving(): void {
  const feed = document.querySelector('main') ?? document.body;
  feedObserver.observe(feed);
}

function handleNavigate(): void {
  if (currentSettings.keywordCollectorEnabled) void flushCollector();
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

function restoreHiddenTweets(): void {
  const feed = document.querySelector('main') ?? document.body;
  feed.querySelectorAll('article[data-testid="tweet"][data-bbr-original]').forEach((tweet) => {
    showTweet(tweet as HTMLElement);
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
        // X fills the card asynchronously — wait for UserDescription to appear
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
  setTimeout(() => inner.disconnect(), 3000);
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

  if (currentSettings.keywordCollectorEnabled) {
    const buffered = collectorBuffer.get(key);
    if (buffered && !buffered.bio) {
      buffered.bio = bio;
      if (currentSettings.debugMode) console.log('[BBR HOVER BIO]', key, '->', bio.slice(0, 40));
    }
  }
  return true;
}

function reprocessExistingTweets(): void {
  const feed = document.querySelector('main') ?? document.body;
  const tweets = feed.querySelectorAll('article[data-testid="tweet"]');
  tweets.forEach((tweet) => {
    if (tweet.querySelector('[data-bbr-debug]')) return;
    try {
      processTweet(tweet as HTMLElement);
    } catch (e) {
      if (currentSettings?.debugMode) console.error('[BBR] processTweet error', e);
    }
  });
}

if (typeof document !== 'undefined') {
  init();
}
