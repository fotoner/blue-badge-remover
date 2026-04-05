// src/content/tweet-orchestrator.ts
// 트윗 처리 오케스트레이터: DOM에서 트윗 정보를 추출하고, classifier로 판정하고, DOM을 조작.
import { detectBadgeSvg } from '@features/badge-detection';
import { hideTweet, hideQuoteBlock, showTweet } from '@features/content-filter';
import { extractTweetAuthor, extractRetweeterName, findQuoteBlock, extractQuoteAuthor, extractDisplayName, extractTweetText, formatUserLabel, addDebugLabel, hasBadgeInAuthorArea } from './tweet-processing';
import { isProfilePage, getPageType } from './page-utils';
import { badgeCache, profileCache, getSettings, getWhitelistSet, getActiveFilterRules, getCurrentUserHandle, isHandleFollowed, isHandleWhitelisted } from './state';
import { bufferCollectedFadak } from './collector-buffer';
import { classifyTweet, classifyQuote } from './tweet-classifier';
import type { ClassifyResult, QuoteClassifyResult } from './tweet-classifier';
import { recordHide } from '@features/stats';

function checkFadak(userId: string, element: HTMLElement): boolean {
  const cached = badgeCache.get(userId);
  if (cached !== undefined) return cached;

  const svgResult = detectBadgeSvg(element);
  // 구조적 감지(path 1개 + computedColor)는 정확도가 높으므로 양쪽 다 캐시.
  // API 데이터가 나중에 도착하면 handleBadgeData에서 교정 + reprocess.
  badgeCache.set(userId, svgResult);
  return svgResult;
}

export function processTweet(tweetEl: HTMLElement): void {
  if (isProfilePage()) return;
  const author = extractTweetAuthor(tweetEl);
  if (!author) return;

  const { handle } = author;
  const currentUserHandle = getCurrentUserHandle();
  const settings = getSettings();
  const whitelistSet = getWhitelistSet();
  const activeFilterRules = getActiveFilterRules();

  if (currentUserHandle && handle.toLowerCase() === currentUserHandle.toLowerCase()) return;

  const isFadak = checkFadak(handle.toLowerCase(), tweetEl);
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

  const cachedProfile = profileCache.get(handle.toLowerCase());
  const bio = cachedProfile?.bio ?? '';
  const tweetText = extractTweetText(tweetEl);
  const profile = cachedProfile ?? { handle, displayName: displayName ?? handle, bio };

  // 키워드 수집기 버퍼링 (분류와 무관하게 실행)
  if (isFadak && settings.keywordCollectorEnabled && hasBadgeInAuthorArea(tweetEl)) {
    bufferCollectedFadak(handle.toLowerCase(), handle, profile.displayName, profile.bio, tweetText);
  }

  // classifier로 판정
  const result: ClassifyResult = classifyTweet({
    handle, displayName, isFadak, inFollow,
    isRetweet,
    isWhitelisted: whitelistSet.has(`@${handle}`),
    settings, activeFilterRules, profile, tweetText,
    pageType: getPageType(),
  });

  // DOM 조작 + 통계 수집
  if (result.action === 'show') {
    showTweet(tweetEl);
  } else if (result.action === 'hide') {
    const retweeterName = isRetweet ? (extractRetweeterName(tweetEl) ?? '') : undefined;
    hideTweet(tweetEl, settings.hideMode, {
      reason: result.reason ?? 'fadak',
      handle: `@${handle}`,
      retweetedBy: retweeterName || undefined,
      category: result.category,
      matchedRule: result.matchedRule,
    });
    recordHide(tweetEl, result.category, result.packId);
  }
  // action === 'skip' → 비파딱, 아무것도 안 함

  // 인용 트윗 처리 (전역 필터링 OFF면 스킵)
  if (settings.enabled) {
    processQuoteBlock(tweetEl, handle, inFollow, settings, userLabel);
  }
}

function processQuoteBlock(tweetEl: HTMLElement, parentHandle: string, parentInFollow: boolean, settings: ReturnType<typeof getSettings>, userLabel: string): void {
  const quoteBlock = findQuoteBlock(tweetEl);
  if (!quoteBlock) return;

  const quoteAuthor = extractQuoteAuthor(quoteBlock);
  const quotedHandle = quoteAuthor?.handle ?? null;
  const quotedIsFadak = quotedHandle ? checkFadak(quotedHandle, quoteBlock) : detectBadgeSvg(quoteBlock);

  const result: QuoteClassifyResult = classifyQuote({
    quotedHandle, quotedIsFadak,
    quotedInFollow: isHandleFollowed(quotedHandle ?? ''),
    quotedIsWhitelisted: isHandleWhitelisted(quotedHandle ?? ''),
    parentHandle, parentInFollow, settings,
  });

  if (result.action === 'hide-entire') {
    hideTweet(tweetEl, settings.hideMode, { reason: 'quote-entire', handle: `@${quotedHandle ?? ''}`, quotedBy: userLabel });
  } else if (result.action === 'hide-quote') {
    hideQuoteBlock(quoteBlock, { handle: `@${quotedHandle ?? ''}` });
  }
}

export function restoreHiddenTweets(): void {
  const feed = document.querySelector('main') ?? document.body;
  // expanded 마커도 제거 — 설정 변경 시 재필터링 가능하도록
  feed.querySelectorAll('article[data-testid="tweet"][data-bbr-expanded]').forEach((tweet) => {
    tweet.removeAttribute('data-bbr-expanded');
  });
  feed.querySelectorAll('article[data-testid="tweet"][data-bbr-original]').forEach((tweet) => {
    showTweet(tweet as HTMLElement);
  });
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

let reprocessScheduled = false;

export function reprocessExistingTweets(): void {
  if (reprocessScheduled) return;
  reprocessScheduled = true;
  requestAnimationFrame(() => {
    reprocessScheduled = false;
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
  });
}
