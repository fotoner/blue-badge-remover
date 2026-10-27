import { describe, it, expect } from 'vitest';
import { classifyTweet, classifyQuote, resolveHideMode } from '../../src/content/tweet-classifier';
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
  aggressorFilterEnabled: false,
  showAuthorThread: true,
  collapseOnDetail: true,
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
    protectedKeywords: [],
    profile: { handle: 'fadak_user', displayName: '파딱유저', bio: '' },
    tweetText: '일반 트윗',
    pageType: 'timeline',
    isDetailAuthor: false,
    ...overrides,
  };
}

describe('classifyTweet', () => {
  // #94: 사용자가 눌러서 들어간 트윗의 글쓴이라면 같은 상세 페이지의 앞뒤 타래도 보여 준다
  it('글쓴이 타래 보기가 켜져 있으면 상세 페이지 글쓴이의 트윗은 표시한다', () => {
    expect(classifyTweet(makeInput({ pageType: 'replies' })).action).toBe('hide');
    expect(classifyTweet(makeInput({ pageType: 'replies', isDetailAuthor: true }))).toEqual({ action: 'show', reason: 'detail-author' });
  });

  it('글쓴이 타래 보기를 끄면 지금처럼 다른 파딱과 같이 숨긴다', () => {
    const settings = { ...defaultSettings, showAuthorThread: false };
    expect(classifyTweet(makeInput({ pageType: 'replies', isDetailAuthor: true, settings })).action).toBe('hide');
  });

  it('글쓴이 타래 예외는 공격성 필터보다 먼저 적용된다', () => {
    const settings = { ...defaultSettings, aggressorFilterEnabled: true };
    const profile = {
      handle: 'fadak_user', displayName: '파딱유저', bio: '',
      createdAt: new Date().toISOString(), followersCount: 2_000, followingCount: 100,
    };
    expect(classifyTweet(makeInput({ pageType: 'replies', settings, profile })).action).toBe('hide');
    expect(classifyTweet(makeInput({ pageType: 'replies', settings, profile, isDetailAuthor: true }))).toEqual({ action: 'show', reason: 'detail-author' });
  });

  it('확장 프로그램이 꺼져 있으면 파딱 리트윗도 표시한다', () => {
    const result = classifyTweet(makeInput({
      isRetweet: true,
      settings: { ...defaultSettings, enabled: false },
    }));
    expect(result.action).toBe('show');
    expect(result.reason).toBe('disabled');
  });

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

  it('보호 키워드가 프로필에 매칭되면 전체 파딱 숨김보다 우선한다', () => {
    const result = classifyTweet(makeInput({
      protectedKeywords: ['파딱유저'],
    }));
    expect(result.action).toBe('show');
    expect(result.reason).toBe('protected-keyword');
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

  it('신규 고확산 필터만 켜도 조건에 맞는 계정을 숨긴다', () => {
    const result = classifyTweet(makeInput({
      settings: { ...defaultSettings, aggressorFilterEnabled: true },
      profile: {
        handle: 'new_user', displayName: 'New', bio: '',
        createdAt: new Date().toISOString(), followersCount: 2_000, followingCount: 100,
      },
    }));
    expect(result.action).toBe('hide');
    expect(result.reason).toBe('aggressor-profile');
  });

  it('신규 고확산 필터만 켰을 때 조건에 맞지 않는 계정은 표시한다', () => {
    const result = classifyTweet(makeInput({
      settings: { ...defaultSettings, aggressorFilterEnabled: true },
      profile: {
        handle: 'established_user', displayName: 'Established', bio: '',
        createdAt: '2020-01-01T00:00:00.000Z', followersCount: 2_000, followingCount: 100,
      },
    }));
    expect(result.action).toBe('show');
    expect(result.reason).toBe('aggressor-not-matched');
  });

  it('두 선별 필터를 켜면 키워드 불일치여도 신규 고확산 조건으로 숨긴다', () => {
    const result = classifyTweet(makeInput({
      settings: { ...defaultSettings, keywordFilterEnabled: true, aggressorFilterEnabled: true },
      profile: {
        handle: 'new_user', displayName: 'New', bio: '',
        createdAt: new Date().toISOString(), followersCount: 2_000, followingCount: 100,
      },
    }));
    expect(result.action).toBe('hide');
    expect(result.reason).toBe('aggressor-profile');
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

  // 필터링 범위 토글이 꺼진 화면에서는 리트윗 경로도 숨기지 않는다
  it('필터링 범위가 꺼진 화면의 파딱 리트윗 = show (page-filter-off)', () => {
    const result = classifyTweet(makeInput({ isRetweet: true, pageType: 'bookmarks' }));
    expect(result.action).toBe('show');
    expect(result.reason).toBe('page-filter-off');
  });

  it('키워드 필터 ON + 매칭 됨이어도 필터링 범위가 꺼진 화면의 파딱 리트윗 = show', () => {
    const result = classifyTweet(makeInput({
      isRetweet: true,
      pageType: 'bookmarks',
      settings: { ...defaultSettings, keywordFilterEnabled: true },
      activeFilterRules: [{ type: 'keyword', value: '비트코인' }],
      profile: { handle: 'fadak_user', displayName: '파딱유저', bio: '비트코인 전문가' },
      tweetText: '',
    }));
    expect(result.action).toBe('show');
    expect(result.reason).toBe('page-filter-off');
  });

  it('필터링 범위가 켜진 화면의 파딱 리트윗은 그대로 숨긴다 (regression)', () => {
    const result = classifyTweet(makeInput({
      isRetweet: true,
      pageType: 'bookmarks',
      settings: { ...defaultSettings, filter: { ...defaultSettings.filter, bookmarks: true } },
    }));
    expect(result.action).toBe('hide');
    expect(result.reason).toBe('retweet');
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
      quotedIsCurrentUser: false,
      parentIsDetailAuthor: false,
      parentHandle: 'parent_user',
      parentInFollow: false,
      parentIsWhitelisted: false,
      retweeterExempt: false,
      settings: defaultSettings,
      pageType: 'timeline',
      ...overrides,
    };
  }

  // #94: 상세 글쓴이의 트윗은 인용 때문에 통째로 숨기지 않는다 — 인용 카드만 접는다
  describe('상세 글쓴이', () => {
    const entire = { ...defaultSettings, quoteMode: 'entire' as const };

    it('글쓴이 타래 보기가 켜져 있으면 다른 파딱을 인용한 글쓴이 트윗은 인용 카드만 숨긴다', () => {
      const result = classifyQuote(makeQuoteInput({ parentIsDetailAuthor: true, settings: entire, pageType: 'replies' }));
      expect(result).toEqual({ action: 'hide-quote', reason: 'quote-fadak-detail-author' });
    });

    it('글쓴이 타래 보기를 끄면 지금처럼 트윗 전체를 숨긴다', () => {
      const settings = { ...entire, showAuthorThread: false };
      expect(classifyQuote(makeQuoteInput({ parentIsDetailAuthor: true, settings, pageType: 'replies' })).action).toBe('hide-entire');
    });

    it('글쓴이가 자기 트윗을 인용하면 인용 카드도 숨기지 않는다', () => {
      const result = classifyQuote(makeQuoteInput({ quotedHandle: 'author_a', parentHandle: 'author_a', parentIsDetailAuthor: true, settings: entire, pageType: 'replies' }));
      expect(result).toEqual({ action: 'show', reason: 'self-quote-detail-author' });
    });
  });

  it('인용된 계정이 비파딱 = show', () => {
    const result = classifyQuote(makeQuoteInput({ quotedIsFadak: false }));
    expect(result.action).toBe('show');
  });

  it('인용된 계정이 팔로우 = show', () => {
    const result = classifyQuote(makeQuoteInput({ quotedInFollow: true }));
    expect(result.action).toBe('show');
    expect(result.reason).toBe('follow');
  });

  // #88: 파딱 사용자의 트윗을 남이 인용해도 본인 트윗은 숨기지 않음
  it('인용된 계정이 본인 = show (전체 숨김 모드여도)', () => {
    const result = classifyQuote(makeQuoteInput({
      quotedIsCurrentUser: true,
      settings: { ...defaultSettings, quoteMode: 'entire' },
    }));
    expect(result.action).toBe('show');
    expect(result.reason).toBe('quoted-self');
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

  // 필터링 범위 토글이 꺼진 화면에서는 인용 숨김도 적용하지 않는다
  it.each(['quote-only', 'entire'] as const)('필터링 범위가 꺼진 화면의 인용 파딱 + quoteMode=%s = show (page-filter-off)', (quoteMode) => {
    const result = classifyQuote(makeQuoteInput({
      pageType: 'bookmarks',
      settings: { ...defaultSettings, quoteMode },
    }));
    expect(result.action).toBe('show');
    expect(result.reason).toBe('page-filter-off');
  });

  it('필터링 범위가 켜진 화면의 인용 파딱은 그대로 숨긴다 (regression)', () => {
    const result = classifyQuote(makeQuoteInput({
      pageType: 'bookmarks',
      settings: { ...defaultSettings, quoteMode: 'entire', filter: { ...defaultSettings.filter, bookmarks: true } },
    }));
    expect(result.action).toBe('hide-entire');
  });
});

// #94: 상세 페이지에서는 숨김 방식과 따로 접어 두고 펼쳐볼 수 있게 한다
describe('resolveHideMode', () => {
  it('상세 접어 두기가 켜져 있으면 상세 페이지에서는 완전 제거 대신 접는다', () => {
    expect(resolveHideMode({ ...defaultSettings, hideMode: 'remove', collapseOnDetail: true }, 'replies')).toBe('collapse');
  });

  it('상세 접어 두기를 끄면 상세 페이지도 숨김 방식을 따른다', () => {
    expect(resolveHideMode({ ...defaultSettings, hideMode: 'remove', collapseOnDetail: false }, 'replies')).toBe('remove');
  });

  it.each(['timeline', 'search', 'bookmarks', 'lists'] as const)('%s 화면은 상세 접어 두기와 상관없이 숨김 방식을 따른다', (pageType) => {
    expect(resolveHideMode({ ...defaultSettings, hideMode: 'remove', collapseOnDetail: true }, pageType)).toBe('remove');
  });

  it('숨김 방식이 접기면 어느 화면에서든 접는다', () => {
    expect(resolveHideMode({ ...defaultSettings, hideMode: 'collapse', collapseOnDetail: false }, 'replies')).toBe('collapse');
  });
});
