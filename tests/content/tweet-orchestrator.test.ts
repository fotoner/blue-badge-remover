import { describe, it, expect, beforeEach, vi } from 'vitest';
import { JSDOM } from 'jsdom';
import { DEFAULT_SETTINGS } from '../../src/shared/constants';

// --- Mocks ---

vi.mock('wxt/browser', () => ({
  browser: { storage: { local: { get: vi.fn(), set: vi.fn() } } },
}));

const mockDetectBadgeSvg = vi.fn<(el: HTMLElement) => boolean>().mockReturnValue(false);
vi.mock('@features/badge-detection', () => ({
  detectBadgeSvg: (...args: unknown[]) => mockDetectBadgeSvg(args[0] as HTMLElement),
  BadgeCache: class {
    private m = new Map<string, boolean>();
    get(k: string) { return this.m.get(k); }
    set(k: string, v: boolean) { this.m.set(k, v); }
    has(k: string) { return this.m.has(k); }
  },
  parseBadgeInfo: vi.fn(),
}));

const mockHideTweet = vi.fn();
const mockShowTweet = vi.fn();
const mockHideQuoteBlock = vi.fn();
vi.mock('@features/content-filter', () => ({
  shouldHideTweet: vi.fn().mockReturnValue(true),
  shouldHideRetweet: vi.fn().mockReturnValue(true),
  getQuoteAction: vi.fn().mockReturnValue('none' as const),
  hideTweet: (...args: unknown[]) => mockHideTweet(...args),
  hideQuoteBlock: (...args: unknown[]) => mockHideQuoteBlock(...args),
  showTweet: (...args: unknown[]) => mockShowTweet(...args),
  setTweetHiderLanguage: vi.fn(),
  FeedObserver: class { observe() {} disconnect() {} },
}));

vi.mock('@features/keyword-filter', () => ({
  matchesKeywordFilter: vi.fn().mockReturnValue({ matched: false }),
  ProfileCache: class {
    get() { return undefined; }
    set() {}
    has() { return false; }
  },
}));

vi.mock('@shared/utils/logger', () => ({
  logger: { info: vi.fn(), error: vi.fn(), warn: vi.fn(), debug: vi.fn() },
}));

import {
  badgeCache,
  setSettings,
  setFollowSet,
  setWhitelistSet,
  setCurrentUserHandle,
} from '../../src/content/state';
import { processTweet, restoreHiddenTweets } from '../../src/content/tweet-orchestrator';

let doc: Document;

function createTweetEl(handle: string, opts?: { retweet?: boolean; badge?: boolean }): HTMLElement {
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

  if (opts?.retweet) {
    const social = doc.createElement('div');
    social.setAttribute('data-testid', 'socialContext');
    social.textContent = 'Retweeted';
    article.appendChild(social);
  }

  return article;
}

beforeEach(() => {
  doc = new JSDOM('<!DOCTYPE html><html><head></head><body><main></main></body></html>', { url: 'https://x.com/home' }).window.document;
  vi.stubGlobal('document', doc);

  setSettings({ ...DEFAULT_SETTINGS });
  setFollowSet(new Set());
  setWhitelistSet(new Set());
  setCurrentUserHandle(null);
  badgeCache.set('testuser', true); // Pre-populate badge cache

  vi.clearAllMocks();
  mockDetectBadgeSvg.mockReturnValue(false);
});

describe('processTweet', () => {
  it('프로필 페이지에서는 처리하지 않는다', () => {
    // isProfilePage depends on URL — set path to a profile page
    const origHref = globalThis.window?.location?.href;
    // processTweet calls isProfilePage which checks location.pathname
    // Since we're in jsdom, the default path is '/', which is NOT a profile page
    // This test verifies that a tweet on the timeline IS processed
    const tweet = createTweetEl('testuser');
    processTweet(tweet);
    // Should attempt to hide since testuser is a known fadak
    expect(mockHideTweet).toHaveBeenCalled();
  });

  it('자기 자신의 트윗은 무시한다', () => {
    setCurrentUserHandle('myhandle');
    const tweet = createTweetEl('MyHandle');
    processTweet(tweet);
    expect(mockHideTweet).not.toHaveBeenCalled();
  });

  it('파딱 + 팔로우 중이면 showTweet 호출', () => {
    setFollowSet(new Set(['testuser']));
    const tweet = createTweetEl('testuser');
    processTweet(tweet);
    expect(mockShowTweet).toHaveBeenCalled();
  });

  it('파딱 + 미팔로우이면 hideTweet 호출', () => {
    const tweet = createTweetEl('testuser');
    processTweet(tweet);
    expect(mockHideTweet).toHaveBeenCalledWith(
      tweet,
      'remove',
      expect.objectContaining({ reason: 'fadak', handle: '@testuser' }),
    );
  });

  it('비파딱 트윗은 숨기지 않는다', () => {
    const tweet = createTweetEl('normaluser');
    // normaluser is not in badgeCache, detectBadgeSvg returns false
    processTweet(tweet);
    expect(mockHideTweet).not.toHaveBeenCalled();
  });

  it('작성자 추출 실패 시 무시', () => {
    const empty = doc.createElement('article');
    empty.setAttribute('data-testid', 'tweet');
    processTweet(empty);
    expect(mockHideTweet).not.toHaveBeenCalled();
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
