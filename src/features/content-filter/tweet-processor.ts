// src/features/content-filter/tweet-processor.ts
import type { Settings } from '@shared/types';

export type PageType = 'timeline' | 'replies' | 'search' | 'bookmarks';

export interface TweetContext {
  settings: Settings;
  followList: Set<string>;
  whitelist: Set<string>;
  isFadak: boolean;
  userId: string;
  handle: string;
  pageType: PageType;
}

export function shouldHideTweet(ctx: TweetContext): boolean {
  if (!ctx.settings.enabled) return false;
  if (!ctx.isFadak) return false;
  // followList 체크는 content script에서 수행 (idToHandle 매핑 필요)
  // 여기서는 whitelist만 체크
  if (ctx.whitelist.has(ctx.handle)) return false;

  const filterMap: Record<PageType, boolean> = {
    timeline: ctx.settings.filter.timeline,
    replies: ctx.settings.filter.replies,
    search: ctx.settings.filter.search,
    bookmarks: ctx.settings.filter.bookmarks,
  };

  return filterMap[ctx.pageType] ?? false;
}

export interface RetweetContext {
  settings: Settings;
  isFadak: boolean;
  isRetweet: boolean;
}

export function shouldHideRetweet(ctx: RetweetContext): boolean {
  if (!ctx.isRetweet || !ctx.isFadak) return false;
  return ctx.settings.retweetFilter;
}

export type QuoteAction = 'none' | 'hide-quote' | 'hide-entire';

export function getQuoteAction(settings: Settings, isQuotedUserFadak: boolean): QuoteAction {
  if (!isQuotedUserFadak || settings.quoteMode === 'off') return 'none';
  return settings.quoteMode === 'quote-only' ? 'hide-quote' : 'hide-entire';
}
