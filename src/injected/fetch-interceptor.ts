// NOTE: These constants are intentionally duplicated from @shared/constants.
// This file is injected directly into the page context via a <script> tag,
// where extension module imports (chrome.runtime, @shared paths) are unavailable.
// To keep them in sync, tests/injected/fetch-interceptor-constants.test.ts
// asserts that these values match the shared constants.
const MESSAGE_TYPES = {
  BADGE_DATA: 'BBR_BADGE_DATA',
  USER_ID: 'BBR_USER_ID',
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
const cachedProfiles: ProfileEntry[] = [];

window.addEventListener('message', (event) => {
  if (event.source !== window) return;
  const data = event.data as Record<string, unknown>;
  if (data?.type === 'BBR_SET_DEBUG') {
    bbrDebugMode = !!(data.enabled);
  }
  // Content script signals it's ready — replay cached profiles so none are missed
  if (data?.type === MESSAGE_TYPES.CONTENT_READY && cachedProfiles.length > 0) {
    window.postMessage({ type: MESSAGE_TYPES.PROFILE_DATA, profiles: [...cachedProfiles] }, '*');
  }
});

const originalFetch = window.fetch;

window.fetch = async function patchedFetch(
  input: RequestInfo | URL,
  init?: RequestInit,
): Promise<Response> {
  const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;

  const response = await originalFetch.call(window, input, init);

  // Intercept GraphQL responses
  const isGraphQL = X_GRAPHQL_ENDPOINTS.some((ep) => url.includes(ep));
  if (isGraphQL) {
    try {
      const cloned = response.clone();
      const data = await cloned.json();
      extractBadgeData(data);
      extractViewerUserId(data);
      const endpoint = url.split('/').slice(-2).join('/');
      extractProfileData(data, endpoint);

      const urlLower = url.toLowerCase();
      if (urlLower.includes('follow')) {
        extractFollowData(data);
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
    return origXhrOpen.call(this, method, url);
  }
  return origXhrOpen.call(this, method, url, async, username, password);
};

XMLHttpRequest.prototype.send = function patchedXhrSend(body?: Document | XMLHttpRequestBodyInit | null) {
  const xhr = this as XMLHttpRequest & { _bbrUrl?: string };
  const url = xhr._bbrUrl ?? '';
  const isGraphQL = X_GRAPHQL_ENDPOINTS.some((ep) => url.includes(ep));
  if (isGraphQL) {
    xhr.addEventListener('load', function () {
      try {
        const data = JSON.parse(xhr.responseText) as unknown;
        extractBadgeData(data);
        extractViewerUserId(data);
        const endpoint = url.split('/').slice(-2).join('/');
        extractProfileData(data, endpoint);
        if (url.toLowerCase().includes('follow')) {
          extractFollowData(data);
        }
      } catch {
        // Parse failure — fallback mode will handle
      }
    });
  }
  return origXhrSend.call(this, body);
};

function extractBadgeData(data: unknown): void {
  const users: Array<Record<string, unknown>> = [];
  findUserObjects(data, users);

  if (users.length > 0) {
    window.postMessage({
      type: MESSAGE_TYPES.BADGE_DATA,
      users,
    }, '*');
  }
}

function extractViewerUserId(data: unknown): void {
  const viewerId = findViewerId(data);
  if (viewerId) {
    window.postMessage({ type: MESSAGE_TYPES.USER_ID, userId: viewerId }, '*');
  }
}

function findViewerId(obj: unknown): string | null {
  if (obj === null || typeof obj !== 'object') return null;

  const record = obj as Record<string, unknown>;

  // Common X API patterns for viewer/self identity
  if ('viewer' in record) {
    const viewer = record['viewer'] as Record<string, unknown> | null;
    if (viewer && 'rest_id' in viewer && typeof viewer['rest_id'] === 'string') {
      return viewer['rest_id'];
    }
    // Nested: viewer.userResults.result.rest_id
    const nested = findViewerId(viewer);
    if (nested) return nested;
  }

  if ('viewer_v2' in record) {
    const nested = findViewerId(record['viewer_v2']);
    if (nested) return nested;
  }

  // data.data.viewer or similar top-level wrapper
  for (const key of ['data', 'result', 'user']) {
    if (key in record && typeof record[key] === 'object') {
      const nested = findViewerId(record[key]);
      if (nested) return nested;
    }
  }

  return null;
}

function extractFollowData(data: unknown): void {
  const handles: string[] = [];
  findFollowedHandles(data, handles);
  if (handles.length > 0) {
    window.postMessage({
      type: MESSAGE_TYPES.FOLLOW_DATA,
      handles,
    }, '*');
  }
}

function findFollowedHandles(obj: unknown, result: string[]): void {
  if (obj === null || typeof obj !== 'object') return;
  const record = obj as Record<string, unknown>;

  // X Following API 응답에서 screen_name 추출
  if ('user_results' in record) {
    const userResults = record['user_results'] as Record<string, unknown> | null;
    const userResult = userResults?.['result'] as Record<string, unknown> | undefined;
    if (userResult) {
      // screen_name은 legacy 또는 core에 있음
      const legacy = userResult['legacy'] as Record<string, unknown> | undefined;
      const core = (userResult['core'] as Record<string, unknown> | undefined)?.['user_results'] as Record<string, unknown> | undefined;
      const screenName = legacy?.['screen_name'] ?? core?.['screen_name'];
      if (typeof screenName === 'string') {
        result.push(screenName.toLowerCase());
      }
    }
  }

  for (const value of Object.values(record)) {
    if (Array.isArray(value)) {
      value.forEach((item) => findFollowedHandles(item, result));
    } else if (typeof value === 'object') {
      findFollowedHandles(value, result);
    }
  }
}

function findUserObjects(obj: unknown, result: Array<Record<string, unknown>>): void {
  if (obj === null || typeof obj !== 'object') return;

  const record = obj as Record<string, unknown>;
  if ('rest_id' in record && 'is_blue_verified' in record) {
    result.push({
      rest_id: record['rest_id'],
      is_blue_verified: record['is_blue_verified'],
      verified_type: record['verified_type'],
      legacy: record['legacy'],
    });
  }

  for (const value of Object.values(record)) {
    if (Array.isArray(value)) {
      value.forEach((item) => findUserObjects(item, result));
    } else if (typeof value === 'object') {
      findUserObjects(value, result);
    }
  }
}

interface ProfileEntry {
  userId: string;
  handle: string;
  displayName: string;
  bio: string;
}

function extractProfileData(data: unknown, endpointHint?: string): void {
  const profiles: ProfileEntry[] = [];
  findProfileObjects(data, profiles);
  if (profiles.length > 0) {
    // Cache for replay when content script signals ready
    for (const p of profiles) {
      if (!cachedProfiles.some((c) => c.userId === p.userId)) {
        cachedProfiles.push(p);
      }
    }
    window.postMessage({ type: MESSAGE_TYPES.PROFILE_DATA, profiles }, '*');
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

function findProfileObjects(obj: unknown, result: ProfileEntry[]): void {
  if (obj === null || typeof obj !== 'object') return;
  const record = obj as Record<string, unknown>;

  if (
    'rest_id' in record &&
    'is_blue_verified' in record &&
    'legacy' in record &&
    typeof record['rest_id'] === 'string'
  ) {
    const legacy = record['legacy'] as Record<string, unknown> | null;
    // X API moved screen_name/name from legacy to core in newer responses
    const core = record['core'] as Record<string, unknown> | null;
    if (legacy) {
      const handle =
        typeof legacy['screen_name'] === 'string' ? legacy['screen_name'] :
        typeof core?.['screen_name'] === 'string' ? core['screen_name'] as string : '';
      const displayName =
        typeof legacy['name'] === 'string' ? legacy['name'] :
        typeof core?.['name'] === 'string' ? core['name'] as string : '';
      result.push({
        userId: record['rest_id'] as string,
        handle,
        displayName,
        bio: typeof legacy['description'] === 'string' ? legacy['description'] : '',
      });
    }
  }

  for (const value of Object.values(record)) {
    if (Array.isArray(value)) {
      value.forEach((item) => findProfileObjects(item, result));
    } else if (typeof value === 'object') {
      findProfileObjects(value, result);
    }
  }
}
