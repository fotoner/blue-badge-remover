// NOTE: These constants are intentionally duplicated from @shared/constants.
// This file is injected directly into the page context via a <script> tag,
// where extension module imports (chrome.runtime, @shared paths) are unavailable.
// To keep them in sync, tests/injected/fetch-interceptor-constants.test.ts
// asserts that these values match the shared constants.
import { findUserObjects, findFollowedHandles, extractFollowingFromUsers, dedupeFollowHandles, extractProfileEntries, type ProfileEntry } from './data-extractors';
import { FiberFollowObserver } from './fiber-follow-observer';
import { FollowBridge, type FollowSource } from './follow-bridge';
import { splitProfileBatches } from './profile-batches';
const MESSAGE_TYPES = {
  FOLLOW_DATA: 'BBR_FOLLOW_DATA',
  PROFILE_DATA: 'BBR_PROFILE_DATA',
  CONTENT_READY: 'BBR_CONTENT_READY',
} as const;

const X_GRAPHQL_ENDPOINTS = [
  '/i/api/graphql/',
  '/i/api/2/',
] as const;

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
  const isGraphQL = X_GRAPHQL_ENDPOINTS.some((ep) => url.includes(ep));
  if (isGraphQL) {
    try {
      const cloned = response.clone();
      const data = await cloned.json();
      const endpoint = url.split('/').slice(-2).join('/');
      extractUserData(data, endpoint, accountAtRequest);
      // extractViewerUserId 제거: viewer ID 메시지를 수신하는 리스너 없음.
      // 계정 감지는 content script의 detectAndHandleAccountSwitch()에서 DOM 기반으로 처리.

      const urlLower = url.toLowerCase();
      if (urlLower.includes('follow')) {
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
  const isGraphQL = X_GRAPHQL_ENDPOINTS.some((ep) => url.includes(ep));
  if (isGraphQL) {
    xhr.addEventListener('load', function () {
      try {
        const data = JSON.parse(xhr.responseText) as unknown;
        const endpoint = url.split('/').slice(-2).join('/');
        extractUserData(data, endpoint, accountAtRequest);
        // extractViewerUserId 제거: viewer ID 메시지를 수신하는 리스너 없음.
      // 계정 감지는 content script의 detectAndHandleAccountSwitch()에서 DOM 기반으로 처리.
        if (url.toLowerCase().includes('follow')) {
          extractFollowData(data, accountAtRequest);
        }
      } catch {
        // Parse failure — fallback mode will handle
      }
    });
  }
  return origXhrSend.call(this, body);
};

function extractUserData(data: unknown, endpointHint?: string, account?: string | null): void {
  const users: Array<Record<string, unknown>> = [];
  findUserObjects(data, users);
  if (users.length === 0) return;

  postProfileData(users, endpointHint);
  postTimelineFollowData(users, endpointHint, account);
}

function postProfileData(users: Array<Record<string, unknown>>, endpointHint?: string): void {
  // Derive profiles from already-collected users — avoids a second full traversal
  const profiles = extractProfileEntries(users);

  if (profiles.length > 0) {
    for (const p of profiles) {
      if (!cachedProfiles.has(p.userId)) {
        if (cachedProfiles.size >= MAX_CACHED_PROFILES) {
          const firstKey = cachedProfiles.keys().next().value;
          if (firstKey !== undefined) cachedProfiles.delete(firstKey);
        }
        cachedProfiles.set(p.userId, p);
      }
    }
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
  if (handles.length === 0) return;
  fiberFollowObserver.markReported(handles);
  followBridge.send(handles, 'api-timeline', account);
}

// extractViewerUserId / findViewerId 제거됨 — 수신 리스너 없는 죽은 코드

function extractFollowData(data: unknown, account?: string | null): void {
  const handles: string[] = [];
  findFollowedHandles(data, handles);
  const uniqueHandles = [...new Set(handles.map((handle) => handle.toLowerCase()))];
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
