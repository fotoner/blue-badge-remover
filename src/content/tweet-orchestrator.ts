// src/content/tweet-orchestrator.ts
// 트윗 처리 오케스트레이터: DOM에서 트윗 정보를 추출하고, classifier로 판정하고, DOM을 조작.
import { detectBadgeSvg, isBlueBadgeElement } from '@features/badge-detection/svg-fallback';
import { hideTweet, hideQuoteBlock, showExpandedTweet, showTweet, showQuoteBlock } from '@features/content-filter';
import { extractTweetAuthor, extractRetweeterName, extractRetweeterHandle, extractTweetStatusPath, findQuoteBlock, extractQuoteAuthor, extractDisplayName, extractTweetText, formatUserLabel, addDebugLabel, findAuthorBadge } from './tweet-processing';
import { isProfilePage, isDetailPage, getPageType } from './page-utils';
import { profileCache, getSettings, getWhitelistSet, getActiveFilterRules, getProtectedKeywords, getCurrentUserHandle, setCurrentUserHandle, isHandleFollowed, isHandleWhitelisted, getExpandedSet } from './state';
import { bufferCollectedFadak } from './collector-buffer';
import { classifyTweet, classifyQuote } from './tweet-classifier';
import type { ClassifyResult, QuoteClassifyResult } from './tweet-classifier';
import { recordHide } from '@features/stats';
import { isScrollRestorationActive } from './navigation';
import { logger } from '@shared/utils/logger';
import { addToWhitelist } from '@features/settings';

const QUOTE_ENTIRE_REASON = 'quote-entire';
const HIDE_REASON_ATTR = 'data-bbr-reason';

/**
 * 작성자 경로(fadak/retweet 등)로 숨겨진 트윗만 복원.
 * 'quote-entire' 사유는 quote 파이프라인(processQuoteBlock)만 복원 권한을 가진다 —
 * skip 경로가 quote-entire 트윗을 복원하며 data-bbr-expanded로 재숨김을 막던 잠복 버그도 함께 수정.
 */
function restoreIfAuthorHidden(tweetEl: HTMLElement): void {
  if (tweetEl.hasAttribute('data-bbr-original') && tweetEl.getAttribute(HIDE_REASON_ATTR) !== QUOTE_ENTIRE_REASON) {
    showTweet(tweetEl);
  }
}

function checkFadak(element: HTMLElement): boolean {
  // SVG 구조만으로 판정 + 작성자 영역(User-Name) 스코프 — 인용 카드 내부 뱃지 오귀속 방지 (#35).
  // API 캐시 사용 안 함 (이중 팝 + API 엣지 케이스 제거).
  // React가 SVG 자식을 원자적으로 커밋하므로 부분 렌더링 리스크 최소.
  const badge = findAuthorBadge(element);
  return badge !== null && isBlueBadgeElement(badge);
}

function trackExpandedTweet(element: HTMLElement, expanded: boolean): void {
  const statusPath = extractTweetStatusPath(element);
  if (!statusPath) return;
  if (expanded) {
    getExpandedSet().add(statusPath);
  } else {
    getExpandedSet().delete(statusPath);
  }
}

interface RetweeterContext {
  isRetweet: boolean;
  handle: string | null;
  inFollow: boolean;
  isWhitelisted: boolean;
  isCurrentUser: boolean;
  exempt: boolean;
}

function shouldSkipTweet(
  tweetEl: HTMLElement,
  handle: string,
  statusPath: string | null,
  currentUserHandle: string | null,
): boolean {
  if (currentUserHandle && handle.toLowerCase() === currentUserHandle.toLowerCase()) {
    if (tweetEl.hasAttribute('data-bbr-original')) showTweet(tweetEl);
    return true;
  }
  return Boolean(isDetailPage() && statusPath && window.location.pathname.includes(statusPath));
}

function getRetweeterContext(
  tweetEl: HTMLElement,
  currentUserHandle: string | null,
): RetweeterContext {
  const isRetweet = tweetEl.querySelector('[data-testid="socialContext"]') !== null;
  const handle = isRetweet ? extractRetweeterHandle(tweetEl) : null;
  const inFollow = handle !== null && isHandleFollowed(handle);
  const isWhitelisted = handle !== null && isHandleWhitelisted(handle);
  const isCurrentUser = handle !== null && currentUserHandle !== null
    && handle.toLowerCase() === currentUserHandle.toLowerCase();
  return {
    isRetweet,
    handle,
    inFollow,
    isWhitelisted,
    isCurrentUser,
    exempt: inFollow || isWhitelisted || isCurrentUser,
  };
}

function applyTweetResult(
  tweetEl: HTMLElement,
  result: ClassifyResult,
  handle: string,
  isRetweet: boolean,
  statusPath: string | null,
  settings: ReturnType<typeof getSettings>,
): boolean {
  if (result.action === 'show' || result.action === 'skip') {
    restoreIfAuthorHidden(tweetEl);
    return false;
  }
  if (result.action !== 'hide') return false;
  const retweeterName = isRetweet ? (extractRetweeterName(tweetEl) ?? '') : undefined;
  const context = {
    reason: result.reason ?? 'fadak',
    handle: `@${handle}`,
    retweetedBy: retweeterName || undefined,
    category: result.category,
    matchedRule: result.matchedRule,
    preserveHeight: isScrollRestorationActive(),
    onWhitelist: () => addToWhitelist(`@${handle}`),
  };
  if (statusPath && getExpandedSet().has(statusPath)) {
    showExpandedTweet(tweetEl, context, trackExpandedTweet);
  } else {
    hideTweet(tweetEl, settings.hideMode, context, trackExpandedTweet);
  }
  recordHide(tweetEl, result.category, result.packId, statusPath);
  return true;
}

export function processTweet(tweetEl: HTMLElement): void {
  if (isProfilePage()) return;
  const author = extractTweetAuthor(tweetEl);
  if (!author) return;
  const { handle } = author;
  const currentUserHandle = getCurrentUserHandle();
  const statusPath = extractTweetStatusPath(tweetEl);
  if (shouldSkipTweet(tweetEl, handle, statusPath, currentUserHandle)) return;
  const settings = getSettings();
  const isFadak = checkFadak(tweetEl);
  const displayName = extractDisplayName(tweetEl, handle);
  const userLabel = formatUserLabel(handle, displayName);
  const inFollow = isHandleFollowed(handle);
  const retweeter = getRetweeterContext(tweetEl, currentUserHandle);
  if (settings.debugMode) {
    const hasQuote = !!findQuoteBlock(tweetEl);
    addDebugLabel(tweetEl, { handle: `@${handle}`, isFadak, isRetweet: retweeter.isRetweet, hasQuote, inFollow, retweeter: retweeter.isRetweet ? (extractRetweeterName(tweetEl) ?? '?') : undefined });
    logger.debug('Tweet classified', { userLabel, isFadak, isRetweet: retweeter.isRetweet, inFollow, hasQuote });
  }
  const cachedProfile = profileCache.get(handle.toLowerCase());
  const tweetText = extractTweetText(tweetEl);
  const profile = cachedProfile ?? { handle, displayName: displayName ?? handle, bio: '' };
  if (isFadak && settings.keywordCollectorEnabled) {
    bufferCollectedFadak(handle.toLowerCase(), handle, profile.displayName, profile.bio, tweetText);
  }
  const result: ClassifyResult = classifyTweet({
    handle, displayName, isFadak, inFollow,
    isRetweet: retweeter.isRetweet,
    isWhitelisted: getWhitelistSet().has(`@${handle.toLowerCase()}`),
    retweeterHandle: retweeter.handle,
    retweeterInFollow: retweeter.inFollow,
    retweeterIsWhitelisted: retweeter.isWhitelisted,
    retweeterIsCurrentUser: retweeter.isCurrentUser,
    settings, activeFilterRules: getActiveFilterRules(), protectedKeywords: getProtectedKeywords(), profile, tweetText,
    pageType: getPageType(),
  });
  const authorHidden = applyTweetResult(tweetEl, result, handle, retweeter.isRetweet, statusPath, settings);
  let quoteHidden = false;
  if (settings.enabled) {
    quoteHidden = processQuoteBlock(tweetEl, handle, inFollow, retweeter.exempt, settings, userLabel, statusPath);
  }
  if (!authorHidden && !quoteHidden && statusPath && getExpandedSet().delete(statusPath)) {
    if (tweetEl.hasAttribute('data-bbr-expanded')) showTweet(tweetEl);
  }
}

function processQuoteBlock(
  tweetEl: HTMLElement,
  parentHandle: string,
  parentInFollow: boolean,
  retweeterExempt: boolean,
  settings: ReturnType<typeof getSettings>,
  userLabel: string,
  statusPath: string | null,
): boolean {
  const quoteBlock = findQuoteBlock(tweetEl);
  if (!quoteBlock) return false;

  const quoteAuthor = extractQuoteAuthor(quoteBlock);
  const quotedHandle = quoteAuthor?.handle ?? null;
  // 인용 카드는 그 자체가 뱃지 스코프 — 작성자 영역 스코프(checkFadak) 대신 요소 전체 판정 유지
  const quotedIsFadak = detectBadgeSvg(quoteBlock);

  const result: QuoteClassifyResult = classifyQuote({
    quotedHandle, quotedIsFadak,
    quotedInFollow: isHandleFollowed(quotedHandle ?? ''),
    quotedIsWhitelisted: isHandleWhitelisted(quotedHandle ?? ''),
    parentHandle, parentInFollow,
    parentIsWhitelisted: isHandleWhitelisted(parentHandle),
    retweeterExempt,
    settings,
  });

  if (result.action === 'hide-entire') {
    const context = {
      reason: QUOTE_ENTIRE_REASON,
      handle: `@${quotedHandle ?? ''}`,
      quotedBy: userLabel,
      preserveHeight: isScrollRestorationActive(),
      onWhitelist: quotedHandle ? () => addToWhitelist(`@${quotedHandle}`) : undefined,
    };
    if (statusPath && getExpandedSet().has(statusPath)) {
      showExpandedTweet(tweetEl, context, trackExpandedTweet);
    } else {
      hideTweet(tweetEl, settings.hideMode, context, trackExpandedTweet);
    }
    return true;
  }
  // 판정이 hide-entire보다 약해졌으면(다운그레이드/해제) quote-entire로 숨겨진 트윗을 여기서만 복원
  if (tweetEl.hasAttribute('data-bbr-original') && tweetEl.getAttribute(HIDE_REASON_ATTR) === QUOTE_ENTIRE_REASON) {
    showTweet(tweetEl);
  }
  if (result.action === 'hide-quote') {
    hideQuoteBlock(quoteBlock, { handle: `@${quotedHandle ?? ''}` });
  } else if (quoteBlock.hasAttribute('data-bbr-hidden-quote')) {
    showQuoteBlock(quoteBlock);
  }
  return false;
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
    showQuoteBlock(quote as HTMLElement);
  });
}

/**
 * A5: 지연 폴백 — 계정 핸들이 아직 없을 때만 getHandle 결과를 설정하고,
 * 실제로 설정된 경우에 한해 detectAndHandleAccountSwitch와 동일하게 복원+재처리.
 */
export function applyCurrentUserFallback(getHandle: () => string | null): boolean {
  if (getCurrentUserHandle()) return false;
  const handle = getHandle();
  if (!handle) return false;
  setCurrentUserHandle(handle);
  restoreHiddenTweets();
  reprocessExistingTweets();
  return true;
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
      } catch (error) {
        if (settings.debugMode) logger.error('Tweet reprocess failed', { error: String(error) });
      }
    });
  });
}
