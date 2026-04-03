// NOTE: These constants are intentionally duplicated from @shared/constants.
// This file is injected directly into the page context via a <script> tag,
// where extension module imports (chrome.runtime, @shared paths) are unavailable.
// To keep them in sync, tests/injected/fetch-interceptor-constants.test.ts
// asserts that these values match the shared constants.
import { findUserObjects, findFollowedHandles } from './data-extractors';
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
const MAX_CACHED_PROFILES = 10000;
const cachedProfiles = new Map<string, ProfileEntry>();

window.addEventListener('message', (event) => {
  if (event.source !== window) return;
  const data = event.data as Record<string, unknown>;
  if (data?.type === 'BBR_SET_DEBUG') {
    bbrDebugMode = !!(data.enabled);
  }
  // Content script signals it's ready — replay cached profiles so none are missed
  if (data?.type === MESSAGE_TYPES.CONTENT_READY && cachedProfiles.size > 0) {
    window.postMessage({ type: MESSAGE_TYPES.PROFILE_DATA, profiles: Array.from(cachedProfiles.values()) }, '*');
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
      const endpoint = url.split('/').slice(-2).join('/');
      extractBadgeData(data, endpoint);
      // extractViewerUserId 제거: viewer ID 메시지를 수신하는 리스너 없음.
      // 계정 감지는 content script의 detectAndHandleAccountSwitch()에서 DOM 기반으로 처리.

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
    return (origXhrOpen as Function).call(this, method, url);
  }
  return origXhrOpen.call(this, method, url, async!, username, password);
};

XMLHttpRequest.prototype.send = function patchedXhrSend(body?: Document | XMLHttpRequestBodyInit | null) {
  const xhr = this as XMLHttpRequest & { _bbrUrl?: string };
  const url = xhr._bbrUrl ?? '';
  const isGraphQL = X_GRAPHQL_ENDPOINTS.some((ep) => url.includes(ep));
  if (isGraphQL) {
    xhr.addEventListener('load', function () {
      try {
        const data = JSON.parse(xhr.responseText) as unknown;
        const endpoint = url.split('/').slice(-2).join('/');
        extractBadgeData(data, endpoint);
        // extractViewerUserId 제거: viewer ID 메시지를 수신하는 리스너 없음.
      // 계정 감지는 content script의 detectAndHandleAccountSwitch()에서 DOM 기반으로 처리.
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

function extractBadgeData(data: unknown, endpointHint?: string): void {
  const users: Array<Record<string, unknown>> = [];
  findUserObjects(data, users);

  if (users.length > 0) {
    window.postMessage({
      type: MESSAGE_TYPES.BADGE_DATA,
      users,
    }, '*');

    // Derive profiles from already-collected users — avoids a second full traversal
    const profiles: ProfileEntry[] = [];
    for (const user of users) {
      const restId = user['rest_id'];
      if (typeof restId !== 'string') continue;
      const legacy = user['legacy'] as Record<string, unknown> | null;
      if (!legacy) continue;
      const core = user['core'] as Record<string, unknown> | null;
      const handle =
        typeof legacy['screen_name'] === 'string' ? legacy['screen_name'] :
        typeof core?.['screen_name'] === 'string' ? core['screen_name'] as string : '';
      const displayName =
        typeof legacy['name'] === 'string' ? legacy['name'] :
        typeof core?.['name'] === 'string' ? core['name'] as string : '';
      profiles.push({
        userId: restId,
        handle,
        displayName,
        bio: typeof legacy['description'] === 'string' ? legacy['description'] : '',
      });
    }

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
}

// extractViewerUserId / findViewerId 제거됨 — 수신 리스너 없는 죽은 코드

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

// findUserObjects and findFollowedHandles extracted to ./data-extractors.ts

interface ProfileEntry {
  userId: string;
  handle: string;
  displayName: string;
  bio: string;
}


interface ArticleData {
  handle: string;
  following: boolean;
}

function extractArticleDataFromFiber(article: HTMLElement): ArticleData | null {
  const fiberKey = Object.keys(article).find(
    (k) => k.startsWith('__reactFiber') || k.startsWith('__reactInternalInstance'),
  );
  if (!fiberKey) return null;

  const seenProps = new WeakSet<object>();
  function scanProps(obj: unknown, depth: number): ArticleData | null {
    if (!obj || typeof obj !== 'object' || depth > 50 || seenProps.has(obj as object)) return null;
    seenProps.add(obj as object);
    const r = obj as Record<string, unknown>;
    if (typeof r['screen_name'] === 'string' && typeof r['following'] === 'boolean') {
      return { handle: r['screen_name'], following: r['following'] };
    }
    if (Array.isArray(obj)) {
      for (const item of obj) { const f = scanProps(item, depth + 1); if (f) return f; }
      return null;
    }
    for (const key of Object.keys(r)) {
      let v: unknown; try { v = r[key]; } catch { continue; }
      if (v && typeof v === 'object') { const f = scanProps(v, depth + 1); if (f) return f; }
    }
    return null;
  }

  const seenFiber = new WeakSet<object>();
  function walkFiber(node: unknown, depth: number): ArticleData | null {
    if (!node || typeof node !== 'object' || depth > 80 || seenFiber.has(node as object)) return null;
    seenFiber.add(node as object);
    const fiber = node as Record<string, unknown>;
    try {
      const props = fiber['memoizedProps'];
      if (props && typeof props === 'object') {
        const r = scanProps(props, 0);
        if (r) return r;
      }
      return walkFiber(fiber['child'], depth + 1) ?? walkFiber(fiber['sibling'], depth + 1);
    } catch { return null; }
  }

  const data = walkFiber((article as unknown as Record<string, unknown>)[fiberKey], 0);
  if (bbrDebugMode && data) {
    console.log('[BBR-DOM]', data.handle, `following=${data.following}`);
  }
  return data;
}

(function observeTweetArticles() {
  function processArticle(article: HTMLElement) {
    const data = extractArticleDataFromFiber(article);
    if (!data?.following) return;
    window.postMessage({
      type: MESSAGE_TYPES.FOLLOW_DATA,
      handles: [data.handle.toLowerCase()],
      source: 'inline',
    }, '*');
  }

  const observer = new MutationObserver((mutations) => {
    for (const m of mutations) {
      for (const node of m.addedNodes) {
        if (!(node instanceof HTMLElement)) continue;
        if (node.matches('article[data-testid="tweet"]')) {
          processArticle(node);
        } else {
          node.querySelectorAll<HTMLElement>('article[data-testid="tweet"]').forEach(processArticle);
        }
      }
    }
  });

  const startObserver = () => observer.observe(document.body, { childList: true, subtree: true });
  if (document.body) {
    startObserver();
  } else {
    document.addEventListener('DOMContentLoaded', startObserver);
  }
})();

