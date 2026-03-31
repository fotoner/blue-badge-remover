// tests/features/content-filter/tweet-processor.test.ts
import { describe, it, expect } from 'vitest';
import { shouldHideTweet, shouldHideRetweet, getQuoteAction } from '@features/content-filter/tweet-processor';
import type { Settings } from '@shared/types';
import { DEFAULT_SETTINGS } from '@shared/constants';

const baseContext = {
  settings: DEFAULT_SETTINGS,
  followList: new Set<string>(),
  whitelist: new Set<string>(),
  isFadak: true,
  userId: '12345',
  handle: '@fadakuser',
  pageType: 'timeline' as const,
};

describe('shouldHideTweet', () => {
  it('should hide fadak tweet on timeline', () => {
    expect(shouldHideTweet(baseContext)).toBe(true);
  });

  it('should not hide when extension is disabled', () => {
    const ctx = { ...baseContext, settings: { ...DEFAULT_SETTINGS, enabled: false } };
    expect(shouldHideTweet(ctx)).toBe(false);
  });

  // followList 체크는 content script 레벨에서 수행 (idToHandle 매핑 필요)

  it('should not hide when user is in whitelist', () => {
    const ctx = { ...baseContext, whitelist: new Set(['@fadakuser']) };
    expect(shouldHideTweet(ctx)).toBe(false);
  });

  it('should not hide non-fadak user', () => {
    const ctx = { ...baseContext, isFadak: false };
    expect(shouldHideTweet(ctx)).toBe(false);
  });

  it('should not hide when timeline filter is off', () => {
    const settings: Settings = {
      ...DEFAULT_SETTINGS,
      filter: { ...DEFAULT_SETTINGS.filter, timeline: false },
    };
    const ctx = { ...baseContext, settings };
    expect(shouldHideTweet(ctx)).toBe(false);
  });

  it('should respect replies filter setting', () => {
    const ctx = { ...baseContext, pageType: 'replies' as const };
    expect(shouldHideTweet(ctx)).toBe(true);

    const settings: Settings = {
      ...DEFAULT_SETTINGS,
      filter: { ...DEFAULT_SETTINGS.filter, replies: false },
    };
    expect(shouldHideTweet({ ...ctx, settings })).toBe(false);
  });

  it('should respect search filter setting', () => {
    const ctx = { ...baseContext, pageType: 'search' as const };
    expect(shouldHideTweet(ctx)).toBe(true);
  });

  it('should not hide on bookmarks page when bookmarks filter is off (default)', () => {
    const ctx = { ...baseContext, pageType: 'bookmarks' as const };
    expect(shouldHideTweet(ctx)).toBe(false);
  });

  it('should hide on bookmarks page when bookmarks filter is on', () => {
    const settings: Settings = {
      ...DEFAULT_SETTINGS,
      filter: { ...DEFAULT_SETTINGS.filter, bookmarks: true },
    };
    const ctx = { ...baseContext, settings, pageType: 'bookmarks' as const };
    expect(shouldHideTweet(ctx)).toBe(true);
  });
});

describe('shouldHideRetweet', () => {
  it('should hide retweet of fadak when retweetFilter is on', () => {
    expect(shouldHideRetweet({ settings: { ...DEFAULT_SETTINGS, retweetFilter: true }, isFadak: true, isRetweet: true })).toBe(true);
  });

  it('should not hide retweet when retweetFilter is off', () => {
    expect(shouldHideRetweet({ settings: { ...DEFAULT_SETTINGS, retweetFilter: false }, isFadak: true, isRetweet: true })).toBe(false);
  });

  it('should not hide retweet of non-fadak', () => {
    expect(shouldHideRetweet({ settings: DEFAULT_SETTINGS, isFadak: false, isRetweet: true })).toBe(false);
  });
});

describe('getQuoteAction', () => {
  it('should return none when quoteMode is off', () => {
    expect(getQuoteAction({ ...DEFAULT_SETTINGS, quoteMode: 'off' }, true)).toBe('none');
  });

  it('should return hide-quote when quoteMode is quote-only and quote is fadak', () => {
    expect(getQuoteAction({ ...DEFAULT_SETTINGS, quoteMode: 'quote-only' }, true)).toBe('hide-quote');
  });

  it('should return hide-entire when quoteMode is entire and quote is fadak', () => {
    expect(getQuoteAction({ ...DEFAULT_SETTINGS, quoteMode: 'entire' }, true)).toBe('hide-entire');
  });

  it('should return none when quoted user is not fadak', () => {
    expect(getQuoteAction({ ...DEFAULT_SETTINGS, quoteMode: 'entire' }, false)).toBe('none');
  });
});
