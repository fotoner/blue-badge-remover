// src/content/tweet-classifier.ts
// 순수 함수로 트윗 숨김 여부를 판정. DOM, 캐시, chrome API 의존 없음.
import type { Settings, FilterRule, ProfileInfo } from '@shared/types';
import { matchesKeywordFilter } from '@features/keyword-filter';
import type { PageType, QuoteAction } from '@features/content-filter';

export interface TweetContext {
  handle: string;
  displayName: string;
  bio: string;
  tweetText: string;
  isFadak: boolean;
  isFollowed: boolean;
  isWhitelisted: boolean;
  isCurrentUser: boolean;
  isRetweet: boolean;
  isProfilePage: boolean;
  hasQuote: boolean;
  quoteAuthorHandle: string | null;
  isQuoteAuthorFadak: boolean;
  isQuoteAuthorFollowed: boolean;
  isQuoteAuthorWhitelisted: boolean;
  pageType: PageType;
}

export type TweetAction =
  | { type: 'show'; reason: string }
  | { type: 'hide'; reason: string; mode: 'remove' | 'collapse' }
  | { type: 'hide-quote'; reason: string };

export function classifyTweet(
  ctx: TweetContext,
  settings: Settings,
  filterRules: FilterRule[],
): TweetAction {
  if (!settings.enabled) return show('extension-disabled');
  if (ctx.isProfilePage) return show('profile-page');
  if (ctx.isCurrentUser) return show('own-tweet');
  if (!ctx.isFadak && !ctx.hasQuote) return show('not-fadak');

  // --- 리트윗 ---
  if (ctx.isRetweet) {
    return classifyRetweet(ctx, settings, filterRules);
  }

  // --- 파딱 + 팔로우/화이트리스트 예외 ---
  if (ctx.isFadak && ctx.isFollowed) return show('followed');
  if (ctx.isFadak && ctx.isWhitelisted) return show('whitelisted');

  // --- 파딱 + 키워드 필터 ---
  if (ctx.isFadak) {
    if (settings.keywordFilterEnabled) {
      const profile: ProfileInfo = {
        handle: ctx.handle,
        displayName: ctx.displayName,
        bio: ctx.bio,
      };
      const { matched } = matchesKeywordFilter(profile, filterRules, ctx.tweetText);
      if (!matched) return show('keyword-no-match');
    }
    const shouldHide = checkPageScope(settings, ctx.pageType);
    if (shouldHide) {
      return hide(settings.hideMode, 'fadak');
    }
  }

  // --- 인용 트윗 ---
  if (ctx.hasQuote) {
    return classifyQuote(ctx, settings);
  }

  return show('no-action');
}

function classifyRetweet(
  ctx: TweetContext,
  settings: Settings,
  filterRules: FilterRule[],
): TweetAction {
  if (!ctx.isFadak) return show('retweet-not-fadak');
  if (ctx.isFollowed) return show('retweet-followed');
  if (ctx.isWhitelisted) return show('retweet-whitelisted');

  if (settings.keywordFilterEnabled) {
    const profile: ProfileInfo = {
      handle: ctx.handle,
      displayName: ctx.displayName,
      bio: ctx.bio,
    };
    const { matched } = matchesKeywordFilter(profile, filterRules, ctx.tweetText);
    if (!matched) return show('retweet-keyword-no-match');
  }

  if (!settings.retweetFilter) return show('retweet-filter-off');
  return hide(settings.hideMode, 'retweet');
}

function classifyQuote(ctx: TweetContext, settings: Settings): TweetAction {
  if (!ctx.isQuoteAuthorFadak) return show('quote-not-fadak');
  if (ctx.isQuoteAuthorFollowed) return show('quote-followed');
  if (ctx.isQuoteAuthorWhitelisted) return show('quote-whitelisted');

  const action = getQuoteAction(settings);
  if (action === 'hide-entire') {
    return hide(settings.hideMode, 'quote-entire');
  }
  if (action === 'hide-quote') {
    return { type: 'hide-quote', reason: 'quote-only' };
  }
  return show('quote-mode-off');
}

function getQuoteAction(settings: Settings): QuoteAction {
  if (settings.quoteMode === 'off') return 'none';
  return settings.quoteMode === 'quote-only' ? 'hide-quote' : 'hide-entire';
}

function checkPageScope(settings: Settings, pageType: PageType): boolean {
  const map: Record<PageType, boolean> = {
    timeline: settings.filter.timeline,
    replies: settings.filter.replies,
    search: settings.filter.search,
    bookmarks: settings.filter.bookmarks,
  };
  return map[pageType] ?? false;
}

function show(reason: string): TweetAction {
  return { type: 'show', reason };
}

function hide(mode: 'remove' | 'collapse', reason: string): TweetAction {
  return { type: mode === 'collapse' ? 'hide' : 'hide', reason, mode };
}
