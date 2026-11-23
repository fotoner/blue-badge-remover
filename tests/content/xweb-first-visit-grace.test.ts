// #142 리뷰 r3 S1-1·S3-1: xweb 첫 방문(팔로우 캐시 없음)에는 작성자의 팔로우 여부를 알 때까지(최대 2초) 그 작성자의 파딱 숨김 판정을 미룬다.
// 다른 작성자의 팔로우 정보가 먼저 와도 아직 모르는 작성자의 글은 숨기지 않으므로, 팔로우한 사람의 글이 잠깐 숨겨졌다 복원되며 숨김 통계가 남는 일이 없다.
// 실제 orchestrator·message-handler·state·content-filter를 쓰고, 시간과 화면 밖 모듈만 가짜로 바꾼다.
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { DEFAULT_SETTINGS, MESSAGE_TYPES, TIMINGS } from '../../src/shared/constants';

vi.mock('wxt/browser', () => ({
  browser: { storage: { local: { get: vi.fn().mockResolvedValue({}), set: vi.fn().mockResolvedValue(undefined) } } },
}));
vi.mock('@shared/utils/logger', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));
vi.mock('@features/stats', () => ({ recordHide: vi.fn(), unrecordHide: vi.fn() }));
vi.mock('@features/settings', () => ({ addToWhitelist: vi.fn() }));
vi.mock('../../src/content/collector-buffer', () => ({ bufferCollectedFadak: vi.fn() }));
vi.mock('../../src/content/fadak-banner', () => ({ removeFadakBanner: vi.fn() }));
vi.mock('../../src/content/follow-collector', () => ({
  saveFollowHandles: vi.fn().mockResolvedValue(undefined),
  removeFollowHandles: vi.fn().mockResolvedValue(undefined),
  isRecentlyFollowed: vi.fn().mockReturnValue(false),
  getMyHandle: vi.fn().mockReturnValue(null),
}));

import { recordHide, unrecordHide } from '@features/stats';
import { setSettings, setActiveFilterRules, setFollowSet, setWhitelistSet, setCurrentUserHandle, getExpandedSet, getFollowSet } from '../../src/content/state';
import { listenForMessages } from '../../src/content/message-handler';
import { processTweet } from '../../src/content/tweet-orchestrator';
import { resetFollowGrace } from '../../src/content/follow-grace';
import type { Settings } from '../../src/shared/types';

const XWEB_SCRIPT = 'https://abs.twimg.com/x-web/x-web/entry-client.0123abcd.js';
const RWEB_SCRIPT = 'https://abs.twimg.com/responsive-web/client-web/main.0123abcd.js';
const HIDDEN_TWEET_ATTR = 'data-bbr-original';
const ACCOUNT = 'me_account';
const FOLLOWED = 'followed_one';
const STRANGER = 'stranger_two';
const OTHER_AUTHOR = 'other_three';
const DIALOG_AUTHOR = 'dialog_four';
const SPAM_KEYWORD = 'spamword';

/** 실측 픽스처의 트윗 컨테이너를 복제해 작성자를 바꾼다. 인용 프레임 작성자도 같은 계정으로 바뀐다(인용 설정은 꺼져 있다) */
function loadFeed(): void {
  document.body.innerHTML = `<main>${readFileSync(resolve(process.cwd(), 'tests/fixtures/x-dom/xweb-quote-tweet.html'), 'utf8')}</main>`;
  const first = document.querySelector<HTMLElement>('[data-href="/user_1/status/1"]');
  if (!first) throw new Error('fixture has no tweet container');
  const second = first.cloneNode(true) as HTMLElement;
  retarget(first, FOLLOWED, 1);
  retarget(second, STRANGER, 2);
  first.after(second);
}

function retarget(container: HTMLElement, handle: string, id: number): void {
  container.querySelectorAll('[data-href]').forEach((el) => el.setAttribute('data-href', `/${handle}/status/${id}`));
  container.setAttribute('data-href', `/${handle}/status/${id}`);
  container.querySelectorAll('a[href^="/user_1"]').forEach((link) => {
    link.setAttribute('href', (link.getAttribute('href') ?? '').replace('/user_1', `/${handle}`).replace('/status/1', `/status/${id}`));
  });
  container.querySelectorAll('span').forEach((span) => {
    if (span.textContent === '@user_1') span.textContent = `@${handle}`;
  });
}

/** <main> 밖(대화상자)에 트윗 하나를 더 둔다 — 재판정이 <main>만 훑으면 놓친다 (#142 리뷰 r3 S3-1) */
function addDialogTweet(handle: string): void {
  const holder = document.createElement('div');
  holder.innerHTML = readFileSync(resolve(process.cwd(), 'tests/fixtures/x-dom/xweb-quote-tweet.html'), 'utf8');
  const copy = holder.querySelector<HTMLElement>('[data-href="/user_1/status/1"]');
  if (!copy) throw new Error('fixture has no tweet container');
  retarget(copy, handle, 3);
  const dialog = document.createElement('div');
  dialog.setAttribute('role', 'dialog');
  dialog.append(copy);
  document.body.append(dialog);
}

function tweetOf(handle: string): HTMLElement {
  const article = document.querySelector<HTMLElement>(`[data-href^="/${handle}/status/"] > article`);
  if (!article) throw new Error(`no tweet article for ${handle}`);
  return article;
}

function isHidden(handle: string): boolean {
  return tweetOf(handle).hasAttribute(HIDDEN_TWEET_ATTR);
}

function configure(overrides: Partial<Settings> = {}): void {
  setSettings({ ...DEFAULT_SETTINGS, ...overrides });
}

function useApp(script: string | null): void {
  document.head.innerHTML = script ? `<script src="${script}"></script>` : '';
}

function post(data: unknown): void {
  window.dispatchEvent(new MessageEvent('message', { source: window, origin: window.location.origin, data }));
}

/** 키워드 필터가 켜져 있으면 파딱이라도 프로필이 규칙에 맞아야 숨긴다 — 자기소개에 규칙 키워드를 넣는다 */
function sendProfiles(handles: string[]): void {
  post({ type: MESSAGE_TYPES.PROFILE_DATA, profiles: handles.map((handle) => ({ handle, displayName: handle, bio: `${SPAM_KEYWORD} 홍보` })) });
}

function sendFollows(handles: string[], source: 'api-timeline' | 'api-not-following' | 'inline' = 'api-timeline', account = ACCOUNT): void {
  post({ type: MESSAGE_TYPES.FOLLOW_DATA, handles, account, source });
}

/** 다음 프레임(reprocessExistingTweets의 rAF)까지 시간을 흘린다 */
function nextFrame(): void {
  vi.advanceTimersByTime(50);
}

function processAll(): void {
  for (const handle of [FOLLOWED, STRANGER]) processTweet(tweetOf(handle));
}

describe('xweb 첫 방문 작성자 단위 숨김 유예 (#142 리뷰 r3)', () => {
  beforeAll(() => {
    // 같은 리스너가 시험마다 쌓이지 않게 한 번만 붙인다
    listenForMessages({
      getCurrentSettings: () => DEFAULT_SETTINGS,
      setFollowSet,
      getFollowSet,
    });
  });

  beforeEach(() => {
    vi.useFakeTimers();
    vi.mocked(recordHide).mockClear();
    vi.mocked(unrecordHide).mockClear();
    history.replaceState({}, '', '/home');
    resetFollowGrace();
    configure();
    setActiveFilterRules([{ type: 'keyword', value: SPAM_KEYWORD }]);
    setFollowSet(new Set());
    setWhitelistSet(new Set());
    setCurrentUserHandle(ACCOUNT);
    getExpandedSet().clear();
    useApp(XWEB_SCRIPT);
    loadFeed();
  });

  afterEach(() => {
    vi.runAllTimers();
    resetFollowGrace();
    vi.useRealTimers();
  });

  it('유예 중에는 프로필(키워드 필터 켜짐)이 먼저 와도 파딱을 숨기지 않고 숨김 통계도 세지 않는다', () => {
    configure({ keywordFilterEnabled: true });

    sendProfiles([FOLLOWED, STRANGER]);
    nextFrame();

    expect(isHidden(FOLLOWED)).toBe(false);
    expect(isHidden(STRANGER)).toBe(false);
    expect(recordHide).not.toHaveBeenCalled();
  });

  it('다른 작성자의 팔로우 정보가 먼저 와도 아직 모르는 작성자의 글은 숨기지 않고 통계도 세지 않는다. 팔로우로 오면 그대로 보이고, 팔로우 안 함으로 오면 그때 숨긴다', () => {
    processAll();

    sendFollows([OTHER_AUTHOR]);
    nextFrame();
    expect(isHidden(FOLLOWED)).toBe(false);
    expect(isHidden(STRANGER)).toBe(false);
    expect(recordHide).not.toHaveBeenCalled();

    sendFollows([FOLLOWED]);
    nextFrame();
    expect(isHidden(FOLLOWED)).toBe(false);
    expect(isHidden(STRANGER)).toBe(false);
    expect(recordHide).not.toHaveBeenCalled();

    sendFollows([STRANGER], 'api-not-following');
    nextFrame();
    expect(isHidden(FOLLOWED)).toBe(false);
    expect(isHidden(STRANGER)).toBe(true);
    expect(recordHide).toHaveBeenCalledTimes(1);
    expect(vi.mocked(recordHide).mock.calls[0]?.[0]).toBe(tweetOf(STRANGER));
  });

  it('키워드 필터가 켜져 있어도 팔로우 정보가 오면 팔로우한 파딱은 보이고 팔로우 안 함으로 확인된 파딱만 숨긴다', () => {
    configure({ keywordFilterEnabled: true });
    sendProfiles([FOLLOWED, STRANGER]);

    sendFollows([FOLLOWED]);
    sendFollows([STRANGER], 'api-not-following');
    nextFrame();

    expect(isHidden(FOLLOWED)).toBe(false);
    expect(isHidden(STRANGER)).toBe(true);
    expect(recordHide).toHaveBeenCalledTimes(1);
    expect(vi.mocked(recordHide).mock.calls[0]?.[0]).toBe(tweetOf(STRANGER));
  });

  it('팔로우 안 함으로 확인된 작성자만 바로 숨기고, 아직 모르는 작성자는 계속 기다린다', () => {
    processAll();

    sendFollows([STRANGER], 'api-not-following');
    nextFrame();

    expect(isHidden(STRANGER)).toBe(true);
    expect(isHidden(FOLLOWED)).toBe(false);
  });

  it('팔로우 정보 없이 2초가 지나면 숨긴다 (팔로우가 0건인 계정)', () => {
    processAll();
    expect(isHidden(STRANGER)).toBe(false);

    vi.advanceTimersByTime(TIMINGS.FIRST_VISIT_FOLLOW_GRACE - 1);
    expect(isHidden(STRANGER)).toBe(false);

    vi.advanceTimersByTime(1);
    nextFrame();

    expect(isHidden(FOLLOWED)).toBe(true);
    expect(isHidden(STRANGER)).toBe(true);
    expect(recordHide).toHaveBeenCalledTimes(2);
  });

  it('다른 작성자의 정보만 와 있어도 시한이 지나면 아직 모르는 작성자를 숨긴다', () => {
    processAll();
    sendFollows([OTHER_AUTHOR]);

    vi.advanceTimersByTime(TIMINGS.FIRST_VISIT_FOLLOW_GRACE);
    nextFrame();

    expect(isHidden(FOLLOWED)).toBe(true);
    expect(isHidden(STRANGER)).toBe(true);
  });

  it('S3-1: <main> 밖(대화상자)에서 건너뛴 트윗도 시한이 지나면 다시 판정한다', () => {
    addDialogTweet(DIALOG_AUTHOR);
    processTweet(tweetOf(DIALOG_AUTHOR));
    expect(isHidden(DIALOG_AUTHOR)).toBe(false);

    vi.advanceTimersByTime(TIMINGS.FIRST_VISIT_FOLLOW_GRACE);
    nextFrame();

    expect(isHidden(DIALOG_AUTHOR)).toBe(true);
  });

  it('S3-1: <main> 밖 트윗도 그 작성자의 팔로우 여부가 알려지면 그때 다시 판정한다', () => {
    addDialogTweet(DIALOG_AUTHOR);
    processTweet(tweetOf(DIALOG_AUTHOR));

    sendFollows([DIALOG_AUTHOR], 'api-not-following');
    nextFrame();

    expect(isHidden(DIALOG_AUTHOR)).toBe(true);
    expect(recordHide).toHaveBeenCalledTimes(1);
  });

  it('S4-3: 시한에 숨긴 <main> 밖 트윗도 그 작성자가 팔로우로 늦게 오면 복원된다 (팔로우 변경 재판정이 문서 전체의 숨긴 트윗을 포함한다)', () => {
    addDialogTweet(DIALOG_AUTHOR);
    processTweet(tweetOf(DIALOG_AUTHOR));
    vi.advanceTimersByTime(TIMINGS.FIRST_VISIT_FOLLOW_GRACE);
    nextFrame();
    expect(isHidden(DIALOG_AUTHOR)).toBe(true);

    sendFollows([DIALOG_AUTHOR]);
    nextFrame();

    expect(isHidden(DIALOG_AUTHOR)).toBe(false);
  });

  it('S4-3: 팔로우와 무관한 작성자의 <main> 밖 숨긴 트윗은 그대로 둔다', () => {
    addDialogTweet(DIALOG_AUTHOR);
    processTweet(tweetOf(DIALOG_AUTHOR));
    vi.advanceTimersByTime(TIMINGS.FIRST_VISIT_FOLLOW_GRACE);
    nextFrame();

    sendFollows([OTHER_AUTHOR]);
    nextFrame();

    expect(isHidden(DIALOG_AUTHOR)).toBe(true);
  });

  it('S1-1: 팔로우 응답이 시한 뒤에 와서 복원된 트윗은 숨김 통계에서 뺀다', () => {
    processAll();
    vi.advanceTimersByTime(TIMINGS.FIRST_VISIT_FOLLOW_GRACE);
    nextFrame();
    expect(isHidden(FOLLOWED)).toBe(true);
    expect(recordHide).toHaveBeenCalledTimes(2);

    sendFollows([FOLLOWED]);
    nextFrame();

    expect(isHidden(FOLLOWED)).toBe(false);
    expect(unrecordHide).toHaveBeenCalledTimes(1);
    expect(vi.mocked(unrecordHide).mock.calls[0]?.[0]).toBe(tweetOf(FOLLOWED));
  });

  it('유예가 끝난 뒤 새로 들어온 트윗은 바로 판정한다', () => {
    processAll();
    vi.advanceTimersByTime(TIMINGS.FIRST_VISIT_FOLLOW_GRACE);
    nextFrame();
    vi.mocked(recordHide).mockClear();

    processTweet(tweetOf(STRANGER));

    expect(isHidden(STRANGER)).toBe(true);
  });

  it('기존 앱(rweb) 문서는 팔로우 캐시가 없어도 바로 숨긴다 (지금 동작 그대로)', () => {
    useApp(RWEB_SCRIPT);

    processAll();

    expect(isHidden(STRANGER)).toBe(true);
    expect(vi.getTimerCount()).toBe(0);
  });

  it('팔로우 캐시가 있는 xweb 계정은 바로 숨기고 팔로우한 글은 보인다', () => {
    setFollowSet(new Set([FOLLOWED]));

    processAll();

    expect(isHidden(FOLLOWED)).toBe(false);
    expect(isHidden(STRANGER)).toBe(true);
  });

  it('다른 계정(본인이 아닌 account)의 팔로우 데이터는 작성자의 팔로우 여부로 받지 않는다', () => {
    processAll();

    sendFollows([FOLLOWED], 'api-timeline', 'other_account');
    sendFollows([STRANGER], 'api-not-following', 'other_account');
    nextFrame();

    expect(isHidden(FOLLOWED)).toBe(false);
    expect(isHidden(STRANGER)).toBe(false);
  });
});
