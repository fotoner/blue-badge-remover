import { describe, it, expect, beforeAll, beforeEach, vi } from 'vitest';
import { DEFAULT_SETTINGS, STORAGE_KEYS } from '../../src/shared/constants';

// --- Mock external modules BEFORE importing anything that depends on them ---

const mockAddListener = vi.fn();
vi.mock('wxt/browser', () => ({
  browser: { storage: { onChanged: { addListener: (...args: unknown[]) => mockAddListener(...args) } } },
}));

vi.mock('@features/content-filter', () => ({
  setTweetHiderLanguage: vi.fn(),
}));

const mockRestoreHiddenTweets = vi.fn();
const mockReprocessExistingTweets = vi.fn();
vi.mock('../../src/content/tweet-orchestrator', () => ({
  restoreHiddenTweets: (...args: unknown[]) => mockRestoreHiddenTweets(...args),
  reprocessExistingTweets: (...args: unknown[]) => mockReprocessExistingTweets(...args),
}));

const mockFlushCollector = vi.fn<() => Promise<void>>();
vi.mock('../../src/content/collector-buffer', () => ({
  flushCollector: () => mockFlushCollector(),
}));

const mockLoadFilterRules = vi.fn<() => Promise<void>>();
vi.mock('../../src/content/filter-pipeline', () => ({
  loadFilterRules: () => mockLoadFilterRules(),
}));

const mockRemoveFadakBanner = vi.fn();
vi.mock('../../src/content/fadak-banner', () => ({
  removeFadakBanner: (...args: unknown[]) => mockRemoveFadakBanner(...args),
}));

const mockScheduleFollowReprocess = vi.fn();
vi.mock('../../src/content/message-handler', () => ({
  scheduleFollowReprocess: (...args: unknown[]) => mockScheduleFollowReprocess(...args),
}));

// --- Import modules after all mocks are registered ---

import {
  setSettings,
  setFollowSet,
  getFollowSet,
  getWhitelistSet,
  setWhitelistSet,
  isHandleWhitelisted,
  getProtectedKeywords,
  setProtectedKeywords,
} from '../../src/content/state';
import { listenForSettingsChanges } from '../../src/content/storage-listener';

// --- Test helpers ---

type StorageChange = { newValue?: unknown; oldValue?: unknown };
type ChangesListener = (changes: Record<string, StorageChange>) => void;

let changesListener: ChangesListener;
const setDebugFlag = vi.fn();
const onSettingsChanged = vi.fn();

function dispatchChanges(changes: Record<string, StorageChange>): void {
  changesListener(changes);
}

// --- Tests ---

describe('storage-listener', () => {
  beforeAll(() => {
    listenForSettingsChanges(setDebugFlag, onSettingsChanged);
    changesListener = mockAddListener.mock.calls[0]![0] as ChangesListener;
  });

  it('설정 변경을 observer lifecycle 콜백에 전달한다', () => {
    const settings = { ...DEFAULT_SETTINGS, keywordFilterEnabled: true };

    dispatchChanges({
      [STORAGE_KEYS.SETTINGS]: { newValue: settings },
    });

    expect(onSettingsChanged).toHaveBeenCalledWith(settings);
  });

  beforeEach(() => {
    vi.clearAllMocks();
    mockFlushCollector.mockResolvedValue(undefined);
    mockLoadFilterRules.mockResolvedValue(undefined);
    setSettings({ ...DEFAULT_SETTINGS });
    setFollowSet(new Set<string>());
    setWhitelistSet(new Set<string>());
    setProtectedKeywords([]);
  });

  describe('whitelist change', () => {
    it('대소문자가 섞인 화이트리스트 항목도 소문자로 조회 가능해야 한다', () => {
      dispatchChanges({
        [STORAGE_KEYS.WHITELIST]: { newValue: ['@MixedCase'] },
      });

      expect(isHandleWhitelisted('mixedcase')).toBe(true);
    });

    it('restoreHiddenTweets와 reprocessExistingTweets를 호출한다', () => {
      dispatchChanges({
        [STORAGE_KEYS.WHITELIST]: { newValue: ['@someone'] },
      });

      expect(mockRestoreHiddenTweets).toHaveBeenCalledOnce();
      expect(mockReprocessExistingTweets).toHaveBeenCalledOnce();
    });

    it('newValue가 없으면 whitelistSet을 변경하지 않는다', () => {
      setWhitelistSet(new Set(['@existing']));

      dispatchChanges({
        [STORAGE_KEYS.WHITELIST]: {},
      });

      expect(getWhitelistSet()).toEqual(new Set(['@existing']));
    });
  });

  describe('protected keyword change', () => {
    it('상태를 갱신하고 기존 트윗을 재처리한다', () => {
      dispatchChanges({
        [STORAGE_KEYS.PROTECTED_KEYWORDS]: { newValue: ['game'] },
      });

      expect(getProtectedKeywords()).toEqual(['game']);
      expect(mockRestoreHiddenTweets).toHaveBeenCalledOnce();
      expect(mockReprocessExistingTweets).toHaveBeenCalledOnce();
      expect(onSettingsChanged).toHaveBeenCalledWith(DEFAULT_SETTINGS);
    });
  });

  // ── follow list change (Defect 3) ────────────────────────────────────

  describe('follow list change', () => {
    it('추가된 핸들이 있으면 scheduleFollowReprocess를 정확히 1회 호출한다', () => {
      dispatchChanges({
        [STORAGE_KEYS.FOLLOW_LIST]: { oldValue: ['alice'], newValue: ['alice', 'bob'] },
      });

      expect(mockScheduleFollowReprocess).toHaveBeenCalledTimes(1);
    });

    it('제거만 있는 변경(언팔로우)은 scheduleFollowReprocess를 호출하지 않는다', () => {
      dispatchChanges({
        [STORAGE_KEYS.FOLLOW_LIST]: { oldValue: ['alice', 'bob'], newValue: ['alice'] },
      });

      expect(mockScheduleFollowReprocess).not.toHaveBeenCalled();
    });

    it('변경이 없으면(동일 목록) scheduleFollowReprocess를 호출하지 않는다', () => {
      dispatchChanges({
        [STORAGE_KEYS.FOLLOW_LIST]: { oldValue: ['alice'], newValue: ['alice'] },
      });

      expect(mockScheduleFollowReprocess).not.toHaveBeenCalled();
    });

    it('oldValue가 없어도(최초 저장) newValue의 핸들을 추가분으로 간주해 스케줄한다', () => {
      dispatchChanges({
        [STORAGE_KEYS.FOLLOW_LIST]: { newValue: ['alice'] },
      });

      expect(mockScheduleFollowReprocess).toHaveBeenCalledTimes(1);
    });

    it('followSet은 항상 newValue로 재구성된다 (added 여부와 무관)', () => {
      dispatchChanges({
        [STORAGE_KEYS.FOLLOW_LIST]: { oldValue: ['alice', 'bob'], newValue: ['alice'] },
      });

      expect(getFollowSet()).toEqual(new Set(['alice']));
    });
  });
});
