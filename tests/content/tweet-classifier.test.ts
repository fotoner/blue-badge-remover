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
  milestoneBannerEnabled: false,
};

function makeInput(overrides: Partial<ClassifyInput> = {}): ClassifyInput {
  return {
    handle: 'fadak_user',
    displayName: '파딱유저',
    isFadak: true,
    inFollow: false,
    isRetweet: false,
    isWhitelisted: false,
    retweeterHandle: null,
    retweeterInFollow: false,
    retweeterIsWhitelisted: false,
    retweeterIsCurrentUser: false,
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

  // --- A6: 리트위터 팔로우/화이트리스트 예외 ---

  it('리트윗 + 리트위터 팔로우 = show (retweeter-follow)', () => {
    const result = classifyTweet(makeInput({
      isRetweet: true,
      retweeterHandle: 'rt_user',
      retweeterInFollow: true,
    }));
    expect(result.action).toBe('show');
    expect(result.reason).toBe('retweeter-follow');
  });

  it('리트윗 + 리트위터 화이트리스트 = show (retweeter-whitelist)', () => {
    const result = classifyTweet(makeInput({
      isRetweet: true,
      retweeterHandle: 'rt_user',
      retweeterIsWhitelisted: true,
    }));
    expect(result.action).toBe('show');
    expect(result.reason).toBe('retweeter-whitelist');
  });

  it('리트윗 + 리트위터 비예외 = hide (regression)', () => {
    const result = classifyTweet(makeInput({
      isRetweet: true,
      retweeterHandle: 'rt_user',
    }));
    expect(result.action).toBe('hide');
    expect(result.reason).toBe('retweet');
  });

  it('리트위터 팔로우는 키워드 필터 ON + 매칭 룰이 있어도 show', () => {
    const result = classifyTweet(makeInput({
      isRetweet: true,
      retweeterHandle: 'rt_user',
      retweeterInFollow: true,
      settings: { ...defaultSettings, keywordFilterEnabled: true },
      activeFilterRules: [{ type: 'keyword', value: '비트코인' }],
      profile: { handle: 'fadak_user', displayName: '파딱유저', bio: '비트코인 전문가' },
      tweetText: '',
    }));
    expect(result.action).toBe('show');
    expect(result.reason).toBe('retweeter-follow');
  });

  it('isRetweet=false이면 retweeterInFollow=true여도 일반 경로로 hide', () => {
    const result = classifyTweet(makeInput({
      isRetweet: false,
      retweeterInFollow: true,
    }));
    expect(result.action).toBe('hide');
    expect(result.reason).toBe('fadak');
  });

  // --- Defect2: 리트위터가 현재 사용자 본인인 경우도 예외 ---

  it('리트윗 + 리트위터가 현재 사용자 본인 = show (retweeter-self)', () => {
    const result = classifyTweet(makeInput({
      isRetweet: true,
      retweeterHandle: 'me_user',
      retweeterIsCurrentUser: true,
    }));
    expect(result.action).toBe('show');
    expect(result.reason).toBe('retweeter-self');
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
      parentIsWhitelisted: false,
      retweeterExempt: false,
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

  // --- A2: 예외 부모(팔로우/화이트리스트)의 hide-entire 다운그레이드 ---

  it('self-quote + 부모 화이트리스트만 = show (self-quote-whitelisted)', () => {
    const result = classifyQuote(makeQuoteInput({
      quotedHandle: 'same_user',
      parentHandle: 'same_user',
      parentInFollow: false,
      parentIsWhitelisted: true,
    }));
    expect(result.action).toBe('show');
    expect(result.reason).toBe('self-quote-whitelisted');
  });

  it('인용 파딱 + quoteMode=entire + 부모 팔로우 = hide-quote로 다운그레이드', () => {
    const result = classifyQuote(makeQuoteInput({
      parentInFollow: true,
      settings: { ...defaultSettings, quoteMode: 'entire' },
    }));
    expect(result.action).toBe('hide-quote');
    expect(result.reason).toBe('quote-fadak-parent-exempt');
  });

  it('인용 파딱 + quoteMode=entire + 부모 화이트리스트 = hide-quote로 다운그레이드', () => {
    const result = classifyQuote(makeQuoteInput({
      parentIsWhitelisted: true,
      settings: { ...defaultSettings, quoteMode: 'entire' },
    }));
    expect(result.action).toBe('hide-quote');
    expect(result.reason).toBe('quote-fadak-parent-exempt');
  });

  it('인용 파딱 + quoteMode=entire + 부모 비예외 = hide-entire (regression)', () => {
    const result = classifyQuote(makeQuoteInput({
      settings: { ...defaultSettings, quoteMode: 'entire' },
    }));
    expect(result.action).toBe('hide-entire');
  });

  it('인용 파딱 + quoteMode=quote-only + 부모 팔로우 = hide-quote (다운그레이드 영향 없음)', () => {
    const result = classifyQuote(makeQuoteInput({ parentInFollow: true }));
    expect(result.action).toBe('hide-quote');
  });

  // --- Defect1: 리트위터 예외(retweeterExempt)도 hide-entire를 다운그레이드해야 함 ---

  it('인용 파딱 + quoteMode=entire + 부모 비예외 + 리트위터 예외 = hide-quote로 다운그레이드', () => {
    const result = classifyQuote(makeQuoteInput({
      parentInFollow: false,
      parentIsWhitelisted: false,
      retweeterExempt: true,
      settings: { ...defaultSettings, quoteMode: 'entire' },
    }));
    expect(result.action).toBe('hide-quote');
    expect(result.reason).toBe('quote-fadak-retweeter-exempt');
  });

  it('인용 파딱 + quoteMode=entire + 부모/리트위터 모두 비예외 = hide-entire (regression)', () => {
    const result = classifyQuote(makeQuoteInput({
      parentInFollow: false,
      parentIsWhitelisted: false,
      retweeterExempt: false,
      settings: { ...defaultSettings, quoteMode: 'entire' },
    }));
    expect(result.action).toBe('hide-entire');
    expect(result.reason).toBe('quote-fadak');
  });
});
