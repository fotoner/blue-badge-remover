// tests/content/follow-collector.test.ts
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { browser } from 'wxt/browser';
import { STORAGE_KEYS, DEFAULT_SETTINGS } from '../../src/shared/constants';

// Mock browser.storage.local
const mockChromeStorage: Record<string, unknown> = {};
vi.mock('wxt/browser', () => ({
  browser: {
    storage: {
      local: {
        get: vi.fn(async (keys: string[]) => {
          const result: Record<string, unknown> = {};
          for (const key of keys) {
            if (key in mockChromeStorage) {
              result[key] = mockChromeStorage[key];
            }
          }
          return result;
        }),
        set: vi.fn(async (data: Record<string, unknown>) => {
          Object.assign(mockChromeStorage, data);
        }),
      },
    },
  },
}));

const {
  collectFollowsFromDOM,
  disconnectFollowObserver,
  getMyHandle,
  resolveAccountSwitchFollows,
  saveFollowHandles,
} = await import('../../src/content/follow-collector');
type FollowCollectorDeps = import('../../src/content/follow-collector').FollowCollectorDeps;

afterEach(() => {
  disconnectFollowObserver();
});

function setPath(path: string): void {
  Object.defineProperty(window, 'location', {
    value: { ...window.location, pathname: path, href: `https://x.com${path}` },
    writable: true,
    configurable: true,
  });
}

function createProfileLink(handle: string): void {
  const link = document.createElement('a');
  link.setAttribute('data-testid', 'AppTabBar_Profile_Link');
  link.setAttribute('href', `/${handle}`);
  document.body.appendChild(link);
}

describe('getMyHandle', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
  });

  it('should return null when no profile link exists', () => {
    expect(getMyHandle()).toBeNull();
  });

  it('should return lowercase handle from profile link', () => {
    createProfileLink('MyHandle');
    expect(getMyHandle()).toBe('myhandle');
  });
});

describe('resolveAccountSwitchFollows', () => {
  it('최초 계정 감지 전 수집한 임시 팔로우를 계정 캐시와 병합한다', () => {
    const result = resolveAccountSwitchFollows(
      { myhandle: ['cached'] },
      'myhandle',
      null,
      ['EarlyFollow', 'cached'],
    );

    expect(result).toEqual(['cached', 'earlyfollow']);
  });

  it('기존 계정에서 다른 계정으로 전환할 때 이전 FOLLOW_LIST는 섞지 않는다', () => {
    const result = resolveAccountSwitchFollows(
      { second: ['second-follow'] },
      'second',
      'first',
      ['first-follow'],
    );

    expect(result).toEqual(['second-follow']);
  });
});

describe('collectFollowsFromDOM - guard: myHandle !== pathUser', () => {
  let deps: FollowCollectorDeps;

  beforeEach(() => {
    vi.useFakeTimers();
    vi.clearAllMocks();
    document.body.innerHTML = '';
    deps = {
      getCurrentSettings: () => ({
        enabled: true,
        filter: { timeline: true, replies: true, search: true, bookmarks: false, lists: true },
        hideMode: 'remove',
        retweetFilter: true,
        quoteMode: 'off',
        debugMode: false,
        language: 'ko',
        keywordFilterEnabled: false,
        keywordCollectorEnabled: false,
        defaultFilterEnabled: true,
        milestoneBannerEnabled: false,
        aggressorFilterEnabled: false,
      }),
      setFollowSet: vi.fn(),
    };
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('should not collect when on another user following page', () => {
    // My handle is "myhandle", but we're on /otheruser/following
    createProfileLink('myhandle');
    setPath('/otheruser/following');

    // collectFollowsFromDOM should return early without creating an observer
    collectFollowsFromDOM(deps);

    // No MutationObserver should be set up (we can't directly check this,
    // but we can verify no follow handles are saved)
    expect(deps.setFollowSet).not.toHaveBeenCalled();
  });

  it('should not collect when not on a /following page', () => {
    createProfileLink('myhandle');
    setPath('/home');

    collectFollowsFromDOM(deps);
    expect(deps.setFollowSet).not.toHaveBeenCalled();
  });

  it('should allow collection on own /following page', () => {
    createProfileLink('myhandle');
    setPath('/myhandle/following');

    // This should not return early (observer will be created)
    // We just verify it doesn't throw
    collectFollowsFromDOM(deps);
  });

  it('DOM mutation을 500ms 디바운스해 한 번만 저장한다', async () => {
    const followSet = new Set<string>();
    deps.getFollowSet = () => followSet;
    createProfileLink('myhandle');
    setPath('/myhandle/following');
    collectFollowsFromDOM(deps);

    const button = document.createElement('button');
    button.setAttribute('aria-label', 'Following @Alice');
    document.body.append(button, document.createElement('div'));
    await Promise.resolve();
    await Promise.resolve();

    await vi.advanceTimersByTimeAsync(499);
    expect(browser.storage.local.set).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1);
    expect(browser.storage.local.set).toHaveBeenCalledTimes(1);
  });

  it('이미 followSet에 있는 DOM 핸들은 저장하지 않는다', async () => {
    deps.getFollowSet = () => new Set(['alice']);
    createProfileLink('myhandle');
    setPath('/myhandle/following');
    collectFollowsFromDOM(deps);

    const button = document.createElement('button');
    button.setAttribute('aria-label', 'Following @Alice');
    document.body.appendChild(button);
    await Promise.resolve();
    await vi.advanceTimersByTimeAsync(500);

    expect(browser.storage.local.set).not.toHaveBeenCalled();
  });

  it('disconnect 시 예약된 DOM 수집 타이머도 취소한다', async () => {
    deps.getFollowSet = () => new Set<string>();
    createProfileLink('myhandle');
    setPath('/myhandle/following');
    collectFollowsFromDOM(deps);

    const button = document.createElement('button');
    button.setAttribute('aria-label', 'Following @Alice');
    document.body.appendChild(button);
    await Promise.resolve();
    disconnectFollowObserver();
    await vi.runAllTimersAsync();

    expect(browser.storage.local.set).not.toHaveBeenCalled();
  });
});

describe('saveFollowHandles concurrency (Defect 2)', () => {
  const getMock = browser.storage.local.get as unknown as ReturnType<typeof vi.fn>;
  const defaultGetImpl = getMock.getMockImplementation();

  function makeDeps(): FollowCollectorDeps {
    return {
      getCurrentSettings: () => DEFAULT_SETTINGS,
      setFollowSet: vi.fn(),
    };
  }

  beforeEach(() => {
    vi.clearAllMocks();
    for (const key of Object.keys(mockChromeStorage)) delete mockChromeStorage[key];
    // 실제 사용 시엔 계정 전환 감지 시점에 항상 설정됨 — read-modify-write 대상 필드(FOLLOW_CACHE)가
    // currentAccount에 의존하므로 테스트에서도 설정해 실제 race 조건을 재현한다.
    mockChromeStorage[STORAGE_KEYS.CURRENT_USER_ID] = 'testuser';
  });

  afterEach(() => {
    if (defaultGetImpl) getMock.mockImplementation(defaultGetImpl);
  });

  it('겹쳐서 호출된 두 번의 saveFollowHandles가 서로의 핸들을 덮어쓰지 않고 모두 보존한다', async () => {
    let callCount = 0;
    let resolveFirstGet: (() => void) | null = null;

    // storage.get을 호출 시점 스냅샷으로 응답하도록 재정의.
    // 첫 번째 호출만 외부에서 제어하는 deferred promise로 묶어 두어,
    // 두 번째 saveFollowHandles 호출이 실제로 "겹치는지"(직렬화되지 않았는지)를 관찰할 수 있게 한다.
    getMock.mockImplementation((keys: string[]) => {
      callCount++;
      const snapshotAtCallTime: Record<string, unknown> = {};
      for (const key of keys) {
        if (key in mockChromeStorage) snapshotAtCallTime[key] = mockChromeStorage[key];
      }
      if (callCount === 1) {
        return new Promise<Record<string, unknown>>((resolve) => {
          resolveFirstGet = () => resolve(snapshotAtCallTime);
        });
      }
      return Promise.resolve(snapshotAtCallTime);
    });

    const deps = makeDeps();
    const p1 = saveFollowHandles(['alice'], deps);
    const p2 = saveFollowHandles(['bob'], deps);

    // 마이크로태스크 + 매크로태스크를 모두 흘려보낸다.
    // 직렬화되어 있다면 첫 get()이 아직 pending인 동안 두 번째 get()은 호출되지 않아야 한다.
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(callCount).toBe(1);

    resolveFirstGet!();
    await p1;
    await p2;

    const finalList = mockChromeStorage[STORAGE_KEYS.FOLLOW_LIST] as string[];
    expect(finalList).toEqual(expect.arrayContaining(['alice', 'bob']));
    expect(finalList).toHaveLength(2);
  });

  it('여러 번의 saveFollowHandles 호출 뒤 storage에는 모든 배치의 핸들이 누적된다', async () => {
    const deps = makeDeps();
    await saveFollowHandles(['a'], deps);
    await saveFollowHandles(['b'], deps);
    await saveFollowHandles(['c'], deps);

    const finalList = mockChromeStorage[STORAGE_KEYS.FOLLOW_LIST] as string[];
    expect(finalList).toEqual(expect.arrayContaining(['a', 'b', 'c']));
    expect(finalList).toHaveLength(3);
  });

  it('전달된 핸들이 전부 저장돼 있으면 storage를 다시 쓰지 않는다', async () => {
    mockChromeStorage[STORAGE_KEYS.FOLLOW_CACHE] = { testuser: ['alice'] };
    mockChromeStorage[STORAGE_KEYS.FOLLOW_LIST] = ['alice'];
    const deps = makeDeps();

    await saveFollowHandles(['alice'], deps);

    expect(browser.storage.local.set).not.toHaveBeenCalled();
  });
});
