// src/content/tweet-orchestrator.ts
// 트윗 처리 오케스트레이터: DOM에서 트윗 정보를 추출하고, classifier로 판정하고, DOM을 조작.
import { detectBadgeSvg } from '@features/badge-detection';
import { hideTweet, hideQuoteBlock, showTweet } from '@features/content-filter';
import { extractTweetAuthor, extractRetweeterName, extractTweetStatusPath, findQuoteBlock, extractQuoteAuthor, extractDisplayName, extractTweetText, formatUserLabel, addDebugLabel, hasBadgeInAuthorArea } from './tweet-processing';
import { isProfilePage, isDetailPage, getPageType } from './page-utils';
import { profileCache, getSettings, getWhitelistSet, getActiveFilterRules, getCurrentUserHandle, isHandleFollowed, isHandleWhitelisted, getExpandedSet } from './state';
import { bufferCollectedFadak } from './collector-buffer';
import { classifyTweet, classifyQuote } from './tweet-classifier';
import type { ClassifyResult, QuoteClassifyResult } from './tweet-classifier';
import { recordHide } from '@features/stats';

function checkFadak(_userId: string, element: HTMLElement): boolean {
  // SVG 구조만으로 판정. API 캐시 사용 안 함 (이중 팝 + API 엣지 케이스 제거).
  // React가 SVG 자식을 원자적으로 커밋하므로 부분 렌더링 리스크 최소.
  return detectBadgeSvg(element);
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

  // 사용자가 펼친 트윗은 재숨김 안 함 (가상 리스트 DOM 재생성 대응)
  const statusPath = extractTweetStatusPath(tweetEl);
  if (statusPath && getExpandedSet().has(statusPath)) {
    showTweet(tweetEl);
    return;
  }

  // 상세 페이지 메인 트윗은 숨기지 않음 (배너로 대체)
  if (isDetailPage() && statusPath) {
    const currentPath = window.location.pathname;
    if (currentPath.includes(statusPath)) return;
  }

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
    isWhitelisted: whitelistSet.has(`@${handle.toLowerCase()}`),
    settings, activeFilterRules, profile, tweetText,
    pageType: getPageType(),
  });

  // DOM 조작 + 통계 수집
  if (result.action === 'show') {
    if (tweetEl.hasAttribute('data-bbr-original')) {
      showTweet(tweetEl);
    }
  } else if (result.action === 'hide') {
    const retweeterName = isRetweet ? (extractRetweeterName(tweetEl) ?? '') : undefined;
    const expandedSet = getExpandedSet();
    hideTweet(tweetEl, settings.hideMode, {
      reason: result.reason ?? 'fadak',
      handle: `@${handle}`,
      retweetedBy: retweeterName || undefined,
      category: result.category,
      matchedRule: result.matchedRule,
    }, (el) => {
      const sp = extractTweetStatusPath(el);
      if (sp) expandedSet.add(sp);
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
  getExpandedSet().clear();
  const feed = document.querySelector('main') ?? document.body;
  feed.querySelectorAll('article[data-testid="tweet"][data-bbr-original]').forEach((tweet) => {
    showTweet(tweet as HTMLElement);
  });
  // expanded 마커 제거 — showTweet이 설정하므로 반드시 showTweet 이후에 제거
  feed.querySelectorAll('article[data-testid="tweet"][data-bbr-expanded]').forEach((tweet) => {
    tweet.removeAttribute('data-bbr-expanded');
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
