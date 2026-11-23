// NOTE: These constants are intentionally duplicated from @shared/constants.
// This file is injected directly into the page context via a <script> tag,
// where extension module imports (chrome.runtime, @shared paths) are unavailable.
// To keep them in sync, tests/injected/fetch-interceptor-constants.test.ts
// asserts that these values match the shared constants.
import { findUserObjects, extractFollowingFromUsers, extractNotFollowingFromUsers, extractFollowingListHandles, dedupeFollowHandles, extractProfileEntries, isFollowingEndpoint, isGraphqlRequestUrl, mergeProfileEntry, readInitialData, readViewerHandle, type ProfileEntry } from './data-extractors';
import { FiberFollowObserver } from './fiber-follow-observer';
import { FollowBridge, type FollowSource } from './follow-bridge';
import { splitProfileBatches } from './profile-batches';
const MESSAGE_TYPES = {
  FOLLOW_DATA: 'BBR_FOLLOW_DATA',
  PROFILE_DATA: 'BBR_PROFILE_DATA',
  CONTENT_READY: 'BBR_CONTENT_READY',
  VIEWER_HANDLE: 'BBR_VIEWER_HANDLE',
  VIEWER_HANDLE_REQUEST: 'BBR_VIEWER_HANDLE_REQUEST',
} as const;

let bbrDebugMode = false;

// Cache profiles from API responses so they can be replayed after content script is ready
const MAX_CACHED_PROFILES = 10000;
const cachedProfiles = new Map<string, ProfileEntry>();
const followBridge = new FollowBridge((handles, source, account) => {
  const payload: { type: string; handles: string[]; account: string; source?: FollowSource } = {
    type: MESSAGE_TYPES.FOLLOW_DATA,
    handles,
    account,
  };
  if (source) payload.source = source;
  window.postMessage(payload, window.location.origin);
});
const fiberFollowObserver = new FiberFollowObserver((handles) => {
  followBridge.send(handles, 'inline');
});

// xweb은 화면에 계정 전환 링크가 없어 첫 화면 데이터의 viewerScreenName이 본인 계정의 유일한 출처다 (#142).
// document_start에는 아직 없을 수 있어 DOM이 준비된 뒤에도 읽고, 기존 앱처럼 데이터가 없으면 아무것도 보내지 않는다
function postViewerHandle(): void {
  const handle = readViewerHandle(window);
  if (handle) window.postMessage({ type: MESSAGE_TYPES.VIEWER_HANDLE, handle }, window.location.origin);
}

// 초기 데이터를 읽기 전에 응답으로 받은 사용자 ID. 초기 데이터는 DOM이 준비될 때 읽는 스냅샷이라 그 응답보다 오래된 값이므로,
// 이 사용자들은 초기 데이터에서 건너뛴다 (#142 리뷰 r5 S5-1). 초기 데이터를 읽은 뒤에는 쓸 일이 없어 더 모으지 않는다
let initialDataRead = false;
const usersFromResponsesBeforeInitialData = new Set<string>();

// xweb 첫 화면 데이터에 들어 있는 사용자도 응답과 같은 경로로 읽는다 (#142 리뷰 r3 S1-1).
// 첫 타임라인 응답이 오기 전에 화면에 그려진 작성자의 팔로우 여부를 content script가 알 수 있게 하기 위해서다.
// 계정이 확정되기 전이면 follow-bridge 대기열에 쌓인다. 사용자 객체가 없거나 읽다 실패하면(순환 참조 등) 아무것도 보내지 않는다
function extractInitialUsers(): void {
  initialDataRead = true;
  const initialData = readInitialData(window);
  if (!initialData) return;
  try {
    extractUserData(initialData, 'initial-data', followBridge.getAccount(), usersFromResponsesBeforeInitialData);
  } catch {
    // 실측 없는 데이터라 모양을 믿지 않는다 — 시작을 깨뜨리지 않는다
  } finally {
    usersFromResponsesBeforeInitialData.clear();
  }
}

function onDomReady(): void {
  postViewerHandle();
  extractInitialUsers();
}

function postProfiles(profiles: ProfileEntry[]): void {
  for (const batch of splitProfileBatches(profiles)) {
    window.postMessage({ type: MESSAGE_TYPES.PROFILE_DATA, profiles: batch }, window.location.origin);
  }
}

window.addEventListener('message', (event) => {
  if (event.source !== window) return;
  const data = event.data as Record<string, unknown>;
  if (data?.type === 'BBR_SET_DEBUG') {
    bbrDebugMode = !!(data.enabled);
  }
  // Content script signals it's ready — replay cached profiles so none are missed
  if (data?.type === MESSAGE_TYPES.CONTENT_READY && cachedProfiles.size > 0) {
    postProfiles(Array.from(cachedProfiles.values()));
  }
  // 본인 계정이 아직 없는 content script도 준비 신호를 보낸다 — 먼저 보낸 핸들 메시지를 놓쳤을 수 있어 다시 보낸다 (#142)
  if (data?.type === MESSAGE_TYPES.CONTENT_READY) postViewerHandle();
  // content script가 시작하자마자 핸들만 다시 달라고 한다. 프로필은 다시 보내지 않는다(받을 리스너가 아직 없다) (#142)
  if (data?.type === MESSAGE_TYPES.VIEWER_HANDLE_REQUEST) postViewerHandle();
  if (data?.type === MESSAGE_TYPES.CONTENT_READY && typeof data['account'] === 'string') {
    followBridge.markReady(data['account']);
    fiberFollowObserver.markContentReady();
  }
});

const originalFetch = window.fetch;

window.fetch = async function patchedFetch(
  input: RequestInfo | URL,
  init?: RequestInit,
): Promise<Response> {
  const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
  const accountAtRequest = followBridge.getAccount();

  const response = await originalFetch.call(window, input, init);

  // Intercept GraphQL responses
  const isGraphQL = isGraphqlRequestUrl(url);
  if (isGraphQL) {
    try {
      const cloned = response.clone();
      const data = await cloned.json();
      const endpoint = url.split('/').slice(-2).join('/');
      extractUserData(data, endpoint, accountAtRequest);
      // extractViewerUserId 제거: viewer ID 메시지를 수신하는 리스너 없음.
      // 계정 감지는 content script의 detectAndHandleAccountSwitch()에서 DOM 기반으로 처리.

      if (isFollowingEndpoint(url)) {
        extractFollowData(data, accountAtRequest);
      }
    } catch {
      // Parse failure — fallback mode will handle
    }
  }

  return response;
};

// Also intercept XMLHttpRequest — X uses XHR for its API calls, not fetch
const origXhrOpen = XMLHttpRequest.prototype.open;
const origXhrSend = XMLHttpRequest.prototype.send;

XMLHttpRequest.prototype.open = function patchedXhrOpen(
  method: string,
  url: string | URL,
  async?: boolean,
  username?: string | null,
  password?: string | null,
) {
  (this as XMLHttpRequest & { _bbrUrl: string })._bbrUrl =
    typeof url === 'string' ? url : url.toString();
  if (async === undefined) {
    return Reflect.apply(origXhrOpen, this, [method, url]) as void;
  }
  return origXhrOpen.call(this, method, url, async!, username, password);
};

XMLHttpRequest.prototype.send = function patchedXhrSend(body?: Document | XMLHttpRequestBodyInit | null) {
  const xhr = this as XMLHttpRequest & { _bbrUrl?: string };
  const url = xhr._bbrUrl ?? '';
  const accountAtRequest = followBridge.getAccount();
  const isGraphQL = isGraphqlRequestUrl(url);
  if (isGraphQL) {
    xhr.addEventListener('load', function () {
      try {
        const data = JSON.parse(xhr.responseText) as unknown;
        const endpoint = url.split('/').slice(-2).join('/');
        extractUserData(data, endpoint, accountAtRequest);
        // extractViewerUserId 제거: viewer ID 메시지를 수신하는 리스너 없음.
      // 계정 감지는 content script의 detectAndHandleAccountSwitch()에서 DOM 기반으로 처리.
        if (isFollowingEndpoint(url)) {
          extractFollowData(data, accountAtRequest);
        }
      } catch {
        // Parse failure — fallback mode will handle
      }
    });
  }
  return origXhrSend.call(this, body);
};

function extractUserData(
  data: unknown,
  endpointHint?: string,
  account?: string | null,
  skipUserIds?: ReadonlySet<string>,
): void {
  const found: Array<Record<string, unknown>> = [];
  findUserObjects(data, found);
  const users = skipUserIds ? found.filter((user) => !skipUserIds.has(String(user['rest_id']))) : found;
  if (users.length === 0) return;
  if (!initialDataRead) for (const user of users) usersFromResponsesBeforeInitialData.add(String(user['rest_id']));

  postProfileData(users, endpointHint);
  postTimelineFollowData(users, endpointHint, account);
}

// 준비 신호 때 다시 보낼 프로필은 사용자 ID 기준으로 합친다 (#142 리뷰 r4 S4-2).
// 첫 응답(초기 데이터)에 자기소개·팔로워 수가 없고 뒤이은 GraphQL이 주더라도 재전송에 빠지지 않게 하기 위해서다
function cacheProfile(profile: ProfileEntry): void {
  const earlier = cachedProfiles.get(profile.userId);
  if (!earlier && cachedProfiles.size >= MAX_CACHED_PROFILES) {
    const firstKey = cachedProfiles.keys().next().value;
    if (firstKey !== undefined) cachedProfiles.delete(firstKey);
  }
  cachedProfiles.set(profile.userId, mergeProfileEntry(earlier, profile));
}

function postProfileData(users: Array<Record<string, unknown>>, endpointHint?: string): void {
  // Derive profiles from already-collected users — avoids a second full traversal
  const profiles = extractProfileEntries(users);

  if (profiles.length > 0) {
    for (const p of profiles) cacheProfile(p);
    postProfiles(profiles);

    if (bbrDebugMode) {
      const withBio = profiles.filter((p) => p.bio);
      const withoutBio = profiles.filter((p) => !p.bio);
      console.log(
        `[BBR INTERCEPTOR] ${endpointHint ?? 'unknown'}: ${profiles.length} profiles, ${withBio.length} with bio, ${withoutBio.length} without`,
        withBio.length > 0 ? withBio.map((p) => `${p.handle}: "${p.bio.slice(0, 30)}"`) : '(none with bio)',
      );
    }
  }
}

// 타임라인 응답에서 following=true 핸들을 FOLLOW_DATA로 포스트.
// ListLatestTweetsTimeline 등 모든 GraphQL 타임라인이 extractBadgeData를 거치므로 자동 커버.
// 영구 메모 없음(Defect 1 수정) — 동일 핸들이 여러 응답에 걸쳐 반복 포스트될 수 있으며,
// 이는 의도된 self-heal: content 측 followSet diff(message-handler.ts)가 흡수한다.
function postTimelineFollowData(
  users: Array<Record<string, unknown>>,
  endpointHint?: string,
  account?: string | null,
): void {
  const matches = extractFollowingFromUsers(users);
  const handles = dedupeFollowHandles(matches);
  if (bbrDebugMode) {
    const pathCounts: Record<string, number> = {};
    for (const m of matches) pathCounts[m.path] = (pathCounts[m.path] ?? 0) + 1;
    console.log(
      `[BBR FOLLOW-API] ${endpointHint ?? 'unknown'}: users=${users.length} following=${matches.length} deduped=${handles.length}`,
      matches.length > 0 ? pathCounts : '(no following flag found)',
    );
  }
  // 팔로우 안 함으로 확인된 핸들도 보내 오염된 목록을 정리한다 — content 측은 followSet에 있는 것만 지운다
  followBridge.send(extractNotFollowingFromUsers(users), 'api-not-following', account);
  if (handles.length === 0) return;
  fiberFollowObserver.markReported(handles);
  followBridge.send(handles, 'api-timeline', account);
}

// extractViewerUserId / findViewerId 제거됨 — 수신 리스너 없는 죽은 코드

function extractFollowData(data: unknown, account?: string | null): void {
  const uniqueHandles = extractFollowingListHandles(data);
  if (uniqueHandles.length > 0) {
    fiberFollowObserver.markReported(uniqueHandles);
    followBridge.send(uniqueHandles, undefined, account);
  }
}

// findUserObjects and findFollowedHandles extracted to ./data-extractors.ts

function startFiberFollowObserver(): void {
  if (document.body) fiberFollowObserver.start(document.body);
}

if (document.body) {
  startFiberFollowObserver();
} else {
  document.addEventListener('DOMContentLoaded', startFiberFollowObserver, { once: true });
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', onDomReady, { once: true });
} else {
  onDomReady();
}
