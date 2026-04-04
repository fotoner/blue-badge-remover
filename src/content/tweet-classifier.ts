// src/content/tweet-classifier.ts
// 순수 분류 함수: DOM 접근 없이 입력 데이터만으로 트윗 숨김 판정.
import { shouldHideTweet, shouldHideRetweet, getQuoteAction } from '@features/content-filter';
import { matchesKeywordFilter } from '@features/keyword-filter';
import type { FilterRule, Settings, ProfileInfo, KeywordMatchResult } from '@shared/types';

export interface ClassifyInput {
  handle: string;
  displayName: string | null;
  isFadak: boolean;
  inFollow: boolean;
  isRetweet: boolean;
  isWhitelisted: boolean;
  settings: Settings;
  activeFilterRules: FilterRule[];
  profile: ProfileInfo | null;
  tweetText: string;
  pageType: string;
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
  parentHandle: string;
  parentInFollow: boolean;
  settings: Settings;
}

export interface QuoteClassifyResult {
  action: 'hide-entire' | 'hide-quote' | 'show';
  reason?: string;
}

/** 일반 트윗/리트윗 분류 (순수 함수, DOM 접근 없음) */
export function classifyTweet(input: ClassifyInput): ClassifyResult {
  const { handle, isFadak, inFollow, isRetweet, isWhitelisted, settings, activeFilterRules, profile, tweetText, pageType } = input;

  if (!isFadak) return { action: 'skip' };

  // 팔로우/화이트리스트 예외
  if (inFollow || isWhitelisted) return { action: 'show', reason: inFollow ? 'follow' : 'whitelist' };

  // 키워드 필터 체크
  if (settings.keywordFilterEnabled && profile) {
    const result: KeywordMatchResult = matchesKeywordFilter(profile, activeFilterRules, tweetText);
    if (!result.matched) return { action: 'show', reason: 'keyword-not-matched' };
    // 키워드 매칭됨 — 숨김 진행, 매칭 정보 포함
    if (isRetweet) {
      const shouldHide = shouldHideRetweet({ settings, isFadak: true, isRetweet: true });
      return shouldHide
        ? { action: 'hide', reason: 'retweet', matchedRule: result.matchedRule, packId: result.packId, category: result.category }
        : { action: 'show', reason: 'retweet-filter-off' };
    }
    const hide = shouldHideTweet({
      settings, followList: new Set<string>(), whitelist: new Set<string>(),
      isFadak: true, handle: `@${handle}`, pageType,
    });
    return hide
      ? { action: 'hide', reason: 'fadak', matchedRule: result.matchedRule, packId: result.packId, category: result.category }
      : { action: 'show', reason: 'page-filter-off' };
  }

  // 키워드 필터 비활성 — 전체 파딱 숨김
  if (isRetweet) {
    const shouldHide = shouldHideRetweet({ settings, isFadak: true, isRetweet: true });
    return shouldHide ? { action: 'hide', reason: 'retweet' } : { action: 'show', reason: 'retweet-filter-off' };
  }

  const hide = shouldHideTweet({
    settings, followList: new Set<string>(), whitelist: new Set<string>(),
    isFadak: true, handle: `@${handle}`, pageType,
  });
  return hide ? { action: 'hide', reason: 'fadak' } : { action: 'show', reason: 'page-filter-off' };
}

/** 인용 트윗 분류 (순수 함수) */
export function classifyQuote(input: QuoteClassifyInput): QuoteClassifyResult {
  const { quotedHandle, quotedIsFadak, quotedInFollow, quotedIsWhitelisted, parentHandle, parentInFollow, settings } = input;

  // self-quote: 부모가 팔로우 중이고 자기 트윗을 인용
  if (quotedHandle !== null && quotedHandle.toLowerCase() === parentHandle.toLowerCase() && parentInFollow) {
    return { action: 'show', reason: 'self-quote-followed' };
  }

  if (!quotedIsFadak) return { action: 'show', reason: 'not-fadak' };
  if (quotedInFollow || quotedIsWhitelisted) return { action: 'show', reason: quotedInFollow ? 'follow' : 'whitelist' };

  const quoteAction = getQuoteAction(settings, true);
  if (quoteAction === 'hide-entire') return { action: 'hide-entire', reason: 'quote-fadak' };
  if (quoteAction === 'hide-quote') return { action: 'hide-quote', reason: 'quote-fadak' };
  return { action: 'show', reason: 'quote-filter-off' };
}
