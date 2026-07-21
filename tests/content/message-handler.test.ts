import { describe, it, expect, beforeAll, beforeEach, vi, afterEach } from 'vitest';
import { DEFAULT_SETTINGS } from '../../src/shared/constants';

// --- Mock external modules BEFORE importing anything that depends on them ---

vi.mock('wxt/browser', () => ({
  browser: { storage: { local: { get: vi.fn(), set: vi.fn() } } },
}));

vi.mock('@features/keyword-filter', () => ({
  ProfileCache: class {
    cache = new Map<string, unknown>();
    get(k: string) { return this.cache.get(k); }
    set(k: string, v: unknown) { this.cache.set(k, v); }
    has(k: string) { return this.cache.has(k); }
    clear() { this.cache.clear(); }
  },
  DEFAULT_FILTER_LIST: '',
  getCustomFilterList: vi.fn().mockResolvedValue(''),
  buildActiveRules: vi.fn().mockReturnValue([]),
  parseCategories: vi.fn().mockReturnValue([]),
  buildFilterTextFromCategories: vi.fn().mockReturnValue(''),
}));

vi.mock('@features/keyword-collector', () => ({
  getCollectedFadaks: vi.fn().mockResolvedValue([]),
  saveCollectedFadaks: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('@shared/i18n', () => ({
  t: vi.fn((key: string) => key),
}));

vi.mock('@shared/utils/logger', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

const mockExtractTweetAuthor = vi.fn();
const mockExtractRetweeterHandle = vi.fn();
vi.mock('../../src/content/tweet-processing', () => ({
  extractTweetAuthor: (...args: unknown[]) => mockExtractTweetAuthor(...args),
  extractRetweeterHandle: (...args: unknown[]) => mockExtractRetweeterHandle(...args),
}));

const mockProcessTweet = vi.fn();
const mockRestoreHiddenTweets = vi.fn();
const mockReprocessExistingTweets = vi.fn();
vi.mock('../../src/content/tweet-orchestrator', () => ({
  processTweet: (...args: unknown[]) => mockProcessTweet(...args),
  restoreHiddenTweets: (...args: unknown[]) => mockRestoreHiddenTweets(...args),
  reprocessExistingTweets: (...args: unknown[]) => mockReprocessExistingTweets(...args),
}));

const mockSaveFollowHandles = vi.fn<() => Promise<void>>();
const mockGetMyHandle = vi.fn<() => string | null>();
vi.mock('../../src/content/follow-collector', () => ({
  saveFollowHandles: (...args: unknown[]) => mockSaveFollowHandles(...(args as [])),
  getMyHandle: () => mockGetMyHandle(),
}));

const mockRemoveFadakBanner = vi.fn();
vi.mock('../../src/content/fadak-banner', () => ({
  removeFadakBanner: (...args: unknown[]) => mockRemoveFadakBanner(...args),
  FADAK_BANNER_ID: 'bbr-fadak-profile-banner',
}));

vi.mock('../../src/content/page-utils', () => ({
  getProfileLinkHref: vi.fn().mockReturnValue(null),
}));

// --- Import modules after all mocks are registered ---

import { profileCache, collectorBuffer, setSettings, getFollowSet, setFollowSet, setCurrentUserHandle } from '../../src/content/state';
import { listenForMessages, scheduleFollowReprocess } from '../../src/content/message-handler';
import { MESSAGE_TYPES } from '../../src/shared/constants';
import { logger } from '../../src/shared/utils/logger';
import type { FollowCollectorDeps } from '../../src/content/follow-collector';

// --- Test helpers ---

const savedOrigin = window.location.origin;

function dispatchMessage(data: unknown, options?: { source?: unknown; origin?: string }): void {
  const payload = data && typeof data === 'object'
    && (data as Record<string, unknown>)['type'] === MESSAGE_TYPES.FOLLOW_DATA
    && !('account' in data)
    ? { ...data, account: 'myaccount' }
    : data;
  const event = new MessageEvent('message', {
    source: (options?.source ?? window) as Window,
    origin: options?.origin ?? savedOrigin,
    data: payload,
  });
  window.dispatchEvent(event);
}

function createFollowCollectorDeps(): FollowCollectorDeps {
  return {
    getCurrentSettings: () => DEFAULT_SETTINGS,
    setFollowSet,
    getFollowSet,
  };
}

// --- Tests ---

describe('message-handler', () => {
  const deps = createFollowCollectorDeps();

  // Register the listener once to avoid accumulating handlers
  beforeAll(() => {
    listenForMessages(deps);
  });

  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
    setSettings({ ...DEFAULT_SETTINGS });
    setFollowSet(new Set<string>());
    setCurrentUserHandle('myaccount');
    document.body.innerHTML = '';
    collectorBuffer.clear();
    // Clear singleton cache (mock class exposes clear())
    (profileCache as unknown as { cache: Map<string, unknown> }).cache.clear();
    mockSaveFollowHandles.mockResolvedValue(undefined);
    mockGetMyHandle.mockReturnValue(null);
    // Reset location to default
    Object.defineProperty(window, 'location', {
      value: { pathname: '/', origin: savedOrigin, href: savedOrigin + '/' },
      writable: true,
      configurable: true,
    });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  // ── Origin / source guard ────────────────────────────────────────────

  describe('origin and source validation', () => {
    it('다른 origin의 메시지는 무시한다', () => {
      dispatchMessage(
        { type: MESSAGE_TYPES.PROFILE_DATA, profiles: [{ userId: '1', handle: 'evil', displayName: '', bio: '' }] },
        { origin: 'https://evil.com' },
      );

      expect(profileCache.has('evil')).toBe(false);
    });

    it('source가 window가 아닌 메시지는 무시한다', () => {
      // source: null means it's not from this window
      const event = new MessageEvent('message', {
        data: { type: MESSAGE_TYPES.PROFILE_DATA, profiles: [{ userId: '1', handle: 'evil', displayName: '', bio: '' }] },
        origin: savedOrigin,
      });
      // MessageEvent without source defaults to null
      window.dispatchEvent(event);

      expect(profileCache.has('evil')).toBe(false);
    });
  });

  // ── BBR_PROFILE_DATA (type guard + handler) ─────────────────────────

  describe('BBR_PROFILE_DATA', () => {
    it('유효한 payload는 profileCache에 handle.toLowerCase()로 저장한다', () => {
      dispatchMessage({
        type: MESSAGE_TYPES.PROFILE_DATA,
        profiles: [
          { userId: 'p1', handle: 'Alice', displayName: 'Alice Kim', bio: 'hello' },
        ],
      });

      const cached = profileCache.get('alice');
      expect(cached).toEqual({ handle: 'Alice', displayName: 'Alice Kim', bio: 'hello' });
    });

    it('profiles가 없으면 무시한다 (type guard 실패)', () => {
      dispatchMessage({
        type: MESSAGE_TYPES.PROFILE_DATA,
        // profiles 누락
      });

      // profileCache should not have any entries from this message
      expect(profileCache.has('alice')).toBe(false);
    });

    it('profiles가 배열이 아니면 무시한다', () => {
      dispatchMessage({
        type: MESSAGE_TYPES.PROFILE_DATA,
        profiles: 'not-an-array',
      });

      expect(profileCache.has('not-an-array')).toBe(false);
    });

    it('profiles 원소에 handle 필드가 없으면 무시한다', () => {
      dispatchMessage({
        type: MESSAGE_TYPES.PROFILE_DATA,
        profiles: [{ userId: 'p1', displayName: 'NoHandle', bio: 'bio' }],
      });

      // type guard blocks entire message since every() fails
      expect(profileCache.has('nohandle')).toBe(false);
    });

    it('여러 프로필을 한 번에 저장한다', () => {
      dispatchMessage({
        type: MESSAGE_TYPES.PROFILE_DATA,
        profiles: [
          { userId: 'p1', handle: 'User1', displayName: 'D1', bio: 'bio1' },
          { userId: 'p2', handle: 'User2', displayName: 'D2', bio: 'bio2' },
        ],
      });

      expect(profileCache.get('user1')).toEqual({ handle: 'User1', displayName: 'D1', bio: 'bio1' });
      expect(profileCache.get('user2')).toEqual({ handle: 'User2', displayName: 'D2', bio: 'bio2' });
    });

    it('선별 필터용 계정 생성일과 팔로워 통계를 캐시에 보존한다', () => {
      dispatchMessage({
        type: MESSAGE_TYPES.PROFILE_DATA,
        profiles: [{
          userId: 'p1', handle: 'NewUser', displayName: 'New', bio: '',
          createdAt: '2026-04-01T00:00:00Z', followersCount: 2000, followingCount: 100,
        }],
      });

      expect(profileCache.get('newuser')).toMatchObject({
        createdAt: '2026-04-01T00:00:00Z', followersCount: 2000, followingCount: 100,
      });
    });

    it('X 핸들 형식이 아니거나 과도하게 긴 bio가 포함된 payload는 무시한다', () => {
      dispatchMessage({
        type: MESSAGE_TYPES.PROFILE_DATA,
        profiles: [{ handle: 'not valid!', displayName: 'Bad', bio: 'x'.repeat(2001) }],
      });

      expect(profileCache.has('not valid!')).toBe(false);
    });

    it('유한하지 않은 팔로워 수가 포함된 payload는 무시한다', () => {
      dispatchMessage({
        type: MESSAGE_TYPES.PROFILE_DATA,
        profiles: [{ handle: 'valid_user', displayName: 'Valid', bio: '', followersCount: Number.NaN }],
      });

      expect(profileCache.has('valid_user')).toBe(false);
    });
  });

  // ── BBR_FOLLOW_DATA (type guard + handler) ──────────────────────────

  describe('BBR_FOLLOW_DATA', () => {
    describe('isFollowDataPayload type guard', () => {
      it('handles가 없으면 무시한다', () => {
        dispatchMessage({
          type: MESSAGE_TYPES.FOLLOW_DATA,
          source: 'inline',
          // handles 누락
        });

        expect(mockSaveFollowHandles).not.toHaveBeenCalled();
      });

      it('handles가 배열이 아니면 무시한다', () => {
        dispatchMessage({
          type: MESSAGE_TYPES.FOLLOW_DATA,
          source: 'inline',
          handles: 'not-an-array',
        });

        expect(mockSaveFollowHandles).not.toHaveBeenCalled();
      });

      it('handles 원소가 문자열이 아니면 무시한다', () => {
        dispatchMessage({
          type: MESSAGE_TYPES.FOLLOW_DATA,
          source: 'inline',
          handles: [123, null],
        });

        expect(mockSaveFollowHandles).not.toHaveBeenCalled();
      });
    });

    describe('inline source (with source field)', () => {
      it('현재 계정과 다른 계정에서 시작된 follow 응답은 무시한다', () => {
        dispatchMessage({
          type: MESSAGE_TYPES.FOLLOW_DATA,
          account: 'otheraccount',
          source: 'api-timeline',
          handles: ['someone'],
        });

        expect(mockSaveFollowHandles).not.toHaveBeenCalled();
      });

      it('알 수 없는 source는 sourced 경로로 처리하지 않는다', () => {
        dispatchMessage({
          type: MESSAGE_TYPES.FOLLOW_DATA,
          source: 'forged-source',
          handles: ['someone'],
        });

        expect(mockSaveFollowHandles).not.toHaveBeenCalled();
      });

      it('followSet에 핸들을 소문자로 추가한다', () => {
        dispatchMessage({
          type: MESSAGE_TYPES.FOLLOW_DATA,
          source: 'inline',
          handles: ['Alice', 'BOB'],
        });

        const followSet = getFollowSet();
        expect(followSet.has('alice')).toBe(true);
        expect(followSet.has('bob')).toBe(true);
      });

      it('saveFollowHandles를 호출한다', () => {
        dispatchMessage({
          type: MESSAGE_TYPES.FOLLOW_DATA,
          source: 'inline',
          handles: ['testuser'],
        });

        expect(mockSaveFollowHandles).toHaveBeenCalledWith(['testuser'], deps, 'myaccount');
      });

      it('빈 handles 배열이면 followSet을 변경하지 않는다', () => {
        dispatchMessage({
          type: MESSAGE_TYPES.FOLLOW_DATA,
          source: 'inline',
          handles: [],
        });

        expect(mockSaveFollowHandles).not.toHaveBeenCalled();
        expect(getFollowSet().size).toBe(0);
      });

      it('신규 핸들의 작성자·리포스터 트윗만 다시 판정한다', () => {
        const main = document.createElement('main');
        const authorTweet = document.createElement('article');
        authorTweet.dataset.testid = 'tweet';
        authorTweet.dataset.author = 'someone';
        const retweet = document.createElement('article');
        retweet.dataset.testid = 'tweet';
        retweet.dataset.author = 'other';
        retweet.dataset.retweeter = 'someone';
        const unrelated = document.createElement('article');
        unrelated.dataset.testid = 'tweet';
        unrelated.dataset.author = 'unrelated';
        main.append(authorTweet, retweet, unrelated);
        document.body.appendChild(main);
        mockExtractTweetAuthor.mockImplementation((element: HTMLElement) => ({
          handle: element.dataset.author,
        }));
        mockExtractRetweeterHandle.mockImplementation(
          (element: HTMLElement) => element.dataset.retweeter ?? null,
        );

        dispatchMessage({
          type: MESSAGE_TYPES.FOLLOW_DATA,
          source: 'inline',
          handles: ['someone'],
        });

        vi.runAllTimers();

        expect(mockProcessTweet).toHaveBeenCalledTimes(2);
        expect(mockProcessTweet).toHaveBeenCalledWith(authorTweet);
        expect(mockProcessTweet).toHaveBeenCalledWith(retweet);
        expect(mockProcessTweet).not.toHaveBeenCalledWith(unrelated);
        expect(mockRestoreHiddenTweets).not.toHaveBeenCalled();
        expect(mockReprocessExistingTweets).not.toHaveBeenCalled();
      });

      it('현재 경로의 유저가 followSet에 있으면 fadak 배너를 제거한다', () => {
        Object.defineProperty(window, 'location', {
          value: { pathname: '/TestUser/status/123', origin: savedOrigin },
          writable: true,
          configurable: true,
        });

        // 미리 followSet에 추가해 두어야 pathHandle 비교에 통과
        const followSet = getFollowSet();
        followSet.add('testuser');

        dispatchMessage({
          type: MESSAGE_TYPES.FOLLOW_DATA,
          source: 'inline',
          handles: ['AnotherUser'],
        });

        expect(mockRemoveFadakBanner).toHaveBeenCalled();
      });
    });

    describe("source 'api-timeline' (timeline API)", () => {
      it('inline과 동일 경로로 처리: followSet에 소문자 추가 + saveFollowHandles 호출', () => {
        dispatchMessage({
          type: MESSAGE_TYPES.FOLLOW_DATA,
          source: 'api-timeline',
          handles: ['NewFadak'],
        });

        expect(getFollowSet().has('newfadak')).toBe(true);
        expect(mockSaveFollowHandles).toHaveBeenCalledWith(['newfadak'], deps, 'myaccount');
      });

      it('api-timeline은 myHandle/경로 가드를 타지 않는다 — 리스트 페이지에서도 저장', () => {
        mockGetMyHandle.mockReturnValue('myhandle');
        Object.defineProperty(window, 'location', {
          value: { pathname: '/i/lists/12345', origin: savedOrigin },
          writable: true,
          configurable: true,
        });

        dispatchMessage({
          type: MESSAGE_TYPES.FOLLOW_DATA,
          source: 'api-timeline',
          handles: ['ListFadak'],
        });

        expect(mockSaveFollowHandles).toHaveBeenCalledWith(['listfadak'], deps, 'myaccount');
      });

      it('타이머 후 전체 피드 복원·재처리를 호출하지 않는다', () => {
        dispatchMessage({
          type: MESSAGE_TYPES.FOLLOW_DATA,
          source: 'api-timeline',
          handles: ['someone'],
        });

        expect(mockRestoreHiddenTweets).not.toHaveBeenCalled();
        expect(mockReprocessExistingTweets).not.toHaveBeenCalled();

        vi.runAllTimers();

        expect(mockRestoreHiddenTweets).not.toHaveBeenCalled();
        expect(mockReprocessExistingTweets).not.toHaveBeenCalled();
      });
    });

    describe('storm guard (sourced 공통)', () => {
      it.each(['api-timeline', 'inline'])(
        "source '%s': 모든 핸들이 followSet에 이미 있으면 조기 반환 — 저장/재처리 없음",
        (source) => {
          setFollowSet(new Set(['known1', 'known2']));

          dispatchMessage({
            type: MESSAGE_TYPES.FOLLOW_DATA,
            source,
            handles: ['Known1', 'KNOWN2'],
          });

          expect(mockSaveFollowHandles).not.toHaveBeenCalled();

          vi.runAllTimers();

          expect(mockRestoreHiddenTweets).not.toHaveBeenCalled();
          expect(mockReprocessExistingTweets).not.toHaveBeenCalled();
        },
      );

      it('일부만 신규면 신규 소문자 핸들만 saveFollowHandles에 전달한다', () => {
        setFollowSet(new Set(['old']));

        dispatchMessage({
          type: MESSAGE_TYPES.FOLLOW_DATA,
          source: 'api-timeline',
          handles: ['Old', 'Fresh'],
        });

        expect(mockSaveFollowHandles).toHaveBeenCalledWith(['fresh'], deps, 'myaccount');
        expect(getFollowSet().has('fresh')).toBe(true);
      });

      it('배치 내 중복 핸들은 1회만 저장한다', () => {
        dispatchMessage({
          type: MESSAGE_TYPES.FOLLOW_DATA,
          source: 'api-timeline',
          handles: ['Dup', 'dup'],
        });

        expect(mockSaveFollowHandles).toHaveBeenCalledWith(['dup'], deps, 'myaccount');
      });

      it('debugMode on이면 [BBR FOLLOW] 로그에 source/incoming/new 카운트를 출력한다', () => {
        setSettings({ ...DEFAULT_SETTINGS, debugMode: true });
        setFollowSet(new Set(['known']));

        dispatchMessage({
          type: MESSAGE_TYPES.FOLLOW_DATA,
          source: 'api-timeline',
          handles: ['Known', 'Fresh'],
        });

        expect(logger.debug).toHaveBeenCalledWith('Follow data received', {
          source: 'api-timeline',
          incoming: 2,
          newCount: 1,
        });
      });
    });

    describe('API source (without source field)', () => {
      it('myHandle이 없으면 saveFollowHandles를 호출한다', () => {
        mockGetMyHandle.mockReturnValue(null);

        dispatchMessage({
          type: MESSAGE_TYPES.FOLLOW_DATA,
          handles: ['user1'],
        });

        expect(mockSaveFollowHandles).toHaveBeenCalledWith(['user1'], deps, 'myaccount');
      });

      it('myHandle과 pathUser가 같으면 saveFollowHandles를 호출한다', () => {
        mockGetMyHandle.mockReturnValue('myhandle');
        Object.defineProperty(window, 'location', {
          value: { pathname: '/myhandle/following', origin: savedOrigin },
          writable: true,
          configurable: true,
        });

        dispatchMessage({
          type: MESSAGE_TYPES.FOLLOW_DATA,
          handles: ['followee'],
        });

        expect(mockSaveFollowHandles).toHaveBeenCalledWith(['followee'], deps, 'myaccount');
      });

      it('myHandle과 pathUser가 다르면 무시한다', () => {
        mockGetMyHandle.mockReturnValue('myhandle');
        Object.defineProperty(window, 'location', {
          value: { pathname: '/otheruser/following', origin: savedOrigin },
          writable: true,
          configurable: true,
        });

        dispatchMessage({
          type: MESSAGE_TYPES.FOLLOW_DATA,
          handles: ['someone'],
        });

        expect(mockSaveFollowHandles).not.toHaveBeenCalled();
      });

      it('saveFollowHandles 완료 후 전체 피드 복원·재처리를 호출하지 않는다', async () => {
        mockGetMyHandle.mockReturnValue(null);
        mockSaveFollowHandles.mockResolvedValue(undefined);

        dispatchMessage({
          type: MESSAGE_TYPES.FOLLOW_DATA,
          handles: ['user1'],
        });

        // Promise 체인(.then)이 완료될 때까지 대기
        await vi.runAllTimersAsync();
        await Promise.resolve();
        await Promise.resolve();

        expect(mockRestoreHiddenTweets).not.toHaveBeenCalled();
        expect(mockReprocessExistingTweets).not.toHaveBeenCalled();
      });
    });

    describe('scheduleFollowReprocess 공유 디바운스 (Defect 3)', () => {
      it('message-handler와 storage 트리거가 겹쳐도 같은 핸들은 한 번만 targeted 재처리한다', () => {
        const tweet = document.createElement('article');
        tweet.dataset.testid = 'tweet';
        document.body.appendChild(tweet);
        mockExtractTweetAuthor.mockReturnValue({ handle: 'someone' });
        mockExtractRetweeterHandle.mockReturnValue(null);
        // FOLLOW_DATA 처리(내부에서 scheduleFollowReprocess 호출)와,
        // storage-listener.ts의 handleFollowListChange가 동일 tick에 호출할 scheduleFollowReprocess를
        // 시뮬레이션한다 — 두 트리거가 동일한 공유 타이머를 사용하므로 1회로 합쳐져야 한다.
        dispatchMessage({
          type: MESSAGE_TYPES.FOLLOW_DATA,
          source: 'inline',
          handles: ['someone'],
        });
        scheduleFollowReprocess(['someone']);

        vi.runAllTimers();

        expect(mockProcessTweet).toHaveBeenCalledOnce();
        expect(mockProcessTweet).toHaveBeenCalledWith(tweet);
      });
    });

    describe('경계값 검증 (Defect 4)', () => {
      it('handles가 배열이 아니면 무시한다 (타입가드 우회 시에도 방어)', () => {
        dispatchMessage({
          type: MESSAGE_TYPES.FOLLOW_DATA,
          source: 'inline',
          handles: 'not-an-array',
        });

        expect(mockSaveFollowHandles).not.toHaveBeenCalled();
      });

      it('문자열이 아니거나, X 핸들 형식이 아니거나, 15자를 초과하는 항목은 걸러낸다', () => {
        const tooLong = 'a'.repeat(16);
        dispatchMessage({
          type: MESSAGE_TYPES.FOLLOW_DATA,
          source: 'inline',
          handles: ['Valid1', 123, null, '', '   ', tooLong, 'bad-handle', 'Valid2'],
        });

        expect(mockSaveFollowHandles).toHaveBeenCalledWith(['valid1', 'valid2'], deps, 'myaccount');
      });

      it('길이가 정확히 15자인 핸들은 유효하게 처리한다', () => {
        const exactly15 = 'b'.repeat(15);
        dispatchMessage({
          type: MESSAGE_TYPES.FOLLOW_DATA,
          source: 'inline',
          handles: [exactly15],
        });

        expect(mockSaveFollowHandles).toHaveBeenCalledWith([exactly15], deps, 'myaccount');
      });

      it('메시지당 최대 1000개까지만 처리한다 (1500개 중 앞 1000개)', () => {
        const handles = Array.from({ length: 1500 }, (_, i) => `user${i}`);
        dispatchMessage({
          type: MESSAGE_TYPES.FOLLOW_DATA,
          source: 'inline',
          handles,
        });

        expect(mockSaveFollowHandles).toHaveBeenCalledTimes(1);
        const call = mockSaveFollowHandles.mock.calls[0] as unknown as [string[], FollowCollectorDeps];
        const passed = call[0];
        expect(passed).toHaveLength(1000);
        expect(passed[0]).toBe('user0');
        expect(passed[999]).toBe('user999');
      });
    });
  });
});
