// #142 리뷰 r1: index.ts를 실제로 불러와 init 흐름을 돌린다. 화면·네트워크에 닿는 모듈만 가짜로 바꾸고,
// 계정 판정(page-utils)·상태(state)·팔로우 저장소 전환(follow-collector의 switchFollowAccount)은 실제 코드를 쓴다.
//  - S1-1: xweb 본인 계정 힌트가 init 도중 도착하면 첫 CONTENT_READY에 그 계정이 실린다.
//  - S1-2: 다른 탭이 저장소를 먼저 새 계정으로 바꿨어도 이 탭이 그 계정과 팔로우 집합을 따라간다.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { MESSAGE_TYPES, STORAGE_KEYS } from '../../src/shared/constants';

const ctl = vi.hoisted(() => ({
  store: {} as Record<string, unknown>,
  settingsGate: Promise.resolve() as Promise<void>,
}));

vi.mock('wxt/browser', () => ({
  browser: {
    storage: {
      local: {
        get: vi.fn(async (keys?: string[] | string | null) => {
          if (keys === null || keys === undefined) return { ...ctl.store };
          const wanted = Array.isArray(keys) ? keys : [keys];
          return Object.fromEntries(wanted.filter((key) => key in ctl.store).map((key) => [key, ctl.store[key]]));
        }),
        set: vi.fn(async (items: Record<string, unknown>) => { Object.assign(ctl.store, items); }),
      },
    },
  },
}));
vi.mock('@shared/utils/logger', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));
vi.mock('@features/content-filter', () => ({
  FeedObserver: class { ensureObserving = vi.fn(); },
  setTweetHiderLanguage: vi.fn(),
}));
vi.mock('@features/settings', async () => {
  const { DEFAULT_SETTINGS } = await import('../../src/shared/constants');
  return {
    getSettings: vi.fn(async () => { await ctl.settingsGate; return { ...DEFAULT_SETTINGS }; }),
    getWhitelist: vi.fn(async () => []),
    getStoredWhitelist: vi.fn(async () => []),
    addToWhitelist: vi.fn(),
  };
});
vi.mock('@features/stats', () => ({ startStatsFlush: vi.fn(), flushStats: vi.fn(), setOnFlush: vi.fn(), recordHide: vi.fn(), unrecordHide: vi.fn() }));
vi.mock('../../src/content/fadak-banner', () => ({
  showFadakProfileBanner: vi.fn(),
  showFadakDetailBanner: vi.fn(),
  removeFadakBanner: vi.fn(),
}));
vi.mock('../../src/content/navigation', () => ({ listenForNavigation: vi.fn(), setOnNavigate: vi.fn() }));
vi.mock('../../src/content/settings-shortcut', () => ({ observeSettingsShortcut: vi.fn() }));
vi.mock('../../src/content/collector-buffer', () => ({ flushCollector: vi.fn(), bufferCollectedFadak: vi.fn() }));
vi.mock('../../src/content/filter-pipeline', () => ({ loadFilterRules: vi.fn().mockResolvedValue(undefined) }));
vi.mock('../../src/content/tweet-orchestrator', () => ({
  processTweet: vi.fn(),
  restoreHiddenTweets: vi.fn(),
  reprocessExistingTweets: vi.fn(),
  applyCurrentUserFallback: vi.fn(),
}));
vi.mock('../../src/content/storage-listener', () => ({ listenForSettingsChanges: vi.fn() }));
vi.mock('../../src/content/reload-probe', () => ({ listenForReloadProbe: vi.fn() }));
vi.mock('../../src/content/milestone-banner', () => ({ checkMilestone: vi.fn() }));
vi.mock('../../src/content/hover-card-observer', () => ({
  HoverCardObserver: class { sync = vi.fn(); },
  mergeHoverCardBio: vi.fn(),
  shouldObserveHoverCards: vi.fn().mockReturnValue(false),
}));
vi.mock('../../src/content/follow-collector', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../src/content/follow-collector')>()),
  collectFollowsFromDOM: vi.fn(),
  disconnectFollowObserver: vi.fn(),
  listenForFollowButtonClicks: vi.fn(),
}));

const XWEB_SCRIPT = 'https://abs.twimg.com/x-web/x-web/entry-client.0123abcd.js';

type Posted = { type: string; account?: string };

let posted: Posted[];
// index.ts를 시험마다 다시 불러오므로 window에 붙은 리스너가 쌓인다 — 시험이 끝나면 이번에 붙은 것만 떼어 낸다
let attached: Array<[string, EventListenerOrEventListenerObject]>;
const originalAddEventListener = window.addEventListener.bind(window);

function contentReadyMessages(): Posted[] {
  return posted.filter((message) => message.type === MESSAGE_TYPES.CONTENT_READY);
}

function sendViewerHandle(handle: string): void {
  window.dispatchEvent(new MessageEvent('message', {
    source: window,
    origin: window.location.origin,
    data: { type: MESSAGE_TYPES.VIEWER_HANDLE, handle },
  }));
}

/** 마이크로태스크 연쇄(storage 왕복·큐)를 비운다. 이 시험의 비동기는 모두 가짜 storage라 타이머가 필요 없다 */
async function flush(): Promise<void> {
  for (let i = 0; i < 50; i++) await Promise.resolve();
}

async function startContent(): Promise<void> {
  await import('../../src/content/index');
}

function seedStorage(current: string, cache: Record<string, string[]>): void {
  ctl.store[STORAGE_KEYS.CURRENT_USER_ID] = current;
  ctl.store[STORAGE_KEYS.FOLLOW_CACHE] = cache;
  ctl.store[STORAGE_KEYS.FOLLOW_LIST] = cache[current] ?? [];
}

describe('content init — xweb 본인 계정 힌트 (#142 리뷰 r1)', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.useFakeTimers();
    for (const key of Object.keys(ctl.store)) delete ctl.store[key];
    ctl.settingsGate = Promise.resolve();
    document.head.innerHTML = `<script src="${XWEB_SCRIPT}"></script>`;
    document.body.innerHTML = '<main></main>';
    posted = [];
    attached = [];
    vi.spyOn(window, 'postMessage').mockImplementation(((message: Posted) => { posted.push(message); }) as never);
    vi.spyOn(window, 'addEventListener').mockImplementation(((type: string, listener: EventListenerOrEventListenerObject, options?: boolean | AddEventListenerOptions) => {
      attached.push([type, listener]);
      originalAddEventListener(type, listener, options);
    }) as never);
  });

  afterEach(() => {
    for (const [type, listener] of attached) window.removeEventListener(type, listener);
    vi.useRealTimers();
    vi.restoreAllMocks();
    document.head.innerHTML = '';
  });

  it('S1-1: init 도중(설정 읽는 중) 도착한 힌트로 첫 CONTENT_READY에 계정이 실린다', async () => {
    seedStorage('', {});
    let release!: () => void;
    ctl.settingsGate = new Promise<void>((resolve) => { release = resolve; });

    await startContent();
    sendViewerHandle('Viewer_One');
    release();
    await flush();

    const ready = contentReadyMessages();
    expect(ready.length).toBeGreaterThan(0);
    expect(ready[0]).toEqual({ type: MESSAGE_TYPES.CONTENT_READY, account: 'viewer_one' });
    expect(ready.some((message) => message.account === undefined)).toBe(false);
  });

  it('S1-1: 힌트가 아직 없으면 계정 없는 CONTENT_READY로 MAIN world에 다시 받기를 요청한다 (대체 경로)', async () => {
    seedStorage('', {});

    await startContent();
    await flush();

    expect(contentReadyMessages()).toEqual([{ type: MESSAGE_TYPES.CONTENT_READY }]);
  });

  it('S1-1: 초기 계정 판정이 끝난 뒤 도착한 힌트도 계정 판정 후 CONTENT_READY로 알린다', async () => {
    seedStorage('', {});

    await startContent();
    await flush();
    sendViewerHandle('late_viewer');
    await flush();

    const ready = contentReadyMessages();
    expect(ready[ready.length - 1]).toEqual({ type: MESSAGE_TYPES.CONTENT_READY, account: 'late_viewer' });
  });

  it('S1-2: 저장소가 이미 B인데 메모리가 A인 탭이 B를 감지하면 메모리 계정과 팔로우 집합을 B로 맞춘다', async () => {
    seedStorage('a_account', { a_account: ['a_follow'], b_account: ['b_follow'] });

    await startContent();
    await flush();
    const state = await import('../../src/content/state');
    expect(state.getCurrentUserHandle()).toBe('a_account');
    expect(state.getFollowSet().has('a_follow')).toBe(true);

    // 다른 탭이 먼저 저장소를 B로 바꾼 상황
    seedStorage('b_account', { a_account: ['a_follow'], b_account: ['b_follow'] });
    sendViewerHandle('b_account');
    await flush();

    expect(state.getCurrentUserHandle()).toBe('b_account');
    expect(state.getFollowSet().has('b_follow')).toBe(true);
    expect(state.getFollowSet().has('a_follow')).toBe(false);
  });

  it('S1-2: 이 탭을 B에 맞추면 재판정과 배너 갱신을 하고 B 계정으로 준비 신호를 보낸다', async () => {
    seedStorage('a_account', { a_account: ['a_follow'], b_account: ['b_follow'] });
    await startContent();
    await flush();
    const orchestrator = await import('../../src/content/tweet-orchestrator');
    const banner = await import('../../src/content/fadak-banner');
    vi.mocked(orchestrator.reprocessExistingTweets).mockClear();
    vi.mocked(banner.showFadakProfileBanner).mockClear();

    seedStorage('b_account', { a_account: ['a_follow'], b_account: ['b_follow'] });
    sendViewerHandle('b_account');
    await flush();

    expect(vi.mocked(orchestrator.restoreHiddenTweets)).toHaveBeenCalled();
    expect(vi.mocked(orchestrator.reprocessExistingTweets)).toHaveBeenCalled();
    expect(vi.mocked(banner.showFadakProfileBanner)).toHaveBeenCalled();
    const ready = contentReadyMessages();
    expect(ready[ready.length - 1]).toEqual({ type: MESSAGE_TYPES.CONTENT_READY, account: 'b_account' });
  });

  // #142 리뷰 r3 S1-1: 첫 방문 숨김 유예(알던 핸들·시한·건너뛴 트윗)는 계정별이다. 계정이 바뀌면 새 계정의 첫 방문으로 다시 센다
  it('r3 S1-1: 다른 계정으로 바뀌면 이전 계정에서 알게 된 팔로우 여부와 끝난 유예를 새 계정 기준으로 다시 시작한다', async () => {
    seedStorage('a_account', { a_account: [], b_account: [] });
    await startContent();
    await flush();
    const grace = await import('../../src/content/follow-grace');
    const author = document.createElement('article');
    grace.markFollowKnown(['some_author'], false);
    expect(grace.deferHidingForFollows(author, ['some_author'], vi.fn())).toBe(false);

    seedStorage('b_account', { a_account: [], b_account: [] });
    sendViewerHandle('b_account');
    await flush();

    expect(grace.deferHidingForFollows(author, ['some_author'], vi.fn())).toBe(true);
  });

  it('r3 S1-1: 계정을 처음 알게 된 경우(이전 계정 없음)에는 이미 건너뛴 트윗과 돌고 있는 유예를 이어 간다', async () => {
    seedStorage('', {});
    await startContent();
    await flush();
    const grace = await import('../../src/content/follow-grace');
    const waiting = document.createElement('article');
    document.body.append(waiting);
    expect(grace.deferHidingForFollows(waiting, ['some_author'], vi.fn())).toBe(true);

    sendViewerHandle('first_viewer');
    await flush();

    // 건너뛴 트윗이 그대로 남아 있어, 그 작성자의 팔로우 여부가 알려지면 다시 판정하라고 돌려준다
    expect(grace.markFollowKnown(['some_author'], false)).toEqual([waiting]);
  });

  it('S1-2: 이 탭과 저장소가 이미 같은 계정이면 저장소를 다시 쓰거나 재판정하지 않는다', async () => {
    seedStorage('b_account', { b_account: ['b_follow'] });
    await startContent();
    await flush();
    const orchestrator = await import('../../src/content/tweet-orchestrator');
    const { browser } = await import('wxt/browser');
    vi.mocked(orchestrator.reprocessExistingTweets).mockClear();
    vi.mocked(browser.storage.local.set).mockClear();

    sendViewerHandle('b_account');
    await flush();

    expect(vi.mocked(browser.storage.local.set)).not.toHaveBeenCalled();
    expect(vi.mocked(orchestrator.reprocessExistingTweets)).not.toHaveBeenCalled();
  });
});
