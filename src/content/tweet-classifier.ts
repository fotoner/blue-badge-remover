// src/content/tweet-classifier.ts
// 순수 분류 함수: DOM 접근 없이 입력 데이터만으로 트윗 숨김 판정.
import { shouldHideTweet, shouldHideRetweet, getQuoteAction, isPageFilterEnabled, type PageType } from '@features/content-filter';
import { isAggressorProfile, matchesKeywordFilter, matchesProtectedKeyword } from '@features/keyword-filter';
import type { FilterRule, Settings, ProfileInfo, KeywordMatchResult } from '@shared/types';

const EMPTY_SET: ReadonlySet<string> = new Set<string>();

export interface ClassifyInput {
  handle: string;
  displayName: string | null;
  isFadak: boolean;
  inFollow: boolean;
  isRetweet: boolean;
  isWhitelisted: boolean;
  retweeterHandle: string | null;
  retweeterInFollow: boolean;
  retweeterIsWhitelisted: boolean;
  retweeterIsCurrentUser: boolean;
  settings: Settings;
  activeFilterRules: FilterRule[];
  protectedKeywords: string[];
  profile: ProfileInfo | null;
  tweetText: string;
  pageType: PageType;
  /** 트윗 상세에서 들어간 트윗의 글쓴이 — 설정이 켜져 있으면 그 글쓴이의 앞뒤 타래는 숨기지 않는다 (#94) */
  isDetailAuthor: boolean;
}

export interface ClassifyResult {
  action: 'hide' | 'show' | 'skip';
  reason?: string;
  matchedRule?: string;
  packId?: string;
  category?: string;
}

export interface QuoteClassifyInput {
  quotedHandle: string | null;
  quotedIsFadak: boolean;
  quotedInFollow: boolean;
  quotedIsWhitelisted: boolean;
  /** 인용된 계정이 로그인한 본인 — 본인 트윗은 인용 카드 안에서도 숨기지 않는다 (#88) */
  quotedIsCurrentUser: boolean;
  /** 인용한 트윗이 상세 글쓴이의 트윗 — 글쓴이 타래 보기가 켜져 있으면 통째로 숨기지 않는다 (#94) */
  parentIsDetailAuthor: boolean;
  parentHandle: string;
  parentInFollow: boolean;
  parentIsWhitelisted: boolean;
  /** 리트위터가 화이트리스트·본인 — 팔로우 리트위터는 포함하지 않는다 (#120) */
  retweeterExempt: boolean;
  settings: Settings;
  pageType: PageType;
}

export interface QuoteClassifyResult {
  action: 'hide-entire' | 'hide-quote' | 'show';
  reason?: string;
}

/** 숨김 판정에 쓰이는 사람(작성자, 리트윗이면 리트위터) 한 명의 팔로우 정보 (#142) */
export interface DeferralSubject {
  /** 현재 계정의 팔로우 집합에 있는지 */
  inFollow: boolean;
  /** 이 탭이 API 응답으로 이 핸들의 팔로우 여부(팔로우 또는 팔로우 안 함)를 이미 알게 됐는지 */
  known: boolean;
}

/** 숨김 판정을 미룰지 가르는 입력 (#142) */
export interface HidingDeferralInput {
  /** xweb 문서인지 */
  isXweb: boolean;
  /** 저장된 팔로우 캐시가 있는지. 이 탭이 응답으로 받아 넣은 핸들은 세지 않는다 */
  hasFollowCache: boolean;
  /** 팔로우 정보를 기다리는 유예 시간이 지났는지 */
  graceElapsed: boolean;
  /** 판정에 팔로우 여부가 필요한 사람들. 리트윗이면 작성자와 리트위터다 */
  subjects: readonly DeferralSubject[];
}

/**
 * xweb 첫 방문에는 팔로우 여부를 아직 모르는 작성자의 숨김 판정을 미룬다 (순수 함수, #142).
 * xweb에는 팔로우 버튼 클릭 감지가 없어 팔로우는 API 응답으로만 알 수 있고, 트윗이 팔로우 정보보다 먼저 올 수 있다.
 * 다른 작성자의 정보가 먼저 와도 이 작성자는 계속 기다린다 — 팔로우한 사람의 글이 잠깐 숨겨졌다 복원되는 일을 막는다.
 * 기존 앱(rweb)과 팔로우 캐시가 있는 계정은 지금 동작 그대로 바로 판정한다.
 */
export function shouldDeferHiding(input: HidingDeferralInput): boolean {
  if (!input.isXweb || input.hasFollowCache || input.graceElapsed) return false;
  return input.subjects.some((subject) => !subject.inFollow && !subject.known);
}

/** 일반 트윗/리트윗 분류 (순수 함수, DOM 접근 없음) */
export function classifyTweet(input: ClassifyInput): ClassifyResult {
  const { handle, isFadak, inFollow, isRetweet, isWhitelisted, retweeterIsWhitelisted, retweeterIsCurrentUser, settings, activeFilterRules, profile, tweetText, pageType } = input;

  if (!settings.enabled) return { action: 'show', reason: 'disabled' };
  if (!isFadak) return { action: 'skip' };

  // 팔로우/화이트리스트 예외
  if (inFollow || isWhitelisted) return { action: 'show', reason: inFollow ? 'follow' : 'whitelist' };
  if (input.isDetailAuthor && settings.showAuthorThread) return { action: 'show', reason: 'detail-author' };
  if (profile && matchesProtectedKeyword(profile, input.protectedKeywords)) {
    return { action: 'show', reason: 'protected-keyword' };
  }

  // 리트위터 예외 (A6) — 화이트리스트/본인이 재게시한 파딱 트윗은 키워드/리트윗 숨김 경로보다 우선하여 표시.
  // 팔로우 리트위터는 예외가 아니다: '파딱 리트윗 숨기기' 설정을 따른다 (#120)
  if (isRetweet && (retweeterIsWhitelisted || retweeterIsCurrentUser)) {
    return { action: 'show', reason: retweeterIsWhitelisted ? 'retweeter-whitelist' : 'retweeter-self' };
  }

  // 선택 필터는 서로 독립적이며, 둘 다 켜면 OR로 판정한다.
  const selectiveFilterEnabled = settings.keywordFilterEnabled || settings.aggressorFilterEnabled;
  if (selectiveFilterEnabled) {
    const result: KeywordMatchResult = settings.keywordFilterEnabled && profile
      ? matchesKeywordFilter(profile, activeFilterRules, tweetText)
      : { matched: false };
    const aggressorMatched = Boolean(
      settings.aggressorFilterEnabled && profile && isAggressorProfile(profile),
    );
    if (!result.matched && !aggressorMatched) {
      const reason = settings.keywordFilterEnabled ? 'keyword-not-matched' : 'aggressor-not-matched';
      return { action: 'show', reason };
    }
    // 활성화된 조건 중 하나라도 매칭됨 — 숨김 진행, 키워드 매칭 정보가 있으면 포함
    if (isRetweet) {
      return classifyRetweet(settings, pageType, { matchedRule: result.matchedRule, packId: result.packId, category: result.category });
    }
    const hide = shouldHideTweet({
      settings, followList: EMPTY_SET as Set<string>, whitelist: EMPTY_SET as Set<string>,
      isFadak: true, handle: `@${handle}`, pageType,
    });
    return hide
      ? { action: 'hide', reason: aggressorMatched && !result.matched ? 'aggressor-profile' : 'fadak', matchedRule: result.matchedRule, packId: result.packId, category: result.category }
      : { action: 'show', reason: 'page-filter-off' };
  }

  // 키워드 필터 비활성 — 전체 파딱 숨김
  if (isRetweet) return classifyRetweet(settings, pageType);

  const hide = shouldHideTweet({
    settings, followList: EMPTY_SET as Set<string>, whitelist: EMPTY_SET as Set<string>,
    isFadak: true, handle: `@${handle}`, pageType,
  });
  return hide ? { action: 'hide', reason: 'fadak' } : { action: 'show', reason: 'page-filter-off' };
}

/** 숨김 방식 — 트윗 상세에서는 설정에 따라 완전 제거 대신 접어 두고 펼쳐볼 수 있게 한다 (#94) */
export function resolveHideMode(settings: Settings, pageType: PageType): Settings['hideMode'] {
  return pageType === 'replies' && settings.collapseOnDetail ? 'collapse' : settings.hideMode;
}

/** 파딱 리트윗 분류 — 필터링 범위가 꺼진 화면이면 리트윗 필터와 무관하게 표시 */
function classifyRetweet(settings: Settings, pageType: PageType, match: Partial<Pick<ClassifyResult, 'matchedRule' | 'packId' | 'category'>> = {}): ClassifyResult {
  if (!isPageFilterEnabled(settings, pageType)) return { action: 'show', reason: 'page-filter-off' };
  return shouldHideRetweet({ settings, isFadak: true, isRetweet: true })
    ? { action: 'hide', reason: 'retweet', ...match }
    : { action: 'show', reason: 'retweet-filter-off' };
}

/** 인용 트윗 분류 (순수 함수) */
export function classifyQuote(input: QuoteClassifyInput): QuoteClassifyResult {
  const { quotedHandle, quotedIsFadak, quotedInFollow, quotedIsWhitelisted, quotedIsCurrentUser, parentHandle, parentInFollow, parentIsWhitelisted, retweeterExempt, settings, pageType } = input;
  // 셀프 인용 표시는 팔로우·화이트리스트 모두, hide-entire 다운그레이드는 화이트리스트만 (팔로우 인용자는 설정대로 전체 숨김, #120)
  const parentSelfQuoteExempt = parentInFollow || parentIsWhitelisted;
  const parentDowngradeExempt = parentIsWhitelisted;
  const parentDetailExempt = input.parentIsDetailAuthor && settings.showAuthorThread;

  // self-quote: 예외 부모(팔로우/화이트리스트/상세 글쓴이)가 자기 트윗을 인용
  if (quotedHandle !== null && quotedHandle.toLowerCase() === parentHandle.toLowerCase()) {
    if (parentSelfQuoteExempt) return { action: 'show', reason: parentInFollow ? 'self-quote-followed' : 'self-quote-whitelisted' };
    if (parentDetailExempt) return { action: 'show', reason: 'self-quote-detail-author' };
  }

  if (!quotedIsFadak) return { action: 'show', reason: 'not-fadak' };
  if (quotedIsCurrentUser) return { action: 'show', reason: 'quoted-self' };
  if (quotedInFollow || quotedIsWhitelisted) return { action: 'show', reason: quotedInFollow ? 'follow' : 'whitelist' };
  if (!isPageFilterEnabled(settings, pageType)) return { action: 'show', reason: 'page-filter-off' };

  const quoteAction = getQuoteAction(settings, true);
  if (quoteAction === 'hide-entire') {
    // A2/A6: 화이트리스트 부모 또는 화이트리스트·본인 리트위터의 트윗 전체는 숨기지 않음 — 인용 파딱 카드만 접기로 다운그레이드
    if (parentDowngradeExempt || retweeterExempt) {
      return { action: 'hide-quote', reason: parentDowngradeExempt ? 'quote-fadak-parent-exempt' : 'quote-fadak-retweeter-exempt' };
    }
    if (parentDetailExempt) return { action: 'hide-quote', reason: 'quote-fadak-detail-author' };
    return { action: 'hide-entire', reason: 'quote-fadak' };
  }
  if (quoteAction === 'hide-quote') return { action: 'hide-quote', reason: 'quote-fadak' };
  return { action: 'show', reason: 'quote-filter-off' };
}
