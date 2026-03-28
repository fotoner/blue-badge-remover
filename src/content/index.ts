// src/content/index.ts
import { BadgeCache, parseBadgeInfo, detectBadgeSvg } from '@features/badge-detection';
import { FeedObserver, shouldHideTweet, shouldHideRetweet, getQuoteAction, hideTweet, hideQuoteBlock, type PageType } from '@features/content-filter';
import { getSettings, getWhitelist } from '@features/settings';
import { MESSAGE_TYPES, STORAGE_KEYS } from '@shared/constants';
import type { Settings } from '@shared/types';
import { logger } from '@shared/utils/logger';

const badgeCache = new BadgeCache();
let currentSettings: Settings;
let followSet = new Set<string>();
let whitelistSet = new Set<string>();
let feedObserver: FeedObserver;

async function init(): Promise<void> {
  currentSettings = await getSettings();

  const stored = await chrome.storage.local.get([STORAGE_KEYS.FOLLOW_LIST, STORAGE_KEYS.WHITELIST]);
  followSet = new Set((stored[STORAGE_KEYS.FOLLOW_LIST] as string[] | undefined) ?? []);
  const whitelist = (stored[STORAGE_KEYS.WHITELIST] as string[] | undefined) ?? [];
  whitelistSet = new Set(whitelist);

  injectFetchInterceptor();
  listenForMessages();
  listenForSettingsChanges();

  feedObserver = new FeedObserver(processTweet);
  startObserving();
  listenForNavigation();

  logger.info('Blue Badge Remover initialized');
}

function injectFetchInterceptor(): void {
  const script = document.createElement('script');
  script.src = chrome.runtime.getURL('src/injected/fetch-interceptor.ts');
  (document.head ?? document.documentElement).appendChild(script);
  script.onload = () => script.remove();
}

function listenForMessages(): void {
  window.addEventListener('message', (event) => {
    if (event.source !== window) return;

    if (event.data?.type === MESSAGE_TYPES.BADGE_DATA) {
      for (const userData of event.data.users) {
        const badge = parseBadgeInfo(userData);
        if (badge) {
          badgeCache.set(badge.userId, badge.isBluePremium);
        }
      }
    }

    if (event.data?.type === MESSAGE_TYPES.TOKEN_DATA) {
      chrome.storage.local.set({ [STORAGE_KEYS.TOKEN]: event.data.token });
    }

    if (event.data?.type === MESSAGE_TYPES.CSRF_TOKEN) {
      chrome.storage.local.set({ [STORAGE_KEYS.CSRF_TOKEN]: event.data.csrfToken });
    }

    if (event.data?.type === MESSAGE_TYPES.FOLLOW_DATA) {
      handleFollowData(event.data.userIds as string[]);
    }

    if (event.data?.type === MESSAGE_TYPES.USER_ID) {
      handleUserIdMessage(event.data.userId as string);
    }
  });
}

async function handleFollowData(newUserIds: string[]): Promise<void> {
  if (!newUserIds.length) return;
  // 기존 팔로우 목록에 누적 (중복 제거)
  const stored = await chrome.storage.local.get([STORAGE_KEYS.FOLLOW_LIST]);
  const existing = (stored[STORAGE_KEYS.FOLLOW_LIST] as string[] | undefined) ?? [];
  const merged = [...new Set([...existing, ...newUserIds])];
  await chrome.storage.local.set({
    [STORAGE_KEYS.FOLLOW_LIST]: merged,
    [STORAGE_KEYS.LAST_SYNC_AT]: new Date().toISOString(),
  });
  followSet = new Set(merged);
  logger.info('Follow data received from page', { newCount: newUserIds.length, totalCount: merged.length });
}

async function handleUserIdMessage(newUserId: string): Promise<void> {
  if (!newUserId) return;

  const stored = await chrome.storage.local.get([STORAGE_KEYS.CURRENT_USER_ID]);
  const currentUserId = stored[STORAGE_KEYS.CURRENT_USER_ID] as string | null;

  if (currentUserId !== newUserId) {
    await chrome.storage.local.set({ [STORAGE_KEYS.CURRENT_USER_ID]: newUserId });
    chrome.runtime.sendMessage({ type: 'SYNC_FOLLOW_LIST' });
    logger.info('Account switched, re-syncing follow list', { newUserId });
  }
}

function listenForSettingsChanges(): void {
  chrome.storage.onChanged.addListener((changes) => {
    const settingsChange = changes[STORAGE_KEYS.SETTINGS];
    if (settingsChange) {
      currentSettings = settingsChange.newValue as Settings;
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

function getPageType(): PageType {
  const path = window.location.pathname;
  if (path.includes('/search')) return 'search';
  if (path.includes('/status/')) return 'replies';
  return 'timeline';
}

function extractTweetAuthor(tweetEl: HTMLElement): { handle: string; userId: string } | null {
  const handleEl = tweetEl.querySelector('a[role="link"][href^="/"]');
  const href = handleEl?.getAttribute('href');
  if (!href) return null;
  const handle = href.slice(1).split('/')[0];
  if (!handle) return null;
  const userId = tweetEl.getAttribute('data-user-id') ?? handle;
  return { handle, userId };
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
  const author = extractTweetAuthor(tweetEl);
  if (!author) return;

  const { handle, userId } = author;
  const isFadak = checkFadak(userId, tweetEl);

  // 리트윗 감지: socialContext 존재 여부로 판단
  const socialContext = tweetEl.querySelector('[data-testid="socialContext"]');
  const isRetweet = socialContext !== null;

  if (isRetweet) {
    // 리트윗인 경우: 표시된 작성자가 원본 작성자
    // socialContext에 리트윗한 사람의 이름이 있음
    const retweeterName = socialContext?.textContent?.replace(/\s*Retweeted.*|reposted.*|님이.*리트윗.*|님이.*리포스트.*/i, '').trim() ?? '';

    // 원본 작성자(author)가 파딱이면 숨김
    const originalIsFadak = isFadak;

    if (originalIsFadak) {
      // 팔로우/화이트리스트 체크 (원본 작성자 기준)
      if (followSet.has(userId) || whitelistSet.has(`@${handle}`)) {
        return; // 예외 — 숨기지 않음
      }

      const hideRetweet = shouldHideRetweet({
        settings: currentSettings,
        isFadak: true,
        isRetweet: true,
      });
      if (hideRetweet) {
        hideTweet(tweetEl, currentSettings.hideMode, {
          reason: 'retweet',
          handle: `@${handle}`,
          retweetedBy: retweeterName || undefined,
        });
        return;
      }
    }
    // 리트윗이지만 원본이 파딱 아님 → 통과
    return;
  }

  // 1순위: 직접 트윗 — 작성자가 파딱인가?
  if (isFadak) {
    const hide = shouldHideTweet({
      settings: currentSettings,
      followList: followSet,
      whitelist: whitelistSet,
      isFadak: true,
      userId,
      handle: `@${handle}`,
      pageType: getPageType(),
    });

    if (hide) {
      hideTweet(tweetEl, currentSettings.hideMode, {
        reason: 'fadak',
        handle: `@${handle}`,
      });
      return;
    }
  }

  // 3순위: 인용 트윗 — 인용된 계정이 파딱인가?
  const quoteBlock = tweetEl.querySelector('[data-testid="quoteTweet"]') as HTMLElement | null;
  if (quoteBlock) {
    const quoteAuthor = extractTweetAuthor(quoteBlock);
    const quotedHandle = quoteAuthor?.handle;
    const quotedUserId = quoteAuthor?.userId ?? '';

    let quotedIsFadak = false;
    if (quotedUserId) {
      quotedIsFadak = checkFadak(quotedUserId, quoteBlock);
    } else {
      quotedIsFadak = detectBadgeSvg(quoteBlock);
    }

    // 인용된 사람이 팔로우/화이트리스트면 예외
    if (quotedIsFadak && !followSet.has(quotedUserId) && !whitelistSet.has(`@${quotedHandle ?? ''}`)) {
      const quoteAction = getQuoteAction(currentSettings, true);
      if (quoteAction === 'hide-entire') {
        hideTweet(tweetEl, currentSettings.hideMode, {
          reason: 'quote-entire',
          handle: `@${quotedHandle ?? ''}`,
        });
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

function listenForNavigation(): void {
  const originalPushState = history.pushState;
  history.pushState = function (...args: Parameters<typeof history.pushState>) {
    originalPushState.apply(this, args);
    onNavigate();
  };
  window.addEventListener('popstate', onNavigate);
}

function onNavigate(): void {
  feedObserver.disconnect();
  requestAnimationFrame(() => startObserving());
}

init();
