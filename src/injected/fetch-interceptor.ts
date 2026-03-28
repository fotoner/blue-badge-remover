// NOTE: These constants are intentionally duplicated from @shared/constants.
// This file is injected directly into the page context via a <script> tag,
// where extension module imports (chrome.runtime, @shared paths) are unavailable.
// To keep them in sync, tests/injected/fetch-interceptor-constants.test.ts
// asserts that these values match the shared constants.
const MESSAGE_TYPES = {
  BADGE_DATA: 'BBR_BADGE_DATA',
  TOKEN_DATA: 'BBR_TOKEN_DATA',
  USER_ID: 'BBR_USER_ID',
  CSRF_TOKEN: 'BBR_CSRF_TOKEN',
  FOLLOW_DATA: 'BBR_FOLLOW_DATA',
} as const;

const X_GRAPHQL_ENDPOINTS = [
  '/i/api/graphql/',
  '/i/api/2/',
] as const;

const originalFetch = window.fetch;

window.fetch = async function patchedFetch(
  input: RequestInfo | URL,
  init?: RequestInit,
): Promise<Response> {
  const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;

  // Extract Bearer token from request headers
  const authHeader = extractAuthHeader(init);
  if (authHeader) {
    window.postMessage({
      type: MESSAGE_TYPES.TOKEN_DATA,
      token: authHeader.replace('Bearer ', ''),
    }, '*');
  }

  // Extract CSRF token from request headers
  const csrfHeader = extractCsrfHeader(init);
  if (csrfHeader) {
    window.postMessage({
      type: MESSAGE_TYPES.CSRF_TOKEN,
      csrfToken: csrfHeader,
    }, '*');
  }

  const response = await originalFetch.call(window, input, init);

  // Intercept GraphQL responses
  const isGraphQL = X_GRAPHQL_ENDPOINTS.some((ep) => url.includes(ep));
  if (isGraphQL) {
    try {
      const cloned = response.clone();
      const data = await cloned.json();
      extractBadgeData(data);
      extractViewerUserId(data);
      if (url.includes('Following') || url.includes('following')) {
        extractFollowData(data);
      }
    } catch {
      // Parse failure — fallback mode will handle
    }
  }

  return response;
};

function extractAuthHeader(init?: RequestInit): string | null {
  if (!init?.headers) return null;

  if (init.headers instanceof Headers) {
    return init.headers.get('authorization');
  }
  if (Array.isArray(init.headers)) {
    const entry = init.headers.find(([k]) => k.toLowerCase() === 'authorization');
    return entry ? entry[1] : null;
  }
  const record = init.headers as Record<string, string>;
  return record['authorization'] ?? record['Authorization'] ?? null;
}

function extractCsrfHeader(init?: RequestInit): string | null {
  if (!init?.headers) return null;

  if (init.headers instanceof Headers) {
    return init.headers.get('x-csrf-token');
  }
  if (Array.isArray(init.headers)) {
    const entry = init.headers.find(([k]) => k.toLowerCase() === 'x-csrf-token');
    return entry ? entry[1] : null;
  }
  const record = init.headers as Record<string, string>;
  return record['x-csrf-token'] ?? record['X-Csrf-Token'] ?? null;
}

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
  const userIds: string[] = [];
  findFollowedUserIds(data, userIds);
  if (userIds.length > 0) {
    window.postMessage({
      type: MESSAGE_TYPES.FOLLOW_DATA,
      userIds,
    }, '*');
  }
}

function findFollowedUserIds(obj: unknown, result: string[]): void {
  if (obj === null || typeof obj !== 'object') return;
  const record = obj as Record<string, unknown>;

  // X Following API 응답에서 user_results.result.rest_id 추출
  if ('user_results' in record) {
    const userResults = record['user_results'] as Record<string, unknown> | null;
    const restId = (userResults?.['result'] as Record<string, unknown> | undefined)?.['rest_id'];
    if (typeof restId === 'string') {
      result.push(restId);
    }
  }

  for (const value of Object.values(record)) {
    if (Array.isArray(value)) {
      value.forEach((item) => findFollowedUserIds(item, result));
    } else if (typeof value === 'object') {
      findFollowedUserIds(value, result);
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
