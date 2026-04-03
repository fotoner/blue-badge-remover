import { describe, it, expect } from 'vitest';
import { classifyTweet, type TweetContext, type TweetAction } from '../../src/content/tweet-classifier';
import type { Settings, FilterRule } from '../../src/shared/types';

function makeSettings(overrides: Partial<Settings> = {}): Settings {
  return {
    enabled: true,
    filter: { timeline: true, replies: true, search: true, bookmarks: false },
    hideMode: 'remove',
    retweetFilter: true,
    quoteMode: 'off',
    debugMode: false,
    language: 'ko',
    keywordFilterEnabled: false,
    keywordCollectorEnabled: false,
    defaultFilterEnabled: true,
    ...overrides,
  };
}

function makeContext(overrides: Partial<TweetContext> = {}): TweetContext {
  return {
    handle: 'fadak_user',
    displayName: '파딱유저',
    bio: '',
    tweetText: '트윗 내용',
    isFadak: true,
    isFollowed: false,
    isWhitelisted: false,
    isCurrentUser: false,
    isRetweet: false,
    isProfilePage: false,
    hasQuote: false,
    quoteAuthorHandle: null,
    isQuoteAuthorFadak: false,
    isQuoteAuthorFollowed: false,
    isQuoteAuthorWhitelisted: false,
    pageType: 'timeline',
    ...overrides,
  };
}

const NO_RULES: FilterRule[] = [];

// --- 기본 시나리오 ---

describe('classifyTweet — 기본', () => {
  it('비파딱 트윗은 show', () => {
    const result = classifyTweet(makeContext({ isFadak: false }), makeSettings(), NO_RULES);
    expect(result.type).toBe('show');
    expect(result.reason).toBe('not-fadak');
  });

  it('파딱 트윗 타임라인에서 hide', () => {
    const result = classifyTweet(makeContext(), makeSettings(), NO_RULES);
    expect(result.type).toBe('hide');
    expect(result.reason).toBe('fadak');
  });

  it('파딱 + 팔로우 → show', () => {
    const result = classifyTweet(makeContext({ isFollowed: true }), makeSettings(), NO_RULES);
    expect(result.type).toBe('show');
    expect(result.reason).toBe('followed');
  });

  it('파딱 + 화이트리스트 → show', () => {
    const result = classifyTweet(makeContext({ isWhitelisted: true }), makeSettings(), NO_RULES);
    expect(result.type).toBe('show');
    expect(result.reason).toBe('whitelisted');
  });

  it('자기 자신의 트윗 → show', () => {
    const result = classifyTweet(makeContext({ isCurrentUser: true }), makeSettings(), NO_RULES);
    expect(result.type).toBe('show');
    expect(result.reason).toBe('own-tweet');
  });

  it('extension disabled → show', () => {
    const result = classifyTweet(makeContext(), makeSettings({ enabled: false }), NO_RULES);
    expect(result.type).toBe('show');
    expect(result.reason).toBe('extension-disabled');
  });

  it('프로필 페이지 → show', () => {
    const result = classifyTweet(makeContext({ isProfilePage: true }), makeSettings(), NO_RULES);
    expect(result.type).toBe('show');
    expect(result.reason).toBe('profile-page');
  });
});

// --- 페이지 스코프 ---

describe('classifyTweet — 페이지 스코프', () => {
  it('타임라인 filter.timeline=true → hide', () => {
    const result = classifyTweet(
      makeContext({ pageType: 'timeline' }),
      makeSettings({ filter: { timeline: true, replies: true, search: true, bookmarks: false } }),
      NO_RULES,
    );
    expect(result.type).toBe('hide');
  });

  it('타임라인 filter.timeline=false → show', () => {
    const result = classifyTweet(
      makeContext({ pageType: 'timeline' }),
      makeSettings({ filter: { timeline: false, replies: true, search: true, bookmarks: false } }),
      NO_RULES,
    );
    expect(result.type).toBe('show');
  });

  it('답글 filter.replies=true → hide', () => {
    const result = classifyTweet(
      makeContext({ pageType: 'replies' }),
      makeSettings({ filter: { timeline: true, replies: true, search: true, bookmarks: false } }),
      NO_RULES,
    );
    expect(result.type).toBe('hide');
  });

  it('검색 filter.search=false → show', () => {
    const result = classifyTweet(
      makeContext({ pageType: 'search' }),
      makeSettings({ filter: { timeline: true, replies: true, search: false, bookmarks: false } }),
      NO_RULES,
    );
    expect(result.type).toBe('show');
  });

  it('북마크 기본값 (false) → show', () => {
    const result = classifyTweet(
      makeContext({ pageType: 'bookmarks' }),
      makeSettings(),
      NO_RULES,
    );
    expect(result.type).toBe('show');
  });

  it('북마크 filter.bookmarks=true → hide', () => {
    const result = classifyTweet(
      makeContext({ pageType: 'bookmarks' }),
      makeSettings({ filter: { timeline: true, replies: true, search: true, bookmarks: true } }),
      NO_RULES,
    );
    expect(result.type).toBe('hide');
  });
});

// --- 리트윗 ---

describe('classifyTweet — 리트윗', () => {
  it('파딱 리트윗 + retweetFilter=true → hide', () => {
    const result = classifyTweet(
      makeContext({ isRetweet: true }),
      makeSettings({ retweetFilter: true }),
      NO_RULES,
    );
    expect(result.type).toBe('hide');
    expect(result.reason).toBe('retweet');
  });

  it('파딱 리트윗 + retweetFilter=false → show', () => {
    const result = classifyTweet(
      makeContext({ isRetweet: true }),
      makeSettings({ retweetFilter: false }),
      NO_RULES,
    );
    expect(result.type).toBe('show');
    expect(result.reason).toBe('retweet-filter-off');
  });

  it('비파딱 리트윗 → show', () => {
    const result = classifyTweet(
      makeContext({ isFadak: false, isRetweet: true }),
      makeSettings(),
      NO_RULES,
    );
    expect(result.type).toBe('show');
    expect(result.reason).toBe('not-fadak');
  });

  it('파딱 리트윗 + 팔로우 → show', () => {
    const result = classifyTweet(
      makeContext({ isRetweet: true, isFollowed: true }),
      makeSettings(),
      NO_RULES,
    );
    expect(result.type).toBe('show');
    expect(result.reason).toBe('retweet-followed');
  });

  it('파딱 리트윗 + 화이트리스트 → show', () => {
    const result = classifyTweet(
      makeContext({ isRetweet: true, isWhitelisted: true }),
      makeSettings(),
      NO_RULES,
    );
    expect(result.type).toBe('show');
    expect(result.reason).toBe('retweet-whitelisted');
  });
});

// --- 인용 ---

describe('classifyTweet — 인용', () => {
  it('인용 파딱 + quoteMode=off → show', () => {
    const result = classifyTweet(
      makeContext({
        isFadak: false,
        hasQuote: true,
        quoteAuthorHandle: 'quoted_fadak',
        isQuoteAuthorFadak: true,
      }),
      makeSettings({ quoteMode: 'off' }),
      NO_RULES,
    );
    expect(result.type).toBe('show');
    expect(result.reason).toBe('quote-mode-off');
  });

  it('인용 파딱 + quoteMode=quote-only → hide-quote', () => {
    const result = classifyTweet(
      makeContext({
        isFadak: false,
        hasQuote: true,
        quoteAuthorHandle: 'quoted_fadak',
        isQuoteAuthorFadak: true,
      }),
      makeSettings({ quoteMode: 'quote-only' }),
      NO_RULES,
    );
    expect(result.type).toBe('hide-quote');
    expect(result.reason).toBe('quote-only');
  });

  it('인용 파딱 + quoteMode=entire → hide', () => {
    const result = classifyTweet(
      makeContext({
        isFadak: false,
        hasQuote: true,
        quoteAuthorHandle: 'quoted_fadak',
        isQuoteAuthorFadak: true,
      }),
      makeSettings({ quoteMode: 'entire' }),
      NO_RULES,
    );
    expect(result.type).toBe('hide');
    expect(result.reason).toBe('quote-entire');
  });

  it('인용 파딱 + 팔로우 → show', () => {
    const result = classifyTweet(
      makeContext({
        isFadak: false,
        hasQuote: true,
        quoteAuthorHandle: 'quoted_fadak',
        isQuoteAuthorFadak: true,
        isQuoteAuthorFollowed: true,
      }),
      makeSettings({ quoteMode: 'entire' }),
      NO_RULES,
    );
    expect(result.type).toBe('show');
    expect(result.reason).toBe('quote-followed');
  });

  it('인용 비파딱 → show', () => {
    const result = classifyTweet(
      makeContext({
        isFadak: false,
        hasQuote: true,
        quoteAuthorHandle: 'normal_user',
        isQuoteAuthorFadak: false,
      }),
      makeSettings({ quoteMode: 'entire' }),
      NO_RULES,
    );
    expect(result.type).toBe('show');
    expect(result.reason).toBe('quote-not-fadak');
  });
});

// --- 키워드 필터 ---

describe('classifyTweet — 키워드 필터', () => {
  const keywordRules: FilterRule[] = [
    { type: 'keyword', value: '코인' },
    { type: 'keyword', value: 'btc' },
  ];

  it('키워드 매칭 → hide', () => {
    const result = classifyTweet(
      makeContext({ bio: '코인 투자 전문가' }),
      makeSettings({ keywordFilterEnabled: true }),
      keywordRules,
    );
    expect(result.type).toBe('hide');
    expect(result.reason).toBe('fadak');
  });

  it('키워드 미매칭 → show (badge override)', () => {
    const result = classifyTweet(
      makeContext({ bio: '일반 사용자' }),
      makeSettings({ keywordFilterEnabled: true }),
      keywordRules,
    );
    expect(result.type).toBe('show');
    expect(result.reason).toBe('keyword-no-match');
  });

  it('키워드 필터 비활성 → badge만으로 hide', () => {
    const result = classifyTweet(
      makeContext({ bio: '일반 사용자' }),
      makeSettings({ keywordFilterEnabled: false }),
      keywordRules,
    );
    expect(result.type).toBe('hide');
    expect(result.reason).toBe('fadak');
  });

  it('리트윗 + 키워드 매칭 → hide', () => {
    const result = classifyTweet(
      makeContext({ isRetweet: true, bio: 'btc maximalist' }),
      makeSettings({ keywordFilterEnabled: true }),
      keywordRules,
    );
    expect(result.type).toBe('hide');
    expect(result.reason).toBe('retweet');
  });

  it('리트윗 + 키워드 미매칭 → show', () => {
    const result = classifyTweet(
      makeContext({ isRetweet: true, bio: '좋은 사람' }),
      makeSettings({ keywordFilterEnabled: true }),
      keywordRules,
    );
    expect(result.type).toBe('show');
    expect(result.reason).toBe('retweet-keyword-no-match');
  });

  const exceptionRules: FilterRule[] = [
    { type: 'keyword', value: '코인' },
    { type: 'exception', handle: 'trusted_fadak' },
  ];

  it('예외 핸들 → show (keyword filter exception)', () => {
    const result = classifyTweet(
      makeContext({ handle: 'trusted_fadak', bio: '코인 투자 전문가' }),
      makeSettings({ keywordFilterEnabled: true }),
      exceptionRules,
    );
    expect(result.type).toBe('show');
    expect(result.reason).toBe('keyword-no-match');
  });
});

// --- hide 모드 ---

describe('classifyTweet — hideMode', () => {
  it('hideMode=remove → mode: remove', () => {
    const result = classifyTweet(makeContext(), makeSettings({ hideMode: 'remove' }), NO_RULES);
    expect(result.type).toBe('hide');
    if (result.type === 'hide') expect(result.mode).toBe('remove');
  });

  it('hideMode=collapse → mode: collapse', () => {
    const result = classifyTweet(makeContext(), makeSettings({ hideMode: 'collapse' }), NO_RULES);
    expect(result.type).toBe('hide');
    if (result.type === 'hide') expect(result.mode).toBe('collapse');
  });
});

// --- 복합 시나리오 ---

describe('classifyTweet — 우선순위', () => {
  it('파딱 + 팔로우 + 키워드 매칭 → show (팔로우 우선)', () => {
    const rules: FilterRule[] = [{ type: 'keyword', value: '코인' }];
    const result = classifyTweet(
      makeContext({ isFollowed: true, bio: '코인 전문가' }),
      makeSettings({ keywordFilterEnabled: true }),
      rules,
    );
    expect(result.type).toBe('show');
    expect(result.reason).toBe('followed');
  });

  it('파딱 + 화이트리스트 + 키워드 매칭 → show (화이트리스트 우선)', () => {
    const rules: FilterRule[] = [{ type: 'keyword', value: '코인' }];
    const result = classifyTweet(
      makeContext({ isWhitelisted: true, bio: '코인 전문가' }),
      makeSettings({ keywordFilterEnabled: true }),
      rules,
    );
    expect(result.type).toBe('show');
    expect(result.reason).toBe('whitelisted');
  });

  it('비파딱 + 인용 파딱 → 인용만 처리', () => {
    const result = classifyTweet(
      makeContext({
        isFadak: false,
        hasQuote: true,
        quoteAuthorHandle: 'fadak_quoted',
        isQuoteAuthorFadak: true,
      }),
      makeSettings({ quoteMode: 'quote-only' }),
      NO_RULES,
    );
    expect(result.type).toBe('hide-quote');
  });
});
