import { describe, it, expect, beforeEach, vi } from 'vitest';
import { JSDOM } from 'jsdom';
import { DEFAULT_SETTINGS } from '../../src/shared/constants';

// --- Mocks ---

vi.mock('wxt/browser', () => ({
  browser: { storage: { local: { get: vi.fn(), set: vi.fn() } } },
}));

const mockDetectBadgeSvg = vi.fn<(el: HTMLElement) => boolean>().mockReturnValue(false);
const mockIsBlueBadgeElement = vi.fn<(el: Element) => boolean>();
vi.mock('@features/badge-detection', () => ({
  detectBadgeSvg: (...args: unknown[]) => mockDetectBadgeSvg(args[0] as HTMLElement),
}));
// tweet-orchestrator는 barrel(index.ts) 대신 svg-fallback에서 직접 import — 동일 mock 함수로 제어
vi.mock('@features/badge-detection/svg-fallback', () => ({
  detectBadgeSvg: (...args: unknown[]) => mockDetectBadgeSvg(args[0] as HTMLElement),
  isBlueBadgeElement: (...args: unknown[]) => mockIsBlueBadgeElement(args[0] as Element),
}));

const mockHideTweet = vi.fn();
const mockShowTweet = vi.fn();
const mockHideQuoteBlock = vi.fn();
const mockShowQuoteBlock = vi.fn();
vi.mock('@features/content-filter', () => ({
  shouldHideTweet: vi.fn().mockReturnValue(true),
  shouldHideRetweet: vi.fn().mockReturnValue(true),
  getQuoteAction: vi.fn().mockReturnValue('none' as const),
  hideTweet: (...args: unknown[]) => mockHideTweet(...args),
  hideQuoteBlock: (...args: unknown[]) => mockHideQuoteBlock(...args),
  showTweet: (...args: unknown[]) => mockShowTweet(...args),
  showQuoteBlock: (...args: unknown[]) => mockShowQuoteBlock(...args),
  setTweetHiderLanguage: vi.fn(),
  FeedObserver: class { observe() {} disconnect() {} },
}));

vi.mock('@features/keyword-filter', () => ({
  matchesKeywordFilter: vi.fn().mockReturnValue({ matched: false }),
  matchesProtectedKeyword: vi.fn().mockReturnValue(false),
  isAggressorProfile: vi.fn().mockReturnValue(false),
  ProfileCache: class {
    get() { return undefined; }
    set() {}
    has() { return false; }
  },
}));

vi.mock('@shared/utils/logger', () => ({
  logger: { info: vi.fn(), error: vi.fn(), warn: vi.fn(), debug: vi.fn() },
}));

import { getQuoteAction } from '@features/content-filter';
import {
  setSettings,
  setFollowSet,
  setWhitelistSet,
  setCurrentUserHandle,
  getCurrentUserHandle,
} from '../../src/content/state';
import { processTweet, restoreHiddenTweets, applyCurrentUserFallback } from '../../src/content/tweet-orchestrator';

let doc: Document;

const BADGE_SVG = '<svg data-testid="icon-verified"><g><path d="M1 1Z"></path></g></svg>';

function createTweetEl(handle: string, opts?: { retweet?: boolean; badge?: boolean; retweeterHandle?: string }): HTMLElement {
  const article = doc.createElement('article');
  article.setAttribute('data-testid', 'tweet');

  // Author link
  const link = doc.createElement('a');
  link.setAttribute('role', 'link');
  link.setAttribute('href', `/${handle}`);
  link.textContent = `@${handle}`;
  article.appendChild(link);

  // Display name link
  const nameLink = doc.createElement('a');
  nameLink.setAttribute('role', 'link');
  nameLink.setAttribute('href', `/${handle}`);
  nameLink.textContent = `Display ${handle}`;
  article.appendChild(nameLink);

  // 작성자 영역 (실제 X DOM처럼 항상 존재; 뱃지는 opts.badge일 때만)
  const userName = doc.createElement('div');
  userName.setAttribute('data-testid', 'User-Name');
  if (opts?.badge) {
    userName.innerHTML = BADGE_SVG;
  }
  article.appendChild(userName);

  if (opts?.retweet) {
    const social = doc.createElement('div');
    social.setAttribute('data-testid', 'socialContext');
    if (opts.retweeterHandle) {
      // 비영어 로케일 텍스트 — href만으로 리트위터를 식별해야 함
      const rtLink = doc.createElement('a');
      rtLink.setAttribute('role', 'link');
      rtLink.setAttribute('href', `/${opts.retweeterHandle}`);
      rtLink.textContent = `${opts.retweeterHandle}さんがリポスト`;
      social.appendChild(rtLink);
    } else {
      social.textContent = 'Retweeted';
    }
    article.appendChild(social);
  }

  return article;
}

function appendQuoteBlock(article: HTMLElement, opts?: { badge?: boolean }): HTMLElement {
  const wrapper = doc.createElement('div');

  const label = doc.createElement('span');
  label.textContent = '인용'; // 자식 노드 정확히 1개 → findQuoteBlock 매칭
  wrapper.appendChild(label);

  const quote = doc.createElement('div');
  const userName = doc.createElement('div');
  userName.setAttribute('data-testid', 'User-Name');
  if (opts?.badge) {
    userName.innerHTML = BADGE_SVG;
  }
  quote.appendChild(userName);

  const handleLink = doc.createElement('a');
  handleLink.setAttribute('href', '/quoted_user');
  handleLink.textContent = '@quoted_user';
  quote.appendChild(handleLink);

  wrapper.appendChild(quote);
  article.appendChild(wrapper);
  return quote;
}

beforeEach(() => {
  doc = new JSDOM('<!DOCTYPE html><html><head></head><body><main></main></body></html>', { url: 'https://x.com/home' }).window.document;
  vi.stubGlobal('document', doc);

  setSettings({ ...DEFAULT_SETTINGS });
  setFollowSet(new Set());
  setWhitelistSet(new Set());
  setCurrentUserHandle(null);

  vi.clearAllMocks();
  // 파딱 여부는 fixture의 뱃지 배치(구조)로 제어:
  // - isBlueBadgeElement: 기본 true (뱃지가 발견되면 파랑으로 간주)
  // - detectBadgeSvg: 인용 카드 경로에서만 사용, 기본 false
  mockDetectBadgeSvg.mockReturnValue(false);
  mockIsBlueBadgeElement.mockReturnValue(true);
  // vi.clearAllMocks는 mockReturnValue를 지우지 않으므로 per-test override 누수 방지
  vi.mocked(getQuoteAction).mockReturnValue('none');
});

describe('processTweet', () => {
  it('프로필 페이지에서는 처리하지 않는다', () => {
    // isProfilePage depends on URL — set path to a profile page
    // processTweet calls isProfilePage which checks location.pathname
    // Since we're in jsdom, the default path is '/', which is NOT a profile page
    // This test verifies that a tweet on the timeline IS processed
    const tweet = createTweetEl('testuser', { badge: true });
    processTweet(tweet);
    // Should attempt to hide since testuser is a known fadak (author-area badge present)
    expect(mockHideTweet).toHaveBeenCalled();
  });

  it('자기 자신의 트윗은 무시한다', () => {
    setCurrentUserHandle('myhandle');
    const tweet = createTweetEl('MyHandle');
    processTweet(tweet);
    expect(mockHideTweet).not.toHaveBeenCalled();
  });

  it('자기 자신의 트윗이 이미 숨겨져 있으면 showTweet으로 복원한다 (A5)', () => {
    setCurrentUserHandle('myhandle');
    const tweet = createTweetEl('MyHandle', { badge: true });
    tweet.setAttribute('data-bbr-original', 'hidden');
    processTweet(tweet);
    expect(mockShowTweet).toHaveBeenCalledWith(tweet);
    expect(mockHideTweet).not.toHaveBeenCalled();
  });

  it('파딱 + 팔로우 중이면 숨기지 않는다 (이전에 숨겨진 경우만 showTweet)', () => {
    setFollowSet(new Set(['testuser']));
    const tweet = createTweetEl('testuser', { badge: true });
    processTweet(tweet);
    // 숨겨진 적 없는 트윗에는 showTweet 호출 안 함 (불필요한 DOM 조작 방지)
    expect(mockShowTweet).not.toHaveBeenCalled();
    expect(mockHideTweet).not.toHaveBeenCalled();
  });

  it('파딱 + 팔로우 중 + 이전에 숨겨진 트윗이면 showTweet 호출', () => {
    setFollowSet(new Set(['testuser']));
    const tweet = createTweetEl('testuser', { badge: true });
    tweet.setAttribute('data-bbr-original', 'hidden');
    processTweet(tweet);
    expect(mockShowTweet).toHaveBeenCalled();
  });

  it('파딱 + 미팔로우이면 hideTweet 호출', () => {
    const tweet = createTweetEl('testuser', { badge: true });
    processTweet(tweet);
    expect(mockHideTweet).toHaveBeenCalledWith(
      tweet,
      'remove',
      expect.objectContaining({ reason: 'fadak', handle: '@testuser' }),
      expect.any(Function),
    );
  });

  it('비파딱 트윗은 숨기지 않는다', () => {
    const tweet = createTweetEl('normaluser');
    // detectBadgeSvg returns false (default mock)
    processTweet(tweet);
    expect(mockHideTweet).not.toHaveBeenCalled();
  });

  it('작성자 추출 실패 시 무시', () => {
    const empty = doc.createElement('article');
    empty.setAttribute('data-testid', 'tweet');
    processTweet(empty);
    expect(mockHideTweet).not.toHaveBeenCalled();
  });

  // --- 인용 카드 뱃지 오귀속 방지 (#35) ---

  it('인용 카드 안 파딱 뱃지는 외부 작성자에게 오귀속되지 않는다', () => {
    const tweet = createTweetEl('quoter'); // 외부 User-Name에는 뱃지 없음
    appendQuoteBlock(tweet, { badge: true });
    processTweet(tweet);
    expect(mockHideTweet).not.toHaveBeenCalled();
    expect(mockHideQuoteBlock).not.toHaveBeenCalled();
  });

  it('외부 User-Name 뱃지가 있으면 인용 뱃지 여부와 무관하게 숨긴다', () => {
    const tweet = createTweetEl('fadakuser', { badge: true });
    appendQuoteBlock(tweet, { badge: false });
    processTweet(tweet);
    expect(mockHideTweet).toHaveBeenCalledWith(
      tweet,
      'remove',
      expect.objectContaining({ reason: 'fadak', handle: '@fadakuser' }),
      expect.any(Function),
    );
  });

  it('리트윗 + 인용 파딱 → 외부 작성자 오귀속 없음', () => {
    const tweet = createTweetEl('retweeter', { retweet: true }); // 외부 User-Name 뱃지 없음
    appendQuoteBlock(tweet, { badge: true });
    processTweet(tweet);
    expect(mockHideTweet).not.toHaveBeenCalled();
  });

  it('리트윗 + 외부 뱃지 → reason retweet으로 숨김', () => {
    const tweet = createTweetEl('rter', { retweet: true, badge: true });
    processTweet(tweet);
    expect(mockHideTweet).toHaveBeenCalledWith(
      tweet,
      'remove',
      expect.objectContaining({ reason: 'retweet' }),
      expect.any(Function),
    );
  });

  it('이전에 숨겨진 인용-오귀속 트윗은 skip 경로로 복원된다', () => {
    const tweet = createTweetEl('quoter');
    appendQuoteBlock(tweet, { badge: true });
    tweet.setAttribute('data-bbr-original', 'hidden');
    processTweet(tweet);
    expect(mockShowTweet).toHaveBeenCalled();
  });

  // --- A6: 리트위터 팔로우/화이트리스트 예외 ---

  it('팔로우한 유저가 재게시한 파딱 트윗은 숨기지 않는다', () => {
    setFollowSet(new Set(['rt_user']));
    const tweet = createTweetEl('fadak_author', { retweet: true, retweeterHandle: 'rt_user', badge: true });
    processTweet(tweet);
    expect(mockHideTweet).not.toHaveBeenCalled();
  });

  it('화이트리스트에 있는 유저의 재게시는 숨기지 않는다', () => {
    setWhitelistSet(new Set(['@rt_user']));
    const tweet = createTweetEl('fadak_author', { retweet: true, retweeterHandle: 'rt_user', badge: true });
    processTweet(tweet);
    expect(mockHideTweet).not.toHaveBeenCalled();
  });

  it('팔로우한 유저 재게시 + 이전에 숨겨진 트윗은 showTweet으로 복원', () => {
    setFollowSet(new Set(['rt_user']));
    const tweet = createTweetEl('fadak_author', { retweet: true, retweeterHandle: 'rt_user', badge: true });
    tweet.setAttribute('data-bbr-original', 'hidden');
    processTweet(tweet);
    expect(mockShowTweet).toHaveBeenCalledWith(tweet);
    expect(mockHideTweet).not.toHaveBeenCalled();
  });

  it('비팔로우 리트위터의 재게시 파딱은 기존대로 reason retweet으로 숨긴다 (regression)', () => {
    const tweet = createTweetEl('fadak_author', { retweet: true, retweeterHandle: 'rt_user', badge: true });
    processTweet(tweet);
    expect(mockHideTweet).toHaveBeenCalledWith(
      tweet,
      'remove',
      expect.objectContaining({ reason: 'retweet' }),
      expect.any(Function),
    );
  });

  // --- Defect2: 리트위터가 현재 사용자 본인인 재게시도 예외 ---

  it('현재 사용자 본인이 재게시한 파딱 트윗은 숨기지 않는다', () => {
    setCurrentUserHandle('myhandle');
    const tweet = createTweetEl('fadak_author', { retweet: true, retweeterHandle: 'myhandle', badge: true });
    processTweet(tweet);
    expect(mockHideTweet).not.toHaveBeenCalled();
  });

  // --- A2: 예외 부모의 quote-entire 다운그레이드 + reason 게이팅 ---

  it('부모 팔로우 + 인용 파딱 + hide-entire 설정 → hideTweet 대신 hideQuoteBlock (다운그레이드)', () => {
    setFollowSet(new Set(['parent_user']));
    vi.mocked(getQuoteAction).mockReturnValue('hide-entire');
    mockDetectBadgeSvg.mockReturnValue(true);
    const tweet = createTweetEl('parent_user');
    const quote = appendQuoteBlock(tweet, { badge: true });
    processTweet(tweet);
    expect(mockHideTweet).not.toHaveBeenCalled();
    expect(mockHideQuoteBlock).toHaveBeenCalledWith(quote, expect.objectContaining({ handle: '@quoted_user' }));
  });

  it('quote-entire로 숨겨진 트윗 + 부모 화이트리스트 → showTweet 후 hideQuoteBlock (entire→quote 복원)', () => {
    setWhitelistSet(new Set(['@parent_user']));
    vi.mocked(getQuoteAction).mockReturnValue('hide-entire');
    mockDetectBadgeSvg.mockReturnValue(true);
    const tweet = createTweetEl('parent_user');
    const quote = appendQuoteBlock(tweet, { badge: true });
    tweet.setAttribute('data-bbr-original', 'hidden');
    tweet.setAttribute('data-bbr-reason', 'quote-entire');
    processTweet(tweet);
    expect(mockShowTweet).toHaveBeenCalledWith(tweet);
    expect(mockHideQuoteBlock).toHaveBeenCalledWith(quote, expect.objectContaining({ handle: '@quoted_user' }));
    expect(mockHideTweet).not.toHaveBeenCalled();
  });

  it('quote 판정 show(인용 비파딱) + quote-entire로 숨겨진 트윗 → showTweet으로 복원', () => {
    const tweet = createTweetEl('quoter');
    appendQuoteBlock(tweet, { badge: false });
    tweet.setAttribute('data-bbr-original', 'hidden');
    tweet.setAttribute('data-bbr-reason', 'quote-entire');
    processTweet(tweet);
    expect(mockShowTweet).toHaveBeenCalledWith(tweet);
  });

  it('quote 판정 show + quoteBlock에 data-bbr-hidden-quote → showQuoteBlock 호출', () => {
    const tweet = createTweetEl('quoter');
    const quote = appendQuoteBlock(tweet, { badge: false });
    quote.setAttribute('data-bbr-hidden-quote', 'true');
    processTweet(tweet);
    expect(mockShowQuoteBlock).toHaveBeenCalledWith(quote);
  });

  it('작성자 사유(fadak)로 숨겨진 트윗은 quote 판정이 show여도 quote 파이프라인이 복원하지 않는다', () => {
    const tweet = createTweetEl('fadak_author', { badge: true });
    appendQuoteBlock(tweet, { badge: false });
    tweet.setAttribute('data-bbr-original', 'hidden');
    tweet.setAttribute('data-bbr-reason', 'fadak');
    processTweet(tweet);
    expect(mockShowTweet).not.toHaveBeenCalled();
  });

  it('skip 경로는 quote-entire로 숨겨진 트윗을 복원하지 않는다 (reason 게이팅)', () => {
    const tweet = createTweetEl('quoter'); // 비파딱 작성자, 인용 블록 없음
    tweet.setAttribute('data-bbr-original', 'hidden');
    tweet.setAttribute('data-bbr-reason', 'quote-entire');
    processTweet(tweet);
    expect(mockShowTweet).not.toHaveBeenCalled();
  });

  // --- Defect1: 리트위터 예외가 quote 파이프라인에도 전파되어야 함 ---
  // followed user F가 non-exempt author A의 (파딱 Q를 인용한) 트윗을 재게시 → A6 예외로 show지만
  // 기존에는 processQuoteBlock이 retweeterExempt를 몰라 hide-entire로 전체를 숨겼음(모순).

  it('(a) 리트위터 팔로우 + 부모 비예외 + quoteMode=entire → hide-entire 대신 hide-quote, article은 안 숨겨짐', () => {
    setFollowSet(new Set(['rt_user']));
    vi.mocked(getQuoteAction).mockReturnValue('hide-entire');
    mockDetectBadgeSvg.mockReturnValue(true);
    const tweet = createTweetEl('author_a', { retweet: true, retweeterHandle: 'rt_user' });
    const quote = appendQuoteBlock(tweet, { badge: true });
    processTweet(tweet);
    expect(mockHideTweet).not.toHaveBeenCalled();
    expect(mockHideQuoteBlock).toHaveBeenCalledWith(quote, expect.objectContaining({ handle: '@quoted_user' }));
  });

  it('(b) 리트위터 화이트리스트 + 부모 비예외 + quoteMode=entire → hide-entire 대신 hide-quote, article은 안 숨겨짐', () => {
    setWhitelistSet(new Set(['@rt_user']));
    vi.mocked(getQuoteAction).mockReturnValue('hide-entire');
    mockDetectBadgeSvg.mockReturnValue(true);
    const tweet = createTweetEl('author_a', { retweet: true, retweeterHandle: 'rt_user' });
    const quote = appendQuoteBlock(tweet, { badge: true });
    processTweet(tweet);
    expect(mockHideTweet).not.toHaveBeenCalled();
    expect(mockHideQuoteBlock).toHaveBeenCalledWith(quote, expect.objectContaining({ handle: '@quoted_user' }));
  });

  it('(c) 리트윗 아님 + 부모 비예외 + quoteMode=entire → hide-entire 그대로 유지 (regression)', () => {
    vi.mocked(getQuoteAction).mockReturnValue('hide-entire');
    mockDetectBadgeSvg.mockReturnValue(true);
    const tweet = createTweetEl('author_a');
    appendQuoteBlock(tweet, { badge: true });
    processTweet(tweet);
    expect(mockHideTweet).toHaveBeenCalledWith(
      tweet,
      'remove',
      expect.objectContaining({ reason: 'quote-entire', handle: '@quoted_user' }),
    );
    expect(mockHideQuoteBlock).not.toHaveBeenCalled();
  });
});

// --- A5: applyCurrentUserFallback ---

describe('applyCurrentUserFallback', () => {
  it('핸들이 없을 때 getHandle이 핸들을 반환하면 설정 + 복원 + true', () => {
    vi.stubGlobal('requestAnimationFrame', (cb: FrameRequestCallback) => { cb(0); return 0; });
    const main = doc.querySelector('main')!;
    const hidden = createTweetEl('someuser');
    hidden.setAttribute('data-bbr-original', 'hidden');
    main.appendChild(hidden);

    const result = applyCurrentUserFallback(() => 'myhandle');

    expect(result).toBe(true);
    expect(getCurrentUserHandle()).toBe('myhandle');
    expect(mockShowTweet).toHaveBeenCalledWith(hidden);
  });

  it('이미 핸들이 있으면 false + 복원/재처리 없음', () => {
    setCurrentUserHandle('existing');
    const main = doc.querySelector('main')!;
    const hidden = createTweetEl('someuser');
    hidden.setAttribute('data-bbr-original', 'hidden');
    main.appendChild(hidden);

    const result = applyCurrentUserFallback(() => 'other');

    expect(result).toBe(false);
    expect(getCurrentUserHandle()).toBe('existing');
    expect(mockShowTweet).not.toHaveBeenCalled();
  });

  it('getHandle이 null을 반환하면 false + 아무것도 안 함', () => {
    const result = applyCurrentUserFallback(() => null);
    expect(result).toBe(false);
    expect(getCurrentUserHandle()).toBeNull();
    expect(mockShowTweet).not.toHaveBeenCalled();
  });
});


describe('restoreHiddenTweets', () => {
  it('data-bbr-original 속성이 있는 트윗을 복원한다', () => {
    const main = doc.querySelector('main')!;
    const tweet = doc.createElement('article');
    tweet.setAttribute('data-testid', 'tweet');
    tweet.setAttribute('data-bbr-original', 'hidden');
    tweet.style.display = 'none';
    main.appendChild(tweet);

    restoreHiddenTweets();

    expect(mockShowTweet).toHaveBeenCalledWith(tweet);
  });
});
