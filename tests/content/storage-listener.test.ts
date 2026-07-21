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

// --- Import modules after all mocks are registered ---

import {
  setSettings,
  setFollowSet,
  getWhitelistSet,
  setWhitelistSet,
  isHandleWhitelisted,
} from '../../src/content/state';
import { listenForSettingsChanges } from '../../src/content/storage-listener';

// --- Test helpers ---

type StorageChange = { newValue?: unknown; oldValue?: unknown };
type ChangesListener = (changes: Record<string, StorageChange>) => void;

let changesListener: ChangesListener;
const setDebugFlag = vi.fn();

function dispatchChanges(changes: Record<string, StorageChange>): void {
  changesListener(changes);
}

// --- Tests ---

describe('storage-listener', () => {
  beforeAll(() => {
    listenForSettingsChanges(setDebugFlag);
    changesListener = mockAddListener.mock.calls[0]![0] as ChangesListener;
  });

  beforeEach(() => {
    vi.clearAllMocks();
    mockFlushCollector.mockResolvedValue(undefined);
    mockLoadFilterRules.mockResolvedValue(undefined);
    setSettings({ ...DEFAULT_SETTINGS });
    setFollowSet(new Set<string>());
    setWhitelistSet(new Set<string>());
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
});
