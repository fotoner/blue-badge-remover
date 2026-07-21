// src/content/tweet-orchestrator.ts
// 트윗 처리 오케스트레이터: DOM에서 트윗 정보를 추출하고, classifier로 판정하고, DOM을 조작.
import { detectBadgeSvg, isBlueBadgeElement } from '@features/badge-detection/svg-fallback';
import { hideTweet, hideQuoteBlock, showTweet, showQuoteBlock } from '@features/content-filter';
import { extractTweetAuthor, extractRetweeterName, extractRetweeterHandle, extractTweetStatusPath, findQuoteBlock, extractQuoteAuthor, extractDisplayName, extractTweetText, formatUserLabel, addDebugLabel, findAuthorBadge } from './tweet-processing';
import { isProfilePage, isDetailPage, getPageType } from './page-utils';
import { profileCache, getSettings, getWhitelistSet, getActiveFilterRules, getCurrentUserHandle, setCurrentUserHandle, isHandleFollowed, isHandleWhitelisted, getExpandedSet } from './state';
import { bufferCollectedFadak } from './collector-buffer';
import { classifyTweet, classifyQuote } from './tweet-classifier';
import type { ClassifyResult, QuoteClassifyResult } from './tweet-classifier';
import { recordHide } from '@features/stats';

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

export function processTweet(tweetEl: HTMLElement): void {
  if (isProfilePage()) return;
  const author = extractTweetAuthor(tweetEl);
  if (!author) return;

  const { handle } = author;
  const currentUserHandle = getCurrentUserHandle();
  const settings = getSettings();
  const whitelistSet = getWhitelistSet();
  const activeFilterRules = getActiveFilterRules();

  if (currentUserHandle && handle.toLowerCase() === currentUserHandle.toLowerCase()) {
    // A5: 핸들 감지 전에 숨겨진 자기 트윗 복원 (skip 경로와 동일한 의미론)
    if (tweetEl.hasAttribute('data-bbr-original')) showTweet(tweetEl);
    return;
  }

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

  const isFadak = checkFadak(tweetEl);
  const displayName = extractDisplayName(tweetEl, handle);
  const userLabel = formatUserLabel(handle, displayName);

  const socialContext = tweetEl.querySelector('[data-testid="socialContext"]');
  const isRetweet = socialContext !== null;
  const inFollow = isHandleFollowed(handle);

  // A6: 리트위터 예외 판단용 — href 기반 추출(로케일 독립), 링크 없는 socialContext는 null(예외 불가)
  const retweeterHandle = isRetweet ? extractRetweeterHandle(tweetEl) : null;
  const retweeterInFollow = retweeterHandle !== null && isHandleFollowed(retweeterHandle);
  const retweeterIsWhitelisted = retweeterHandle !== null && isHandleWhitelisted(retweeterHandle);
  // Defect2: 본인 계정의 재게시도 예외 — 작성자 본인 체크(라인 46)와 동일한 정규화로 비교
  const retweeterIsCurrentUser =
    retweeterHandle !== null && currentUserHandle !== null && retweeterHandle.toLowerCase() === currentUserHandle.toLowerCase();
  // Defect1: 인용 파이프라인(processQuoteBlock)에도 동일한 리트위터 예외를 전파
  const retweeterExempt = retweeterInFollow || retweeterIsWhitelisted || retweeterIsCurrentUser;

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
  // isFadak이 이미 작성자 영역 스코프 판정이므로 별도 hasBadgeInAuthorArea 체크 불필요
  if (isFadak && settings.keywordCollectorEnabled) {
    bufferCollectedFadak(handle.toLowerCase(), handle, profile.displayName, profile.bio, tweetText);
  }

  // classifier로 판정
  const result: ClassifyResult = classifyTweet({
    handle, displayName, isFadak, inFollow,
    isRetweet,
    isWhitelisted: whitelistSet.has(`@${handle.toLowerCase()}`),
    retweeterHandle, retweeterInFollow, retweeterIsWhitelisted, retweeterIsCurrentUser,
    settings, activeFilterRules, profile, tweetText,
    pageType: getPageType(),
  });

  // DOM 조작 + 통계 수집
  if (result.action === 'show') {
    restoreIfAuthorHidden(tweetEl);
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
  // action === 'skip' → 비파딱. SVG 부분 렌더링으로 오감지 후 숨겨졌을 수 있음 → 복원 (quote-entire 사유 제외)
  if (result.action === 'skip') {
    restoreIfAuthorHidden(tweetEl);
  }

  // 인용 트윗 처리 (전역 필터링 OFF면 스킵)
  if (settings.enabled) {
    processQuoteBlock(tweetEl, handle, inFollow, retweeterExempt, settings, userLabel);
  }
}

function processQuoteBlock(
  tweetEl: HTMLElement,
  parentHandle: string,
  parentInFollow: boolean,
  retweeterExempt: boolean,
  settings: ReturnType<typeof getSettings>,
  userLabel: string,
): void {
  const quoteBlock = findQuoteBlock(tweetEl);
  if (!quoteBlock) return;

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
    hideTweet(tweetEl, settings.hideMode, { reason: QUOTE_ENTIRE_REASON, handle: `@${quotedHandle ?? ''}`, quotedBy: userLabel });
    return;
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
      } catch (e) {
        if (settings?.debugMode) console.error('[BBR] processTweet error', e);
      }
    });
  });
}
