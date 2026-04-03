// src/content/tweet-orchestrator.ts
// 트윗 처리 오케스트레이터: DOM에서 트윗 정보를 추출하고 숨김/표시를 결정.
import { detectBadgeSvg, parseBadgeInfo } from '@features/badge-detection';
import { shouldHideTweet, shouldHideRetweet, getQuoteAction, hideTweet, hideQuoteBlock, showTweet } from '@features/content-filter';
import { matchesKeywordFilter } from '@features/keyword-filter';
import { extractTweetAuthor, extractRetweeterName, findQuoteBlock, extractQuoteAuthor, extractDisplayName, extractTweetText, formatUserLabel, addDebugLabel, hasBadgeInAuthorArea } from './tweet-processing';
import { isProfilePage, getPageType } from './page-utils';
import { badgeCache, profileCache, getSettings, getFollowSet, getWhitelistSet, getActiveFilterRules, getCurrentUserHandle, isHandleFollowed, isHandleWhitelisted } from './state';
import { bufferCollectedFadak } from './collector-buffer';

function checkFadak(userId: string, element: HTMLElement): boolean {
  let isFadak = badgeCache.get(userId);
  if (isFadak === undefined) {
    isFadak = detectBadgeSvg(element);
    badgeCache.set(userId, isFadak);
  }
  return isFadak;
}

export function processTweet(tweetEl: HTMLElement): void {
  if (isProfilePage()) return;
  const author = extractTweetAuthor(tweetEl);
  if (!author) return;

  const { handle, userId } = author;
  const currentUserHandle = getCurrentUserHandle();
  const settings = getSettings();
  const whitelistSet = getWhitelistSet();
  const activeFilterRules = getActiveFilterRules();

  if (currentUserHandle && handle.toLowerCase() === currentUserHandle.toLowerCase()) return;

  const isFadak = checkFadak(userId, tweetEl);
  const displayName = extractDisplayName(tweetEl, handle);
  const userLabel = formatUserLabel(handle, displayName);

  const socialContext = tweetEl.querySelector('[data-testid="socialContext"]');
  const isRetweet = socialContext !== null;
  const inFollow = isHandleFollowed(handle);

  if (settings.debugMode) {
    const hasQuote = !!findQuoteBlock(tweetEl);
    addDebugLabel(tweetEl, { handle: `@${handle}`, isFadak, isRetweet, hasQuote, inFollow, retweeter: isRetweet ? (extractRetweeterName(tweetEl) ?? '?') : undefined });
    console.log('[BBR]', userLabel, { isFadak, isRetweet, inFollow, hasQuote });
  }

  if (isRetweet) {
    processRetweet(tweetEl, handle, isFadak, inFollow, settings, whitelistSet, activeFilterRules);
    return;
  }

  if (isFadak && inFollow) {
    showTweet(tweetEl);
  }

  if (isFadak && !inFollow) {
    if (processDirectFadak(tweetEl, handle, userId, displayName, settings, whitelistSet, activeFilterRules)) return;
  }

  processQuote(tweetEl, settings, userLabel);
}

function processRetweet(
  tweetEl: HTMLElement, handle: string, isFadak: boolean, inFollow: boolean,
  settings: ReturnType<typeof getSettings>, whitelistSet: Set<string>, activeFilterRules: ReturnType<typeof getActiveFilterRules>,
): void {
  if (!isFadak) return;
  if (inFollow || whitelistSet.has(`@${handle}`)) { showTweet(tweetEl); return; }

  const cachedProfile = profileCache.get(handle.toLowerCase());
  const bio = cachedProfile?.bio ?? '';
  if (settings.keywordCollectorEnabled && hasBadgeInAuthorArea(tweetEl)) {
    const profile = cachedProfile ?? { handle, displayName: extractDisplayName(tweetEl, handle) ?? handle, bio };
    bufferCollectedFadak(handle.toLowerCase(), handle, profile.displayName, profile.bio, extractTweetText(tweetEl));
  }
  if (settings.keywordFilterEnabled) {
    const profile = cachedProfile ?? { handle, displayName: extractDisplayName(tweetEl, handle) ?? handle, bio };
    const { matched } = matchesKeywordFilter(profile, activeFilterRules, extractTweetText(tweetEl));
    if (!matched) return;
  }
  const retweeterName = extractRetweeterName(tweetEl) ?? '';
  if (shouldHideRetweet({ settings, isFadak: true, isRetweet: true })) {
    hideTweet(tweetEl, settings.hideMode, { reason: 'retweet', handle: `@${handle}`, retweetedBy: retweeterName || undefined });
  }
}

/** @returns true if tweet was hidden (caller should return early) */
function processDirectFadak(
  tweetEl: HTMLElement, handle: string, userId: string, displayName: string | null,
  settings: ReturnType<typeof getSettings>, whitelistSet: Set<string>, activeFilterRules: ReturnType<typeof getActiveFilterRules>,
): boolean {
  const cachedProfile = profileCache.get(handle.toLowerCase());
  const bio = cachedProfile?.bio ?? '';
  if (settings.keywordCollectorEnabled && hasBadgeInAuthorArea(tweetEl)) {
    const profile = cachedProfile ?? { handle, displayName: displayName ?? handle, bio };
    bufferCollectedFadak(handle.toLowerCase(), handle, profile.displayName, profile.bio, extractTweetText(tweetEl));
  }
  if (settings.keywordFilterEnabled) {
    const profile = cachedProfile ?? { handle, displayName: displayName ?? handle, bio };
    const { matched } = matchesKeywordFilter(profile, activeFilterRules, extractTweetText(tweetEl));
    if (!matched) return false;
  }
  const hide = shouldHideTweet({
    settings, followList: new Set<string>(), whitelist: whitelistSet,
    isFadak: true, userId, handle: `@${handle}`, pageType: getPageType(),
  });
  if (hide) {
    hideTweet(tweetEl, settings.hideMode, { reason: 'fadak', handle: `@${handle}` });
    return true;
  }
  return false;
}

function processQuote(tweetEl: HTMLElement, settings: ReturnType<typeof getSettings>, userLabel: string): void {
  const quoteBlock = findQuoteBlock(tweetEl);
  if (!quoteBlock) return;

  const quoteAuthor = extractQuoteAuthor(quoteBlock);
  const quotedHandle = quoteAuthor?.handle ?? null;
  const quotedIsFadak = quotedHandle ? checkFadak(quotedHandle, quoteBlock) : detectBadgeSvg(quoteBlock);

  if (!quotedIsFadak) return;
  if (isHandleFollowed(quotedHandle ?? '') || isHandleWhitelisted(quotedHandle ?? '')) return;

  const quoteAction = getQuoteAction(settings, true);
  if (quoteAction === 'hide-entire') {
    hideTweet(tweetEl, settings.hideMode, { reason: 'quote-entire', handle: `@${quotedHandle ?? ''}`, quotedBy: userLabel });
  } else if (quoteAction === 'hide-quote') {
    hideQuoteBlock(quoteBlock, { handle: `@${quotedHandle ?? ''}` });
  }
}

export function restoreHiddenTweets(): void {
  const feed = document.querySelector('main') ?? document.body;
  // 전체 트윗 숨김 복원
  feed.querySelectorAll('article[data-testid="tweet"][data-bbr-original]').forEach((tweet) => {
    showTweet(tweet as HTMLElement);
  });
  // quote-only 숨김 복원
  feed.querySelectorAll('[data-bbr-hidden-quote]').forEach((quote) => {
    quote.removeAttribute('data-bbr-hidden-quote');
    const placeholder = quote.querySelector('[data-bbr-collapsed]');
    placeholder?.remove();
    Array.from(quote.childNodes).forEach((child) => {
      if (child instanceof HTMLElement) {
        child.style.display = '';
      }
    });
  });
}

export function reprocessExistingTweets(): void {
  const settings = getSettings();
  const feed = document.querySelector('main') ?? document.body;
  feed.querySelectorAll('article[data-testid="tweet"]').forEach((tweet) => {
    tweet.querySelector('[data-bbr-debug]')?.remove();
    try {
      processTweet(tweet as HTMLElement);
    } catch (e) {
      if (settings?.debugMode) console.error('[BBR] processTweet error', e);
    }
  });
}
