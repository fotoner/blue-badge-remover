// src/content/follow-grace.ts
// xweb 첫 방문 숨김 유예의 상태와 타이머 (#142). 미룰지 가르는 판정은 tweet-classifier의 shouldDeferHiding이 한다 (CNT-1).
// 팔로우 캐시가 없는 xweb 계정은 작성자의 팔로우 여부를 API 응답으로 알기 전에 파딱을 숨기면 팔로우한 사람의 글이 잠깐 숨겨졌다 복원된다.
// 유예는 작성자 단위다. 다른 작성자의 팔로우 정보가 먼저 와도 아직 모르는 작성자는 그 정보가 오거나
// TIMINGS.FIRST_VISIT_FOLLOW_GRACE(첫 유예 시점부터)가 지날 때까지 기다리고, 건너뛴 트윗은 그때 다시 판정한다.
import { TIMINGS } from '@shared/constants';
import { isXwebDocument } from './page-utils';
import { getFollowSet, isHandleFollowed } from './state';
import { shouldDeferHiding } from './tweet-classifier';

// 이 탭이 API 응답으로 팔로우 여부를 알게 된 핸들(소문자). 팔로우(true)와 팔로우 안 함(false)을 모두 담는다
const knownHandles = new Set<string>();
// 위 핸들 중 이 탭이 응답으로 받아 팔로우 집합에 새로 넣은 것. 저장된 캐시와 구별하는 데 쓴다
const tabFollowedHandles = new Set<string>();
// 유예로 건너뛴 트윗과, 그 트윗이 팔로우 여부를 기다리는 핸들(소문자). 시한이 지나거나 계정이 바뀌면 비운다
const deferredTweets = new Map<HTMLElement, string[]>();
let graceElapsed = false;
// 유예 시간을 재는 타이머. 건너뛴 트윗이 처음 생긴 때 시작한다
let graceTimer: ReturnType<typeof setTimeout> | null = null;

function clearGraceTimer(): void {
  if (graceTimer === null) return;
  clearTimeout(graceTimer);
  graceTimer = null;
}

/** 팔로우 집합에 이 탭이 받아 넣은 것이 아닌 핸들, 곧 저장된 캐시가 남아 있는지. 캐시가 있으면 첫 핸들에서 바로 멈춘다 */
function hasStoredFollows(): boolean {
  for (const handle of getFollowSet()) {
    if (!tabFollowedHandles.has(handle)) return true;
  }
  return false;
}

/** 문서에서 떨어진 트윗은 다시 판정할 이유가 없다(X가 화면 밖 트윗을 DOM에서 치운다). 남은 것만 꺼낸다 */
function takeConnectedTweets(match: (awaited: string[]) => boolean): HTMLElement[] {
  const taken: HTMLElement[] = [];
  for (const [tweet, awaited] of deferredTweets) {
    if (!tweet.isConnected) {
      deferredTweets.delete(tweet);
    } else if (match(awaited)) {
      deferredTweets.delete(tweet);
      taken.push(tweet);
    }
  }
  return taken;
}

function startGraceTimer(onExpire: (tweets: HTMLElement[]) => void): void {
  if (graceTimer !== null) return;
  graceTimer = setTimeout(() => {
    graceTimer = null;
    graceElapsed = true;
    onExpire(takeConnectedTweets(() => true));
  }, TIMINGS.FIRST_VISIT_FOLLOW_GRACE);
}

/**
 * 이 트윗의 숨김 판정을 미뤄야 하면 true. handles는 판정에 팔로우 여부가 필요한 사람들이다(작성자, 리트윗이면 리트위터도).
 * 미루는 트윗은 기억해 두었다가, 그 핸들의 팔로우 여부가 알려지면 markFollowKnown이 돌려주고
 * 시한이 다 되면 onExpire로 남은 트윗 전부를 넘긴다. 다시 판정은 호출자가 한다.
 */
export function deferHidingForFollows(
  tweetEl: HTMLElement,
  handles: ReadonlyArray<string | null>,
  onExpire: (tweets: HTMLElement[]) => void,
): boolean {
  // 문서 판별은 스크립트 목록을 훑으므로 다른 조건이 이미 미루지 않는 쪽이면 보지 않는다 — 트윗마다 부르는 길이다
  if (graceElapsed) return false;
  const hasFollowCache = hasStoredFollows();
  if (hasFollowCache) return false;
  const people = handles.filter((handle): handle is string => handle !== null).map((handle) => handle.toLowerCase());
  const subjects = people.map((handle) => ({ inFollow: isHandleFollowed(handle), known: knownHandles.has(handle) }));
  const defer = shouldDeferHiding({ isXweb: isXwebDocument(), hasFollowCache, graceElapsed, subjects });
  if (!defer) return false;
  deferredTweets.set(tweetEl, people.filter((handle, index) => !subjects[index]?.inFollow && !subjects[index]?.known));
  startGraceTimer(onExpire);
  return true;
}

/**
 * 현재 계정의 API 응답으로 핸들들의 팔로우 여부(followed)를 알게 됐을 때 부른다. 그 핸들을 기다리던 트윗을 돌려주고 기다림에서 뺀다 —
 * 호출자가 그 트윗만 다시 판정한다. 리트윗이 다른 핸들을 더 기다리면 다시 판정할 때 한 번 더 미뤄진다.
 * addedToFollowSet은 followed일 때 호출자가 이번에 팔로우 집합에 새로 넣은 핸들이다. 이미 캐시에 있던 핸들은 넣지 않는다.
 * 유예가 이미 끝났으면 기록할 것도 돌려줄 것도 없다.
 */
export function markFollowKnown(
  handles: readonly string[],
  followed: boolean,
  addedToFollowSet: readonly string[] = [],
): HTMLElement[] {
  if (graceElapsed) return [];
  const lowered = new Set(handles.map((handle) => handle.toLowerCase()));
  for (const handle of lowered) knownHandles.add(handle);
  if (followed) for (const handle of addedToFollowSet) tabFollowedHandles.add(handle.toLowerCase());
  return takeConnectedTweets((awaited) => awaited.some((handle) => lowered.has(handle)));
}

/** 계정이 바뀌었을 때 새 계정의 첫 방문으로 다시 센다 */
export function resetFollowGrace(): void {
  knownHandles.clear();
  tabFollowedHandles.clear();
  deferredTweets.clear();
  graceElapsed = false;
  clearGraceTimer();
}
