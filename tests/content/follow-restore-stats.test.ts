// #142 리뷰 r4 S1-1: 팔로우·화이트리스트 변경으로 복원된 트윗은 이번 세션의 숨김 통계에서 뺀다.
// 실제 orchestrator·message-handler·storage-listener·content-filter와 실제 통계 집계 버퍼(stats-collector)를 쓰고,
// 저장소와 화면 밖 모듈만 가짜로 바꿔, flush가 저장소에 넘기는 숨김 수로 "통계 증가"를 확인한다.
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
vi.mock('@features/settings', () => ({ addToWhitelist: vi.fn() }));
vi.mock('../../src/content/collector-buffer', () => ({
  bufferCollectedFadak: vi.fn(),
  flushCollector: vi.fn().mockResolvedValue(undefined),
}));
vi.mock('../../src/content/filter-pipeline', () => ({ loadFilterRules: vi.fn().mockResolvedValue(undefined) }));
vi.mock('../../src/content/fadak-banner', () => ({ removeFadakBanner: vi.fn() }));
vi.mock('../../src/content/follow-collector', () => ({
  saveFollowHandles: vi.fn().mockResolvedValue(undefined),
  removeFollowHandles: vi.fn().mockResolvedValue(undefined),
  isRecentlyFollowed: vi.fn().mockReturnValue(false),
  getMyHandle: vi.fn().mockReturnValue(null),
}));

const mockSaveDayStats = vi.fn();
vi.mock('@features/stats/stats-storage', () => ({
  getTodayStats: vi.fn(async () => ({ date: '2026-04-05', totalHidden: 0, totalShown: 0, byCategory: {}, byPack: {} })),
  saveDayStats: (...args: unknown[]) => mockSaveDayStats(...args),
  getAllTimeTotal: vi.fn().mockResolvedValue(0),
  incrementTotal: vi.fn().mockResolvedValue(undefined),
}));

import { flushStats } from '@features/stats';
import { setSettings, setFollowSet, getFollowSet, setWhitelistSet, setCurrentUserHandle, getExpandedSet } from '../../src/content/state';
import { listenForSettingsChanges } from '../../src/content/storage-listener';
import { listenForMessages } from '../../src/content/message-handler';
import { processTweet } from '../../src/content/tweet-orchestrator';
import type { FollowCollectorDeps } from '../../src/content/follow-collector';

type ChangesListener = (changes: Record<string, { newValue?: unknown; oldValue?: unknown }>) => void;

const ACCOUNT = 'myaccount';
const BADGE_SVG = '<svg data-testid="icon-verified"><g><path d="M0 0"></path></g></svg>';
const HIDDEN_ATTR = 'data-bbr-original';

let changesListener: ChangesListener;
let statusId = 0;

/** 실측 X DOM의 뼈대(작성자 User-Name)만 남긴 파딱 트윗. statusPath가 있어야 집계가 트윗 단위로 구별된다 */
function appendFadakTweet(handle: string, parent: HTMLElement = mainElement()): HTMLElement {
  const article = document.createElement('article');
  article.setAttribute('data-testid', 'tweet');
  statusId += 1;
  article.innerHTML = `
    <div data-testid="User-Name">
      <a href="/${handle}" role="link"><span>Name ${handle}</span>${BADGE_SVG}</a>
      <a href="/${handle}" role="link"><span>@${handle}</span></a>
    </div>
    <a href="/${handle}/status/${statusId}"><time>1h</time></a>
    <div data-testid="tweetText"><span>text</span></div>`;
  parent.appendChild(article);
  return article;
}

function mainElement(): HTMLElement {
  return document.querySelector<HTMLElement>('main') ?? document.body.appendChild(document.createElement('main'));
}

function appendDialog(): HTMLElement {
  const dialog = document.createElement('div');
  dialog.setAttribute('role', 'dialog');
  document.body.appendChild(dialog);
  return dialog;
}

function sendFollow(handle: string): void {
  window.dispatchEvent(new MessageEvent('message', {
    source: window,
    origin: window.location.origin,
    data: { type: MESSAGE_TYPES.FOLLOW_DATA, source: 'api-timeline', handles: [handle], account: ACCOUNT },
  }));
}

function changeWhitelist(handles: string[]): void {
  changesListener({ [STORAGE_KEYS.WHITELIST]: { newValue: handles } });
}

/** 다음 프레임(reprocessExistingTweets의 rAF)과 재판정 예약 타이머까지 시간을 흘린다 */
function settle(): void {
  vi.advanceTimersByTime(50);
}

/** 집계 버퍼를 저장소로 흘려보내고, 그때 저장된 일별 숨김 수(없으면 0)를 돌려준다 */
async function flushedHiddenCount(): Promise<number> {
  mockSaveDayStats.mockClear();
  await flushStats();
  const saved = mockSaveDayStats.mock.calls[0]?.[0] as { totalHidden: number } | undefined;
  return saved?.totalHidden ?? 0;
}

// 저장소·메시지 리스너는 파일 전체에서 한 번만 단다 — 어느 시험 묶음만 골라 돌려도 리스너가 있게 한다 (#142 리뷰 r6 S6-3)
beforeAll(() => {
  const deps: FollowCollectorDeps = { getCurrentSettings: () => DEFAULT_SETTINGS, setFollowSet, getFollowSet };
  listenForSettingsChanges(vi.fn());
  changesListener = mockAddListener.mock.calls[0]![0] as ChangesListener;
  listenForMessages(deps);
});

describe('팔로우·화이트리스트 변경으로 복원된 트윗은 숨김 통계에서 뺀다 (#142 리뷰 r4 S1-1)', () => {
  beforeEach(async () => {
    vi.useFakeTimers();
    history.replaceState({}, '', '/home');
    setSettings({ ...DEFAULT_SETTINGS });
    setFollowSet(new Set(['someone_else']));
    setWhitelistSet(new Set<string>());
    setCurrentUserHandle(ACCOUNT);
    getExpandedSet().clear();
    document.body.innerHTML = '';
    // 앞 시험이 남긴 집계를 비운다
    await flushStats();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('숨김 → 팔로우 응답 도착 → 복원이면 통계 증가가 0이다', async () => {
    const tweet = appendFadakTweet('fadak_a');
    processTweet(tweet);
    expect(tweet.hasAttribute(HIDDEN_ATTR)).toBe(true);

    sendFollow('fadak_a');
    settle();

    expect(tweet.hasAttribute(HIDDEN_ATTR)).toBe(false);
    expect(await flushedHiddenCount()).toBe(0);
  });

  it('팔로우 응답과 무관한 숨김은 그대로 센다', async () => {
    const followed = appendFadakTweet('fadak_b');
    const stranger = appendFadakTweet('stranger_b');
    processTweet(followed);
    processTweet(stranger);

    sendFollow('fadak_b');
    settle();

    expect(followed.hasAttribute(HIDDEN_ATTR)).toBe(false);
    expect(stranger.hasAttribute(HIDDEN_ATTR)).toBe(true);
    expect(await flushedHiddenCount()).toBe(1);
  });

  it('팔로우 목록 저장소 변경으로 복원돼도 통계 증가가 0이다', async () => {
    const tweet = appendFadakTweet('fadak_c');
    processTweet(tweet);

    changesListener({ [STORAGE_KEYS.FOLLOW_LIST]: { oldValue: ['someone_else'], newValue: ['someone_else', 'fadak_c'] } });
    settle();

    expect(tweet.hasAttribute(HIDDEN_ATTR)).toBe(false);
    expect(await flushedHiddenCount()).toBe(0);
  });

  it('화이트리스트에 추가돼 복원돼도 통계 증가가 0이고, 계속 숨기는 트윗은 다시 센다', async () => {
    const whitelisted = appendFadakTweet('fadak_d');
    const stranger = appendFadakTweet('stranger_d');
    processTweet(whitelisted);
    processTweet(stranger);

    changeWhitelist(['@fadak_d']);
    settle();

    expect(whitelisted.hasAttribute(HIDDEN_ATTR)).toBe(false);
    expect(stranger.hasAttribute(HIDDEN_ATTR)).toBe(true);
    expect(await flushedHiddenCount()).toBe(1);
  });

  it('<main> 밖 대화상자의 숨긴 트윗도 화이트리스트로 복원되고 통계에서 빠진다', async () => {
    const tweet = appendFadakTweet('fadak_e', appendDialog());
    processTweet(tweet);
    expect(tweet.hasAttribute(HIDDEN_ATTR)).toBe(true);

    changeWhitelist(['@fadak_e']);
    settle();

    expect(tweet.hasAttribute(HIDDEN_ATTR)).toBe(false);
    expect(await flushedHiddenCount()).toBe(0);
  });

  it('<main> 밖 대화상자의 숨긴 트윗도 팔로우로 복원되고 통계에서 빠진다', async () => {
    const tweet = appendFadakTweet('fadak_f', appendDialog());
    processTweet(tweet);

    sendFollow('fadak_f');
    settle();

    expect(tweet.hasAttribute(HIDDEN_ATTR)).toBe(false);
    expect(await flushedHiddenCount()).toBe(0);
  });

  it('이미 저장소로 흘려보낸 숨김은 복원돼도 되돌리지 않는다', async () => {
    const tweet = appendFadakTweet('fadak_g');
    processTweet(tweet);
    expect(await flushedHiddenCount()).toBe(1);

    sendFollow('fadak_g');
    settle();

    expect(tweet.hasAttribute(HIDDEN_ATTR)).toBe(false);
    expect(await flushedHiddenCount()).toBe(0);
  });

  it('복원된 트윗을 다시 숨기면 그때 한 번 센다', async () => {
    const tweet = appendFadakTweet('fadak_h');
    processTweet(tweet);
    sendFollow('fadak_h');
    settle();
    expect(tweet.hasAttribute(HIDDEN_ATTR)).toBe(false);

    getFollowSet().delete('fadak_h');
    processTweet(tweet);

    expect(tweet.hasAttribute(HIDDEN_ATTR)).toBe(true);
    expect(await flushedHiddenCount()).toBe(1);
  });
});

// #142 리뷰 r5 S5-4: 화이트리스트 변경은 펼침 목록을 먼저 비운다. <main> 밖에서 사용자가 펼쳐 둔 트윗이 재판정으로 보이게 되면
// 펼침 목록과 상관없이 접기 버튼을 치워야 한다. 남겨 두면 화이트리스트에 넣은 계정의 트윗을 다시 접어 숨길 수 있다
describe('<main> 밖에서 펼친 트윗이 화이트리스트로 보이게 될 때 (#142 리뷰 r5 S5-4)', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    history.replaceState({}, '', '/home');
    setSettings({ ...DEFAULT_SETTINGS, hideMode: 'collapse' });
    setFollowSet(new Set(['someone_else']));
    setWhitelistSet(new Set<string>());
    setCurrentUserHandle(ACCOUNT);
    getExpandedSet().clear();
    document.body.innerHTML = '';
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('접기 버튼과 펼침 표식을 치운다', () => {
    // <main>이 없으면 문서 전체를 피드로 보므로, 대화상자가 피드 밖이 되도록 <main>을 먼저 둔다
    mainElement();
    const tweet = appendFadakTweet('fadak_x', appendDialog());
    processTweet(tweet);
    tweet.querySelector<HTMLElement>('.bbr-placeholder')?.click();
    expect(tweet.hasAttribute('data-bbr-expanded')).toBe(true);

    changeWhitelist(['@fadak_x']);
    settle();

    expect(tweet.hasAttribute('data-bbr-expanded')).toBe(false);
    expect(tweet.querySelector('[data-bbr-expanded-actions]')).toBeNull();
  });
});
