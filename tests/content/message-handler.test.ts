import { describe, it, expect, beforeAll, beforeEach, vi, afterEach } from 'vitest';
import type { BadgeInfo } from '../../src/shared/types';
import { DEFAULT_SETTINGS } from '../../src/shared/constants';

// --- Mock external modules BEFORE importing anything that depends on them ---

vi.mock('wxt/browser', () => ({
  browser: { storage: { local: { get: vi.fn(), set: vi.fn() } } },
}));

const mockParseBadgeInfo = vi.fn<(userData: unknown) => BadgeInfo | null>();
vi.mock('@features/badge-detection', () => ({
  parseBadgeInfo: (userData: unknown) => mockParseBadgeInfo(userData),
  BadgeCache: class {
    cache = new Map<string, boolean>();
    get(k: string) { return this.cache.get(k); }
    set(k: string, v: boolean) { this.cache.set(k, v); }
    has(k: string) { return this.cache.has(k); }
    clear() { this.cache.clear(); }
  },
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
vi.mock('../../src/content/tweet-processing', () => ({
  extractTweetAuthor: (...args: unknown[]) => mockExtractTweetAuthor(...args),
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

import { badgeCache, profileCache, collectorBuffer, setSettings, getFollowSet, setFollowSet } from '../../src/content/state';
import { listenForMessages } from '../../src/content/message-handler';
import { MESSAGE_TYPES } from '../../src/shared/constants';
import type { FollowCollectorDeps } from '../../src/content/follow-collector';

// --- Test helpers ---

const savedOrigin = window.location.origin;

function dispatchMessage(data: unknown, options?: { source?: unknown; origin?: string }): void {
  const event = new MessageEvent('message', {
    source: (options?.source ?? window) as Window,
    origin: options?.origin ?? savedOrigin,
    data,
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
    collectorBuffer.clear();
    // Clear singleton caches (mock classes expose clear())
    (badgeCache as unknown as { cache: Map<string, unknown> }).cache.clear();
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
      mockParseBadgeInfo.mockReturnValue({
        userId: 'rest123', handle: 'testuser',
        isBluePremium: true, isLegacyVerified: false, isBusiness: false,
      });

      dispatchMessage(
        { type: MESSAGE_TYPES.BADGE_DATA, users: [{}] },
        { origin: 'https://evil.com' },
      );

      expect(mockParseBadgeInfo).not.toHaveBeenCalled();
    });

    it('source가 window가 아닌 메시지는 무시한다', () => {
      mockParseBadgeInfo.mockReturnValue({
        userId: 'rest123', handle: 'testuser',
        isBluePremium: true, isLegacyVerified: false, isBusiness: false,
      });

      // source: null means it's not from this window
      const event = new MessageEvent('message', {
        data: { type: MESSAGE_TYPES.BADGE_DATA, users: [{}] },
        origin: savedOrigin,
      });
      // MessageEvent without source defaults to null
      window.dispatchEvent(event);

      expect(mockParseBadgeInfo).not.toHaveBeenCalled();
    });
  });

  // ── BBR_BADGE_DATA ───────────────────────────────────────────────────

  describe('BBR_BADGE_DATA', () => {
    it('parseBadgeInfo 결과를 rest_id와 handle.toLowerCase() 양쪽으로 badgeCache에 저장한다', () => {
      mockParseBadgeInfo.mockReturnValue({
        userId: 'rest123', handle: 'TestUser',
        isBluePremium: true, isLegacyVerified: false, isBusiness: false,
      });

      dispatchMessage({
        type: MESSAGE_TYPES.BADGE_DATA,
        users: [{ rest_id: 'rest123' }],
      });

      expect(mockParseBadgeInfo).toHaveBeenCalledWith({ rest_id: 'rest123' });
      expect(badgeCache.get('rest123')).toBe(true);
      expect(badgeCache.get('testuser')).toBe(true);
    });

    it('parseBadgeInfo가 null을 반환하면 캐시에 저장하지 않는다', () => {
      mockParseBadgeInfo.mockReturnValue(null);

      dispatchMessage({
        type: MESSAGE_TYPES.BADGE_DATA,
        users: [{ rest_id: 'unknown' }],
      });

      expect(badgeCache.get('unknown')).toBeUndefined();
    });

    it('handle이 없는 경우 userId로만 저장한다', () => {
      mockParseBadgeInfo.mockReturnValue({
        userId: 'rest456', handle: null,
        isBluePremium: false, isLegacyVerified: true, isBusiness: false,
      });

      dispatchMessage({
        type: MESSAGE_TYPES.BADGE_DATA,
        users: [{ rest_id: 'rest456' }],
      });

      expect(badgeCache.get('rest456')).toBe(false);
    });

    it('여러 유저 데이터를 한 번에 처리한다', () => {
      mockParseBadgeInfo
        .mockReturnValueOnce({
          userId: 'u1', handle: 'Alice',
          isBluePremium: true, isLegacyVerified: false, isBusiness: false,
        })
        .mockReturnValueOnce({
          userId: 'u2', handle: 'Bob',
          isBluePremium: false, isLegacyVerified: false, isBusiness: true,
        });

      dispatchMessage({
        type: MESSAGE_TYPES.BADGE_DATA,
        users: [{}, {}],
      });

      expect(mockParseBadgeInfo).toHaveBeenCalledTimes(2);
      expect(badgeCache.get('u1')).toBe(true);
      expect(badgeCache.get('alice')).toBe(true);
      expect(badgeCache.get('u2')).toBe(false);
      expect(badgeCache.get('bob')).toBe(false);
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

        expect(mockSaveFollowHandles).toHaveBeenCalledWith(['testuser'], deps);
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

      it('타이머 후 restoreHiddenTweets + reprocessExistingTweets를 호출한다', () => {
        dispatchMessage({
          type: MESSAGE_TYPES.FOLLOW_DATA,
          source: 'inline',
          handles: ['someone'],
        });

        // 아직 setTimeout 콜백 실행 전
        expect(mockRestoreHiddenTweets).not.toHaveBeenCalled();
        expect(mockReprocessExistingTweets).not.toHaveBeenCalled();

        vi.runAllTimers();

        expect(mockRestoreHiddenTweets).toHaveBeenCalledOnce();
        expect(mockReprocessExistingTweets).toHaveBeenCalledOnce();
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

    describe('API source (without source field)', () => {
      it('myHandle이 없으면 saveFollowHandles를 호출한다', () => {
        mockGetMyHandle.mockReturnValue(null);

        dispatchMessage({
          type: MESSAGE_TYPES.FOLLOW_DATA,
          handles: ['user1'],
        });

        expect(mockSaveFollowHandles).toHaveBeenCalledWith(['user1'], deps);
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

        expect(mockSaveFollowHandles).toHaveBeenCalledWith(['followee'], deps);
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

      it('saveFollowHandles 완료 후 restoreHiddenTweets + reprocessExistingTweets를 호출한다', async () => {
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

        expect(mockRestoreHiddenTweets).toHaveBeenCalledOnce();
        expect(mockReprocessExistingTweets).toHaveBeenCalledOnce();
      });
    });
  });
});
