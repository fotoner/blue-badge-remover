// #142 리뷰 r3 S1-1·S3-1: xweb 첫 방문 숨김 유예의 상태·타이머. 순수 판정은 tweet-classifier.test.ts가 본다.
// 유예는 작성자 단위다. 팔로우 여부를 아는 핸들(팔로우 true, 팔로우 안 함 false)만 풀리고, 시한(2000ms)이 지나면 전부 풀린다.
// 실제 state·page-utils를 쓰고 시간만 가짜로 바꾼다.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { TIMINGS } from '../../src/shared/constants';

vi.mock('@shared/utils/logger', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

import { getFollowSet, setCurrentUserHandle, setFollowSet } from '../../src/content/state';
import { deferHidingForFollows, markFollowKnown, resetFollowGrace } from '../../src/content/follow-grace';

const XWEB_SCRIPT = 'https://abs.twimg.com/x-web/x-web/entry-client.0123abcd.js';
const RWEB_SCRIPT = 'https://abs.twimg.com/responsive-web/client-web/main.0123abcd.js';

function useApp(script: string): void {
  document.head.innerHTML = `<script src="${script}"></script>`;
}

function tweet(connected = true): HTMLElement {
  const el = document.createElement('article');
  if (connected) document.body.append(el);
  return el;
}

describe('follow-grace — xweb 첫 방문 작성자 단위 숨김 유예', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    resetFollowGrace();
    setFollowSet(new Set());
    setCurrentUserHandle('me_account');
    useApp(XWEB_SCRIPT);
    document.body.innerHTML = '';
  });

  afterEach(() => {
    resetFollowGrace();
    vi.useRealTimers();
    document.head.innerHTML = '';
    document.body.innerHTML = '';
  });

  it('TIMINGS에 첫 방문 팔로우 유예 시간이 2000ms로 있다', () => {
    expect(TIMINGS.FIRST_VISIT_FOLLOW_GRACE).toBe(2000);
  });

  it('xweb 첫 방문에서 팔로우 여부를 모르는 작성자는 미루고, 시한이 지나면 건너뛴 트윗을 넘겨 다시 판정하게 한 뒤 미루지 않는다', () => {
    const onExpire = vi.fn();
    const el = tweet();

    expect(deferHidingForFollows(el, ['stranger'], onExpire)).toBe(true);
    vi.advanceTimersByTime(TIMINGS.FIRST_VISIT_FOLLOW_GRACE - 1);
    expect(deferHidingForFollows(el, ['stranger'], onExpire)).toBe(true);
    expect(onExpire).not.toHaveBeenCalled();

    vi.advanceTimersByTime(1);

    expect(onExpire).toHaveBeenCalledTimes(1);
    expect(onExpire).toHaveBeenCalledWith([el]);
    expect(deferHidingForFollows(el, ['stranger'], onExpire)).toBe(false);
  });

  it('시한은 첫 유예 시점부터 한 번만 센다 (미루는 트윗이 늘어도 늘어나지 않는다)', () => {
    const onExpire = vi.fn();

    deferHidingForFollows(tweet(), ['a'], onExpire);
    vi.advanceTimersByTime(1500);
    deferHidingForFollows(tweet(), ['b'], onExpire);
    vi.advanceTimersByTime(500);

    expect(onExpire).toHaveBeenCalledTimes(1);
  });

  it('다른 작성자의 팔로우 정보가 먼저 와도 아직 모르는 작성자는 계속 미룬다', () => {
    const onExpire = vi.fn();
    expect(deferHidingForFollows(tweet(), ['stranger'], onExpire)).toBe(true);

    // 메시지 처리 쪽이 팔로우 집합에 넣은 뒤 부르는 순서를 그대로 흉내 낸다
    markFollowKnown(['someone_else'], true, ['someone_else']);
    getFollowSet().add('someone_else');

    expect(deferHidingForFollows(tweet(), ['stranger'], onExpire)).toBe(true);
  });

  it('팔로우 여부가 알려진 작성자는 팔로우한 사람이든 아니든 더는 미루지 않는다', () => {
    const onExpire = vi.fn();
    markFollowKnown(['followed_one'], true, ['followed_one']);
    getFollowSet().add('followed_one');
    markFollowKnown(['stranger_two'], false);

    expect(deferHidingForFollows(tweet(), ['followed_one'], onExpire)).toBe(false);
    expect(deferHidingForFollows(tweet(), ['STRANGER_two'], onExpire)).toBe(false);
  });

  it('팔로우 여부가 알려지면 그 작성자를 기다리던 트윗만 돌려주고 나머지는 계속 기다린다', () => {
    const onExpire = vi.fn();
    const waitingForA = tweet();
    const waitingForB = tweet();
    deferHidingForFollows(waitingForA, ['a'], onExpire);
    deferHidingForFollows(waitingForB, ['b'], onExpire);

    expect(markFollowKnown(['A'], false)).toEqual([waitingForA]);

    // 한 번 돌려준 트윗은 다시 돌려주지 않는다
    expect(markFollowKnown(['a'], false)).toEqual([]);
    vi.advanceTimersByTime(TIMINGS.FIRST_VISIT_FOLLOW_GRACE);
    expect(onExpire).toHaveBeenCalledWith([waitingForB]);
  });

  it('리트윗은 작성자와 리트위터를 모두 알 때까지 미룬다', () => {
    const onExpire = vi.fn();
    const retweet = tweet();
    expect(deferHidingForFollows(retweet, ['author', 'retweeter'], onExpire)).toBe(true);

    expect(markFollowKnown(['author'], false)).toEqual([retweet]);
    // 다시 판정할 때 리트위터를 아직 모르면 한 번 더 미룬다
    expect(deferHidingForFollows(retweet, ['author', 'retweeter'], onExpire)).toBe(true);

    expect(markFollowKnown(['retweeter'], false)).toEqual([retweet]);
    expect(deferHidingForFollows(retweet, ['author', 'retweeter'], onExpire)).toBe(false);
  });

  it('리트윗이 아니면(리트위터 핸들 null) 작성자만 본다', () => {
    expect(deferHidingForFollows(tweet(), ['author', null], vi.fn())).toBe(true);
  });

  it('문서에서 떨어진 트윗은 돌려주지도, 시한에 넘기지도 않는다', () => {
    const onExpire = vi.fn();
    const detached = tweet();
    const attached = tweet();
    deferHidingForFollows(detached, ['a'], onExpire);
    deferHidingForFollows(attached, ['a'], onExpire);
    detached.remove();

    expect(markFollowKnown(['a'], false)).toEqual([attached]);

    const later = tweet();
    const laterDetached = tweet();
    deferHidingForFollows(later, ['b'], onExpire);
    deferHidingForFollows(laterDetached, ['b'], onExpire);
    laterDetached.remove();
    vi.advanceTimersByTime(TIMINGS.FIRST_VISIT_FOLLOW_GRACE);
    expect(onExpire).toHaveBeenCalledWith([later]);
  });

  it('저장된 팔로우 캐시가 있는 계정은 미루지 않고 타이머도 만들지 않는다', () => {
    setFollowSet(new Set(['cached_one']));

    expect(deferHidingForFollows(tweet(), ['stranger'], vi.fn())).toBe(false);
    expect(vi.getTimerCount()).toBe(0);
  });

  it('이 탭이 응답으로 받아 팔로우 집합에 넣은 핸들은 저장된 캐시로 세지 않는다', () => {
    markFollowKnown(['other'], true, ['other']);
    getFollowSet().add('other');

    expect(deferHidingForFollows(tweet(), ['stranger'], vi.fn())).toBe(true);
  });

  it('저장된 캐시에 이미 있던 핸들이 응답에 또 와도(새로 넣은 것이 아님) 캐시 있는 계정으로 남는다', () => {
    setFollowSet(new Set(['cached_one']));

    markFollowKnown(['cached_one'], true, []);

    expect(deferHidingForFollows(tweet(), ['stranger'], vi.fn())).toBe(false);
  });

  it('기존 앱(rweb)은 미루지 않고 타이머도 만들지 않는다', () => {
    useApp(RWEB_SCRIPT);

    expect(deferHidingForFollows(tweet(), ['stranger'], vi.fn())).toBe(false);
    expect(vi.getTimerCount()).toBe(0);
  });

  it('시한이 지난 뒤에는 팔로우 정보가 와도 돌려줄 트윗이 없다', () => {
    deferHidingForFollows(tweet(), ['a'], vi.fn());
    vi.advanceTimersByTime(TIMINGS.FIRST_VISIT_FOLLOW_GRACE);

    expect(markFollowKnown(['a'], true, ['a'])).toEqual([]);
  });

  it('계정이 바뀌면(resetFollowGrace) 알던 핸들과 시한을 새 계정 기준으로 처음부터 다시 센다', () => {
    const onExpire = vi.fn();
    markFollowKnown(['known_one'], false);
    deferHidingForFollows(tweet(), ['x'], onExpire);
    vi.advanceTimersByTime(TIMINGS.FIRST_VISIT_FOLLOW_GRACE);
    expect(onExpire).toHaveBeenCalledTimes(1);

    resetFollowGrace();

    expect(deferHidingForFollows(tweet(), ['known_one'], onExpire)).toBe(true);
    vi.advanceTimersByTime(TIMINGS.FIRST_VISIT_FOLLOW_GRACE);
    expect(onExpire).toHaveBeenCalledTimes(2);
  });

  it('리셋하면 돌고 있던 타이머와 건너뛴 트윗도 비운다', () => {
    const onExpire = vi.fn();
    const el = tweet();
    deferHidingForFollows(el, ['a'], onExpire);

    resetFollowGrace();
    vi.advanceTimersByTime(TIMINGS.FIRST_VISIT_FOLLOW_GRACE);

    expect(onExpire).not.toHaveBeenCalled();
    expect(markFollowKnown(['a'], false)).toEqual([]);
  });
});
