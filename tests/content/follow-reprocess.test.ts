// #100: 팔로우가 바뀌면 이미 그려진 트윗(작성자·인용 카드 모두)을 실제 판정 경로로 다시 판정한다.
// storage-listener → scheduleFollowReprocess → reprocessTweetsByHandles → processTweet까지 실제 모듈을 쓰고,
// 숨김 상태는 실제 content-filter가 DOM에 남기는 속성으로 확인한다.
import { describe, it, expect, beforeAll, beforeEach, afterEach, vi } from 'vitest';
import { DEFAULT_SETTINGS, MESSAGE_TYPES, STORAGE_KEYS } from '../../src/shared/constants';

const mockAddListener = vi.fn();
vi.mock('wxt/browser', () => ({
  browser: {
    storage: {
      local: { get: vi.fn().mockResolvedValue({}), set: vi.fn().mockResolvedValue(undefined) },
      onChanged: { addListener: (...args: unknown[]) => mockAddListener(...args) },
    },
  },
}));

vi.mock('@shared/utils/logger', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

vi.mock('@features/stats', () => ({ recordHide: vi.fn() }));
vi.mock('@features/settings', () => ({ addToWhitelist: vi.fn() }));
vi.mock('../../src/content/collector-buffer', () => ({
  bufferCollectedFadak: vi.fn(),
  flushCollector: vi.fn().mockResolvedValue(undefined),
}));
vi.mock('../../src/content/filter-pipeline', () => ({ loadFilterRules: vi.fn().mockResolvedValue(undefined) }));
vi.mock('../../src/content/fadak-banner', () => ({ removeFadakBanner: vi.fn() }));

const mockRemoveFollowHandles = vi.fn<() => Promise<void>>();
vi.mock('../../src/content/follow-collector', () => ({
  saveFollowHandles: vi.fn().mockResolvedValue(undefined),
  removeFollowHandles: (...args: unknown[]) => mockRemoveFollowHandles(...(args as [])),
  isRecentlyFollowed: vi.fn().mockReturnValue(false),
  getMyHandle: vi.fn().mockReturnValue(null),
}));

import { setSettings, setFollowSet, getFollowSet, setWhitelistSet, setCurrentUserHandle, getExpandedSet } from '../../src/content/state';
import { listenForSettingsChanges } from '../../src/content/storage-listener';
import { listenForMessages, scheduleFollowReprocess } from '../../src/content/message-handler';
import { processTweet } from '../../src/content/tweet-orchestrator';
import type { FollowCollectorDeps } from '../../src/content/follow-collector';
import type { Settings } from '../../src/shared/types';

type ChangesListener = (changes: Record<string, { newValue?: unknown; oldValue?: unknown }>) => void;

const BADGE_SVG = '<svg data-testid="icon-verified"><g><path d="M0 0"></path></g></svg>';
const HIDDEN_QUOTE_ATTR = 'data-bbr-hidden-quote';
const HIDDEN_TWEET_ATTR = 'data-bbr-original';

let changesListener: ChangesListener;

// 실측 X DOM의 뼈대(작성자 User-Name, div[role=link] 인용 카드)만 남긴 트윗
function appendTweet(author: { handle: string; badge?: boolean }, quoted?: { handle: string; badge?: boolean }): HTMLElement {
  const article = document.createElement('article');
  article.setAttribute('data-testid', 'tweet');
  article.innerHTML = `
    <div data-testid="User-Name">
      <a href="/${author.handle}" role="link"><span>Name ${author.handle}</span>${author.badge ? BADGE_SVG : ''}</a>
      <a href="/${author.handle}" role="link"><span>@${author.handle}</span></a>
    </div>
    <div data-testid="tweetText"><span>text</span></div>
    ${quoted ? `<div role="link"><div data-testid="User-Name"><span>Quoted ${quoted.handle}</span>${quoted.badge ? BADGE_SVG : ''}<span>@${quoted.handle}</span></div></div>` : ''}`;
  const main = document.querySelector('main') ?? document.body.appendChild(document.createElement('main'));
  main.appendChild(article);
  return article;
}

function quoteCardOf(article: HTMLElement): HTMLElement {
  const card = article.querySelector<HTMLElement>('div[role="link"]');
  if (!card) throw new Error('no quote card');
  return card;
}

function useSettings(overrides: Partial<Settings>): void {
  setSettings({ ...DEFAULT_SETTINGS, ...overrides });
}

function dispatchFollowListChange(oldValue: string[], newValue: string[]): void {
  changesListener({ [STORAGE_KEYS.FOLLOW_LIST]: { oldValue, newValue } });
  vi.runAllTimers();
}

describe('팔로우 변경 시 이미 그려진 트윗 재판정 (#100)', () => {
  beforeAll(() => {
    const deps: FollowCollectorDeps = { getCurrentSettings: () => DEFAULT_SETTINGS, setFollowSet, getFollowSet };
    listenForSettingsChanges(vi.fn());
    changesListener = mockAddListener.mock.calls[0]![0] as ChangesListener;
    listenForMessages(deps);
  });

  beforeEach(() => {
    vi.useFakeTimers();
    mockRemoveFollowHandles.mockResolvedValue(undefined);
    useSettings({ quoteMode: 'quote-only' });
    setFollowSet(new Set<string>());
    setWhitelistSet(new Set<string>());
    setCurrentUserHandle('myaccount');
    getExpandedSet().clear();
    document.body.innerHTML = '';
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe('인용 카드 (quoteMode=quote-only)', () => {
    it('팔로우가 추가되면 그 계정을 인용한 숨김 카드가 복원된다', () => {
      const tweet = appendTweet({ handle: 'plain' }, { handle: 'quoted', badge: true });
      processTweet(tweet);
      expect(quoteCardOf(tweet).hasAttribute(HIDDEN_QUOTE_ATTR)).toBe(true);

      dispatchFollowListChange([], ['quoted']);

      expect(quoteCardOf(tweet).hasAttribute(HIDDEN_QUOTE_ATTR)).toBe(false);
    });

    it('같은 탭 팔로우 클릭(메모리 Set을 먼저 갱신)은 storage 이벤트로는 잡히지 않고, onFollowed가 예약한 재판정으로 인용 카드가 복원된다', () => {
      const tweet = appendTweet({ handle: 'plain' }, { handle: 'clicked', badge: true });
      processTweet(tweet);
      expect(quoteCardOf(tweet).hasAttribute(HIDDEN_QUOTE_ATTR)).toBe(true);

      // follow-collector의 클릭 처리 순서: 메모리 Set 추가 → storage 저장 → onFollowed
      getFollowSet().add('clicked');
      dispatchFollowListChange([], ['clicked']);
      expect(quoteCardOf(tweet).hasAttribute(HIDDEN_QUOTE_ATTR)).toBe(true);

      // content/index.ts의 onFollowed가 하는 일
      scheduleFollowReprocess(['clicked']);
      vi.runAllTimers();

      expect(quoteCardOf(tweet).hasAttribute(HIDDEN_QUOTE_ATTR)).toBe(false);
    });

    it('언팔로우되면 (메모리 Set을 먼저 지운 뒤 storage 이벤트가 오는 실제 순서) 그 계정의 인용 카드가 다시 숨겨진다', () => {
      setFollowSet(new Set(['quoted', 'other']));
      const tweet = appendTweet({ handle: 'plain' }, { handle: 'quoted', badge: true });
      processTweet(tweet);
      expect(quoteCardOf(tweet).hasAttribute(HIDDEN_QUOTE_ATTR)).toBe(false);

      getFollowSet().delete('quoted');
      dispatchFollowListChange(['quoted', 'other'], ['other']);

      expect(quoteCardOf(tweet).hasAttribute(HIDDEN_QUOTE_ATTR)).toBe(true);
    });

    it('API가 팔로우 안 함으로 알려 준 계정이 목록에서 빠지면 그 계정의 인용 카드가 다시 숨겨진다', () => {
      setFollowSet(new Set(['polluted']));
      const tweet = appendTweet({ handle: 'plain' }, { handle: 'polluted', badge: true });
      processTweet(tweet);
      expect(quoteCardOf(tweet).hasAttribute(HIDDEN_QUOTE_ATTR)).toBe(false);

      window.dispatchEvent(new MessageEvent('message', {
        source: window,
        origin: window.location.origin,
        data: { type: MESSAGE_TYPES.FOLLOW_DATA, source: 'api-not-following', handles: ['polluted'], account: 'myaccount' },
      }));
      vi.runAllTimers();

      expect(quoteCardOf(tweet).hasAttribute(HIDDEN_QUOTE_ATTR)).toBe(true);
    });

    it('팔로우 변경과 무관한 계정의 인용 카드는 건드리지 않는다', () => {
      const tweet = appendTweet({ handle: 'plain' }, { handle: 'stranger', badge: true });
      processTweet(tweet);
      expect(quoteCardOf(tweet).hasAttribute(HIDDEN_QUOTE_ATTR)).toBe(true);
      const card = quoteCardOf(tweet);

      dispatchFollowListChange([], ['quoted']);

      expect(quoteCardOf(tweet)).toBe(card);
      expect(card.hasAttribute(HIDDEN_QUOTE_ATTR)).toBe(true);
    });
  });

  describe('트윗 전체 숨김 (quoteMode=entire)', () => {
    it('언팔로우되면 그 계정을 인용한 트윗 전체가 다시 숨겨진다', () => {
      useSettings({ quoteMode: 'entire' });
      setFollowSet(new Set(['quoted']));
      const tweet = appendTweet({ handle: 'plain' }, { handle: 'quoted', badge: true });
      processTweet(tweet);
      expect(tweet.hasAttribute(HIDDEN_TWEET_ATTR)).toBe(false);

      getFollowSet().delete('quoted');
      dispatchFollowListChange(['quoted'], []);

      expect(tweet.hasAttribute(HIDDEN_TWEET_ATTR)).toBe(true);
    });
  });

  describe('작성자 파딱 트윗', () => {
    it('언팔로우되면 그 계정의 파딱 트윗이 다시 숨겨진다', () => {
      setFollowSet(new Set(['fadak']));
      const tweet = appendTweet({ handle: 'fadak', badge: true });
      processTweet(tweet);
      expect(tweet.hasAttribute(HIDDEN_TWEET_ATTR)).toBe(false);

      getFollowSet().delete('fadak');
      dispatchFollowListChange(['fadak'], []);

      expect(tweet.hasAttribute(HIDDEN_TWEET_ATTR)).toBe(true);
    });

    it('팔로우가 추가되면 그 계정의 숨겨진 파딱 트윗이 복원된다', () => {
      const tweet = appendTweet({ handle: 'fadak', badge: true });
      processTweet(tweet);
      expect(tweet.hasAttribute(HIDDEN_TWEET_ATTR)).toBe(true);

      dispatchFollowListChange([], ['fadak']);

      expect(tweet.hasAttribute(HIDDEN_TWEET_ATTR)).toBe(false);
    });
  });
});
