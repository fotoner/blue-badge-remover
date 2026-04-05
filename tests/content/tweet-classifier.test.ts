import { describe, it, expect } from 'vitest';
import { classifyTweet, classifyQuote } from '../../src/content/tweet-classifier';
import type { ClassifyInput, QuoteClassifyInput } from '../../src/content/tweet-classifier';
import type { Settings } from '../../src/shared/types';

const defaultSettings: Settings = {
  enabled: true,
  filter: { timeline: true, replies: true, search: true, bookmarks: false, lists: true },
  hideMode: 'collapse',
  retweetFilter: true,
  quoteMode: 'quote-only',
  debugMode: false,
  language: 'ko',
  keywordFilterEnabled: false,
  keywordCollectorEnabled: false,
  defaultFilterEnabled: true,
};

function makeInput(overrides: Partial<ClassifyInput> = {}): ClassifyInput {
  return {
    handle: 'fadak_user',
    displayName: '파딱유저',
    isFadak: true,
    inFollow: false,
    isRetweet: false,
    isWhitelisted: false,
    settings: defaultSettings,
    activeFilterRules: [],
    profile: { handle: 'fadak_user', displayName: '파딱유저', bio: '' },
    tweetText: '일반 트윗',
    pageType: 'timeline',
    ...overrides,
  };
}

describe('classifyTweet', () => {
  it('비파딱은 skip', () => {
    const result = classifyTweet(makeInput({ isFadak: false }));
    expect(result.action).toBe('skip');
  });

  it('파딱 + 팔로우 = show', () => {
    const result = classifyTweet(makeInput({ inFollow: true }));
    expect(result.action).toBe('show');
    expect(result.reason).toBe('follow');
  });

  it('파딱 + 화이트리스트 = show', () => {
    const result = classifyTweet(makeInput({ isWhitelisted: true }));
    expect(result.action).toBe('show');
    expect(result.reason).toBe('whitelist');
  });

  it('파딱 + 팔로우 안 함 = hide', () => {
    const result = classifyTweet(makeInput());
    expect(result.action).toBe('hide');
    expect(result.reason).toBe('fadak');
  });

  it('키워드 필터 ON + 매칭 안 됨 = show', () => {
    const result = classifyTweet(makeInput({
      settings: { ...defaultSettings, keywordFilterEnabled: true },
      activeFilterRules: [{ type: 'keyword', value: '없는키워드' }],
      tweetText: '일반 트윗',
    }));
    expect(result.action).toBe('show');
    expect(result.reason).toBe('keyword-not-matched');
  });

  it('키워드 필터 ON + 매칭 됨 = hide with matchedRule', () => {
    const result = classifyTweet(makeInput({
      settings: { ...defaultSettings, keywordFilterEnabled: true },
      activeFilterRules: [{ type: 'keyword', value: '비트코인', packId: 'crypto-pack', category: '코인' }],
      profile: { handle: 'fadak_user', displayName: '파딱유저', bio: '비트코인 전문가' },
      tweetText: '',
    }));
    expect(result.action).toBe('hide');
    expect(result.matchedRule).toBe('비트코인');
    expect(result.packId).toBe('crypto-pack');
    expect(result.category).toBe('코인');
  });

  it('리트윗 + 파딱 = hide', () => {
    const result = classifyTweet(makeInput({ isRetweet: true }));
    expect(result.action).toBe('hide');
    expect(result.reason).toBe('retweet');
  });

  it('리트윗 필터 OFF = show', () => {
    const result = classifyTweet(makeInput({
      isRetweet: true,
      settings: { ...defaultSettings, retweetFilter: false },
    }));
    expect(result.action).toBe('show');
  });
});

describe('classifyQuote', () => {
  function makeQuoteInput(overrides: Partial<QuoteClassifyInput> = {}): QuoteClassifyInput {
    return {
      quotedHandle: 'quoted_fadak',
      quotedIsFadak: true,
      quotedInFollow: false,
      quotedIsWhitelisted: false,
      parentHandle: 'parent_user',
      parentInFollow: false,
      settings: defaultSettings,
      ...overrides,
    };
  }

  it('인용된 계정이 비파딱 = show', () => {
    const result = classifyQuote(makeQuoteInput({ quotedIsFadak: false }));
    expect(result.action).toBe('show');
  });

  it('인용된 계정이 팔로우 = show', () => {
    const result = classifyQuote(makeQuoteInput({ quotedInFollow: true }));
    expect(result.action).toBe('show');
    expect(result.reason).toBe('follow');
  });

  it('self-quote + 부모 팔로우 = show', () => {
    const result = classifyQuote(makeQuoteInput({
      quotedHandle: 'same_user',
      parentHandle: 'same_user',
      parentInFollow: true,
    }));
    expect(result.action).toBe('show');
    expect(result.reason).toBe('self-quote-followed');
  });

  it('인용 파딱 + quoteMode=quote-only = hide-quote', () => {
    const result = classifyQuote(makeQuoteInput());
    expect(result.action).toBe('hide-quote');
  });

  it('인용 파딱 + quoteMode=entire = hide-entire', () => {
    const result = classifyQuote(makeQuoteInput({
      settings: { ...defaultSettings, quoteMode: 'entire' },
    }));
    expect(result.action).toBe('hide-entire');
  });

  it('인용 파딱 + quoteMode=off = show', () => {
    const result = classifyQuote(makeQuoteInput({
      settings: { ...defaultSettings, quoteMode: 'off' },
    }));
    expect(result.action).toBe('show');
  });
});
