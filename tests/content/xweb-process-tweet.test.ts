// #142: xweb 실측 픽스처(tests/fixtures/x-dom/xweb-quote-tweet.html)를 실제 판정 경로(processTweet)에 넣어
// 파딱 숨김과 팔로우·화이트리스트·본인·인용 예외가 기존 앱과 같이 동작하는지 본다.
// 숨김 상태는 실제 content-filter가 DOM에 남기는 속성으로 확인한다.
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { DEFAULT_SETTINGS, TWEET_ARTICLE_SELECTOR } from '../../src/shared/constants';

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

import { setSettings, setFollowSet, setWhitelistSet, setCurrentUserHandle, getExpandedSet } from '../../src/content/state';
import { processTweet, restoreHiddenTweets } from '../../src/content/tweet-orchestrator';
import { reprocessTweetsByHandles } from '../../src/content/message-handler';
import { findAuthorBadge } from '../../src/content/tweet-processing';
import type { Settings } from '../../src/shared/types';

const HIDDEN_TWEET_ATTR = 'data-bbr-original';
const HIDE_REASON_ATTR = 'data-bbr-reason';
const EMBEDDED_FRAME = '[data-slot="embedded-tweet-frame"]';

function loadFixture(): void {
  document.body.innerHTML = readFileSync(resolve(process.cwd(), 'tests/fixtures/x-dom/xweb-quote-tweet.html'), 'utf8');
}

function tweet(): HTMLElement {
  const article = document.querySelector<HTMLElement>(TWEET_ARTICLE_SELECTOR);
  if (!article) throw new Error('fixture has no xweb tweet article');
  return article;
}

/** 인용 프레임의 작성자를 다른 계정으로 바꾼다 (실측 픽스처는 작성자와 인용 작성자가 같은 자리표시자다) */
function retargetQuote(handle: string): void {
  const frame = document.querySelector(EMBEDDED_FRAME);
  frame?.querySelectorAll('a[href="/user_1"]').forEach((link) => link.setAttribute('href', `/${handle}`));
  frame?.querySelectorAll('span').forEach((span) => {
    if (span.textContent === '@user_1') span.textContent = `@${handle}`;
  });
}

function removeAuthorBadge(): void {
  findAuthorBadge(tweet())?.closest('svg')?.remove();
}

function configure(overrides: Partial<Settings> = {}): void {
  setSettings({ ...DEFAULT_SETTINGS, ...overrides });
}

describe('processTweet — xweb 실측 픽스처 (#142)', () => {
  beforeEach(() => {
    history.replaceState({}, '', '/home');
    configure();
    setFollowSet(new Set());
    setWhitelistSet(new Set());
    setCurrentUserHandle('me_account');
    getExpandedSet().clear();
    loadFixture();
  });

  it('팔로우하지 않은 파딱의 트윗을 숨긴다', () => {
    processTweet(tweet());

    expect(tweet().hasAttribute(HIDDEN_TWEET_ATTR)).toBe(true);
    expect(tweet().getAttribute(HIDE_REASON_ATTR)).toBe('fadak');
  });

  it('팔로우한 파딱의 트윗은 숨기지 않는다', () => {
    setFollowSet(new Set(['user_1']));

    processTweet(tweet());

    expect(tweet().hasAttribute(HIDDEN_TWEET_ATTR)).toBe(false);
  });

  it('화이트리스트에 있는 파딱의 트윗은 숨기지 않는다', () => {
    setWhitelistSet(new Set(['@user_1']));

    processTweet(tweet());

    expect(tweet().hasAttribute(HIDDEN_TWEET_ATTR)).toBe(false);
  });

  it('본인 계정의 트윗은 숨기지 않는다', () => {
    setCurrentUserHandle('USER_1');

    processTweet(tweet());

    expect(tweet().hasAttribute(HIDDEN_TWEET_ATTR)).toBe(false);
  });

  it('파딱이 아닌 작성자가 파딱을 인용해도 작성자 배지로 오인해 숨기지 않는다 (인용 설정 꺼짐)', () => {
    removeAuthorBadge();
    retargetQuote('quoted_two');

    processTweet(tweet());

    expect(tweet().hasAttribute(HIDDEN_TWEET_ATTR)).toBe(false);
  });

  it('파딱이 아닌 작성자가 파딱을 인용하고 인용 숨김이 트윗 전체이면 quote-entire로 숨긴다', () => {
    removeAuthorBadge();
    retargetQuote('quoted_two');
    configure({ quoteMode: 'entire' });

    processTweet(tweet());

    expect(tweet().getAttribute(HIDE_REASON_ATTR)).toBe('quote-entire');
  });

  it('인용된 파딱을 팔로우하면 트윗 전체 숨김 설정이어도 숨기지 않는다', () => {
    removeAuthorBadge();
    retargetQuote('quoted_two');
    configure({ quoteMode: 'entire' });
    setFollowSet(new Set(['quoted_two']));

    processTweet(tweet());

    expect(tweet().hasAttribute(HIDDEN_TWEET_ATTR)).toBe(false);
  });

  it('인용 카드만 접는 설정이면 프레임 안을 접고 트윗은 남긴다', () => {
    removeAuthorBadge();
    retargetQuote('quoted_two');
    configure({ quoteMode: 'quote-only' });

    processTweet(tweet());

    expect(tweet().hasAttribute(HIDDEN_TWEET_ATTR)).toBe(false);
    expect(document.querySelector(EMBEDDED_FRAME)?.hasAttribute('data-bbr-hidden-quote')).toBe(true);
  });

  // 합성: 인용 프레임 안에 또 프레임이 중첩된 모양. 바깥 인용의 작성자는 배지가 없고 안쪽 프레임의 작성자만 파딱이다 (#142 리뷰 r1 S1-4)
  function nestFrameIntoQuote(): void {
    const frame = document.querySelector<HTMLElement>(EMBEDDED_FRAME);
    if (!frame) throw new Error('fixture has no embedded tweet frame');
    const nested = frame.cloneNode(true) as HTMLElement;
    nested.querySelectorAll('a[href="/user_1"]').forEach((link) => link.setAttribute('href', '/nested_two'));
    frame.querySelector('article')?.appendChild(nested);
    // 바깥 인용 작성자의 머리글 배지만 지운다. 안쪽 프레임의 파딱 배지는 남는다
    frame.querySelector(':scope > article .x-middot-group svg')?.remove();
  }

  it('인용 작성자의 머리글에 배지가 없으면 안쪽 중첩 프레임의 파딱 배지를 인용 작성자 것으로 보지 않는다', () => {
    removeAuthorBadge();
    retargetQuote('quoted_two');
    nestFrameIntoQuote();
    configure({ quoteMode: 'entire' });

    processTweet(tweet());

    expect(tweet().hasAttribute(HIDDEN_TWEET_ATTR)).toBe(false);
  });

  it('인용 작성자의 머리글 배지가 파딱이면 중첩 프레임이 있어도 인용 작성자를 파딱으로 본다', () => {
    removeAuthorBadge();
    retargetQuote('quoted_two');
    configure({ quoteMode: 'entire' });
    const nestedBefore = document.querySelector(EMBEDDED_FRAME)?.cloneNode(true) as HTMLElement;
    document.querySelector(`${EMBEDDED_FRAME} article`)?.appendChild(nestedBefore);

    processTweet(tweet());

    expect(tweet().getAttribute(HIDE_REASON_ATTR)).toBe('quote-entire');
  });

  it('작성자 배지가 파딱이 아닌 심볼(business)이면 숨기지 않는다', () => {
    findAuthorBadge(tweet())?.setAttribute('href', '#icon-verified-business-color');

    processTweet(tweet());

    expect(tweet().hasAttribute(HIDDEN_TWEET_ATTR)).toBe(false);
  });

  it('숨긴 뒤 팔로우가 들어오면 같은 판정 경로로 다시 판정해 복원한다 (CNT-6)', () => {
    processTweet(tweet());
    expect(tweet().hasAttribute(HIDDEN_TWEET_ATTR)).toBe(true);

    setFollowSet(new Set(['user_1']));
    reprocessTweetsByHandles(new Set(['user_1']));

    expect(tweet().hasAttribute(HIDDEN_TWEET_ATTR)).toBe(false);
  });

  it('restoreHiddenTweets는 숨겨진 xweb 트윗을 되돌린다', () => {
    processTweet(tweet());
    expect(tweet().hasAttribute(HIDDEN_TWEET_ATTR)).toBe(true);

    restoreHiddenTweets();

    expect(tweet().hasAttribute(HIDDEN_TWEET_ATTR)).toBe(false);
    expect(tweet().style.visibility).toBe('');
  });
});
