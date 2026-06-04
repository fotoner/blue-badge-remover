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
import { TIMINGS } from '@shared/constants';
import type { FilterRule, ProfileInfo, Settings } from '@shared/types';

function checkFadak(_userId: string, element: HTMLElement): boolean {
  // SVG 구조만으로 판정. API 캐시 사용 안 함 (이중 팝 + API 엣지 케이스 제거).
  // React가 SVG 자식을 원자적으로 커밋하므로 부분 렌더링 리스크 최소.
  return detectBadgeSvg(element);
}

interface BaseTweetContext {
  handle: string;
  statusPath: string | null;
  currentUserHandle: string | null;
  settings: Settings;
  whitelistSet: Set<string>;
  activeFilterRules: FilterRule[];
}

interface TweetContext extends BaseTweetContext {
  displayName: string | null;
  isFadak: boolean;
  userLabel: string;
  isRetweet: boolean;
  inFollow: boolean;
  profile: ProfileInfo;
  tweetText: string;
}

export function processTweet(tweetEl: HTMLElement): void {
  const baseContext = buildTweetContext(tweetEl);
  if (!baseContext) return;
  if (shouldSkipTweet(tweetEl, baseContext)) return;

  const context = enrichTweetContext(tweetEl, baseContext);
  addDebugInfo(tweetEl, context);
  bufferKeywordCollector(tweetEl, context);

  // classifier로 판정
  const result: ClassifyResult = classifyTweet({
    handle: context.handle,
    displayName: context.displayName,
    isFadak: context.isFadak,
    inFollow: context.inFollow,
    isRetweet: context.isRetweet,
    isWhitelisted: context.whitelistSet.has(`@${context.handle.toLowerCase()}`),
    settings: context.settings,
    activeFilterRules: context.activeFilterRules,
    profile: context.profile,
    tweetText: context.tweetText,
    pageType: getPageType(),
  });

  applyTweetAction(tweetEl, result, context);

  // 인용 트윗 처리 (전역 필터링 OFF면 스킵)
  if (context.settings.enabled) {
    processQuoteBlock(tweetEl, context.handle, context.inFollow, context.settings, context.userLabel);
  }
}

function buildTweetContext(tweetEl: HTMLElement): BaseTweetContext | null {
  if (isProfilePage()) return null;
  const author = extractTweetAuthor(tweetEl);
  if (!author) return null;

  return {
    handle: author.handle,
    statusPath: extractTweetStatusPath(tweetEl),
    currentUserHandle: getCurrentUserHandle(),
    settings: getSettings(),
    whitelistSet: getWhitelistSet(),
    activeFilterRules: getActiveFilterRules(),
  };
}

function shouldSkipTweet(tweetEl: HTMLElement, context: BaseTweetContext): boolean {
  const { currentUserHandle, handle, statusPath } = context;
  if (currentUserHandle && handle.toLowerCase() === currentUserHandle.toLowerCase()) return true;

  // 사용자가 펼친 트윗은 재숨김 안 함 (가상 리스트 DOM 재생성 대응)
  if (statusPath && getExpandedSet().has(statusPath)) {
    showTweet(tweetEl);
    return true;
  }

  // 상세 페이지 메인 트윗은 숨기지 않음 (배너로 대체)
  if (isDetailPage() && statusPath && window.location.pathname.includes(statusPath)) {
    return true;
  }

  return false;
}

function enrichTweetContext(tweetEl: HTMLElement, base: BaseTweetContext): TweetContext {
  const displayName = extractDisplayName(tweetEl, base.handle);
  const cachedProfile = profileCache.get(base.handle.toLowerCase());
  const bio = cachedProfile?.bio ?? '';
  const tweetText = extractTweetText(tweetEl);
  const profile = cachedProfile ?? { handle: base.handle, displayName: displayName ?? base.handle, bio };
  const isRetweet = tweetEl.querySelector('[data-testid="socialContext"]') !== null;

  return {
    ...base,
    displayName,
    isFadak: checkFadak(base.handle.toLowerCase(), tweetEl),
    userLabel: formatUserLabel(base.handle, displayName),
    isRetweet,
    inFollow: isHandleFollowed(base.handle),
    profile,
    tweetText,
  };
}

function addDebugInfo(tweetEl: HTMLElement, context: TweetContext): void {
  if (!context.settings.debugMode) return;
  const hasQuote = !!findQuoteBlock(tweetEl);
  addDebugLabel(tweetEl, {
    handle: `@${context.handle}`,
    isFadak: context.isFadak,
    isRetweet: context.isRetweet,
    hasQuote,
    inFollow: context.inFollow,
    retweeter: context.isRetweet ? (extractRetweeterName(tweetEl) ?? '?') : undefined,
  });
  console.log('[BBR]', context.userLabel, {
    isFadak: context.isFadak,
    isRetweet: context.isRetweet,
    inFollow: context.inFollow,
    hasQuote,
  });
}

function bufferKeywordCollector(tweetEl: HTMLElement, context: TweetContext): void {
  if (!context.isFadak || !context.settings.keywordCollectorEnabled || !hasBadgeInAuthorArea(tweetEl)) return;
  bufferCollectedFadak(
    context.handle.toLowerCase(),
    context.handle,
    context.profile.displayName,
    context.profile.bio,
    context.tweetText,
  );
}

function applyTweetAction(tweetEl: HTMLElement, result: ClassifyResult, context: TweetContext): void {
  if (result.action === 'show') {
    if (tweetEl.hasAttribute('data-bbr-original')) {
      showTweet(tweetEl);
    }
  } else if (result.action === 'hide') {
    const retweeterName = context.isRetweet ? (extractRetweeterName(tweetEl) ?? '') : undefined;
    const expandedSet = getExpandedSet();
    hideTweet(tweetEl, context.settings.hideMode, {
      reason: result.reason ?? 'fadak',
      handle: `@${context.handle}`,
      retweetedBy: retweeterName || undefined,
      category: result.category,
      matchedRule: result.matchedRule,
    }, (el) => {
      const sp = extractTweetStatusPath(el);
      if (sp) expandedSet.add(sp);
    });
    recordHide(tweetEl, result.category, result.packId);
  }
  // action === 'skip' → 비파딱. SVG 부분 렌더링으로 오감지 후 숨겨졌을 수 있음 → 복원
  if (result.action === 'skip' && tweetEl.hasAttribute('data-bbr-original')) {
    showTweet(tweetEl);
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
    const feed = document.querySelector('main') ?? document.body;
    const tweets = Array.from(feed.querySelectorAll<HTMLElement>('article[data-testid="tweet"]'));
    processTweetChunk(tweets, 0);
  });
}

function processTweetChunk(tweets: HTMLElement[], startIndex: number): void {
  const settings = getSettings();
  const endIndex = Math.min(startIndex + TIMINGS.REPROCESS_CHUNK_SIZE, tweets.length);
  for (let i = startIndex; i < endIndex; i++) {
    const tweet = tweets[i];
    if (!tweet) continue;
    tweet.querySelector('[data-bbr-debug]')?.remove();
    try {
      processTweet(tweet);
    } catch (e) {
      if (settings?.debugMode) console.error('[BBR] processTweet error', e);
    }
  }

  if (endIndex < tweets.length) {
    requestAnimationFrame(() => processTweetChunk(tweets, endIndex));
    return;
  }

  reprocessScheduled = false;
}
