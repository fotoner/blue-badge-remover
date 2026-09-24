// src/content/follow-collector.ts
import { browser } from 'wxt/browser';
import { STORAGE_KEYS, TIMINGS } from '@shared/constants';
import type { Settings } from '@shared/types';
import { logger } from '@shared/utils/logger';
import { getProfileLinkHref } from './page-utils';

export interface FollowCollectorDeps {
  getCurrentSettings: () => Settings;
  setFollowSet: (set: Set<string>) => void;
  getFollowSet?: () => Set<string>;
  onFollowed?: (handle: string) => void;
  onUnfollowed?: (handle: string) => void;
}

let followObserver: MutationObserver | null = null;
let followRetryTimerId: ReturnType<typeof setTimeout> | null = null;
let followExtractTimerId: ReturnType<typeof setTimeout> | null = null;
let followDebounceTimerId: ReturnType<typeof setTimeout> | null = null;
const SYNC_BANNER_ID = 'bbr-follow-sync-banner';

export function getMyHandle(): string | null {
  const href = getProfileLinkHref();
  return href ? href.slice(1).toLowerCase() : null;
}

export function resolveAccountSwitchFollows(
  cache: Record<string, string[]>,
  currentHandle: string,
  savedHandle: string | null,
  pendingFollows: string[],
): string[] {
  const cachedFollows = cache[currentHandle] ?? [];
  const candidates = savedHandle === null
    ? [...cachedFollows, ...pendingFollows]
    : cachedFollows;
  return [...new Set(candidates.map((handle) => handle.toLowerCase()))];
}

// FOLLOW_CACHE/FOLLOW_LIST read-modify-write를 탭 안에서 직렬화하는 큐.
// 저장·언팔로우 삭제·계정 전환이 같은 스냅샷을 읽으면 나중 쓰기가 앞선 변경을 덮어써 핸들을 잃는다.
// 모든 팔로우 storage 쓰기는 이 큐를 거쳐야 한다.
let followStorageQueue: Promise<void> = Promise.resolve();

export function runFollowStorageTask<T>(task: () => Promise<T>): Promise<T> {
  const run = followStorageQueue.then(task);
  // 작업이 실패해도 큐 자체는 오염되지 않도록 — 다음 작업은 계속 진행되어야 한다.
  followStorageQueue = run.then(() => undefined, () => undefined);
  return run;
}

export function saveFollowHandles(
  handles: string[],
  deps: FollowCollectorDeps,
  expectedAccount?: string,
): Promise<void> {
  if (!handles.length) return Promise.resolve();
  return runFollowStorageTask(() => doSaveFollowHandles(handles, deps, expectedAccount));
}

export function removeFollowHandle(handle: string, deps: FollowCollectorDeps): Promise<void> {
  return runFollowStorageTask(() => doRemoveFollowHandle(handle, deps));
}

export interface AccountSwitchResult {
  from: string | null;
  follows: string[];
}

/** 저장된 계정과 다르면 계정별 팔로우 캐시로 전환한다. 같은 계정이면 null. */
export function switchFollowAccount(currentHandle: string): Promise<AccountSwitchResult | null> {
  return runFollowStorageTask(async () => {
    const stored = await browser.storage.local.get([
      STORAGE_KEYS.CURRENT_USER_ID,
      STORAGE_KEYS.FOLLOW_CACHE,
      STORAGE_KEYS.FOLLOW_LIST,
    ]);
    const savedHandle = (stored[STORAGE_KEYS.CURRENT_USER_ID] as string | null | undefined) ?? null;
    if (savedHandle === currentHandle) return null;

    const cache = (stored[STORAGE_KEYS.FOLLOW_CACHE] as Record<string, string[]> | undefined) ?? {};
    const pendingFollows = (stored[STORAGE_KEYS.FOLLOW_LIST] as string[] | undefined) ?? [];
    const follows = resolveAccountSwitchFollows(cache, currentHandle, savedHandle, pendingFollows);
    cache[currentHandle] = follows;
    await browser.storage.local.set({
      [STORAGE_KEYS.CURRENT_USER_ID]: currentHandle,
      [STORAGE_KEYS.FOLLOW_CACHE]: cache,
      [STORAGE_KEYS.FOLLOW_LIST]: follows,
    });
    return { from: savedHandle, follows };
  });
}

async function doSaveFollowHandles(
  handles: string[],
  deps: FollowCollectorDeps,
  expectedAccount?: string,
): Promise<void> {
  const stored = await browser.storage.local.get([STORAGE_KEYS.FOLLOW_CACHE, STORAGE_KEYS.CURRENT_USER_ID]);
  const currentAccount = (stored[STORAGE_KEYS.CURRENT_USER_ID] as string | null) ?? '';
  if (expectedAccount && currentAccount !== expectedAccount) return;
  const cache = (stored[STORAGE_KEYS.FOLLOW_CACHE] as Record<string, string[]> | undefined) ?? {};
  const existing = currentAccount ? (cache[currentAccount] ?? []) : [];
  const normalizedHandles = handles.map((handle) => handle.toLowerCase());
  const existingSet = new Set(existing.map((handle) => handle.toLowerCase()));
  const newHandles = normalizedHandles.filter((handle) => !existingSet.has(handle));
  if (newHandles.length === 0) return;
  const merged = [...existing, ...new Set(newHandles)];
  if (currentAccount) {
    cache[currentAccount] = merged;
  }
  await browser.storage.local.set({
    [STORAGE_KEYS.FOLLOW_CACHE]: cache,
    [STORAGE_KEYS.FOLLOW_LIST]: merged,
    [STORAGE_KEYS.LAST_SYNC_AT]: new Date().toISOString(),
  });
  deps.setFollowSet(new Set(merged));
  const settings = deps.getCurrentSettings();
  if (settings.debugMode) logger.info('Follow handles saved', { account: currentAccount, newCount: handles.length, totalCount: merged.length });
}

async function doRemoveFollowHandle(
  handle: string,
  deps: FollowCollectorDeps,
): Promise<void> {
  const lower = handle.toLowerCase();
  const stored = await browser.storage.local.get([STORAGE_KEYS.FOLLOW_CACHE, STORAGE_KEYS.CURRENT_USER_ID]);
  const currentAccount = (stored[STORAGE_KEYS.CURRENT_USER_ID] as string | null) ?? '';
  const cache = (stored[STORAGE_KEYS.FOLLOW_CACHE] as Record<string, string[]> | undefined) ?? {};
  const existing = currentAccount ? (cache[currentAccount] ?? []) : [];
  const filtered = existing.filter((h) => h !== lower);
  if (currentAccount) {
    cache[currentAccount] = filtered;
  }
  await browser.storage.local.set({
    [STORAGE_KEYS.FOLLOW_CACHE]: cache,
    [STORAGE_KEYS.FOLLOW_LIST]: filtered,
  });
  deps.setFollowSet(new Set(filtered));
  const settings = deps.getCurrentSettings();
  if (settings.debugMode) logger.info('Follow handle removed', { handle: lower, totalCount: filtered.length });
}

function extractHandlesFromDOM(): string[] {
  const handles: string[] = [];
  document.querySelectorAll('button[aria-label]').forEach((btn) => {
    const label = btn.getAttribute('aria-label') ?? '';
    const match = label.match(/팔로잉\s*@(\S+)/i) ?? label.match(/Following\s*@(\S+)/i);
    if (match?.[1]) {
      handles.push(match[1].toLowerCase());
    }
  });
  return handles;
}

export function collectFollowsFromDOM(deps: FollowCollectorDeps): void {
  if (!window.location.pathname.includes('/following')) {
    disconnectFollowObserver();
    return;
  }

  // myHandle이 아직 없으면 재시도
  const myHandle = getMyHandle();
  if (!myHandle) {
    if (followRetryTimerId !== null) clearTimeout(followRetryTimerId);
    followRetryTimerId = setTimeout(() => {
      followRetryTimerId = null;
      collectFollowsFromDOMInner(deps);
    }, TIMINGS.FOLLOW_COLLECT_RETRY);
    return;
  }

  collectFollowsFromDOMInner(deps);
}

function collectFollowsFromDOMInner(deps: FollowCollectorDeps): void {
  const myHandle = getMyHandle();
  const pathUser = window.location.pathname.split('/')[1]?.toLowerCase();
  // myHandle이 있으면 본인 페이지인지 확인, 없으면 그냥 수집 진행
  if (myHandle && pathUser && pathUser !== myHandle) return;

  disconnectFollowObserver();

  followObserver = new MutationObserver(() => {
    if (followDebounceTimerId !== null) clearTimeout(followDebounceTimerId);
    followDebounceTimerId = setTimeout(() => {
      followDebounceTimerId = null;
      collectNewFollowHandles(deps);
    }, TIMINGS.FOLLOW_OBSERVER_DEBOUNCE);
  });

  followObserver.observe(document.body, { childList: true, subtree: true });

  // Initial collection
  followExtractTimerId = setTimeout(() => {
    followExtractTimerId = null;
    collectNewFollowHandles(deps);
  }, TIMINGS.FOLLOW_EXTRACT_DELAY);
}

function collectNewFollowHandles(deps: FollowCollectorDeps): void {
  const knownHandles = deps.getFollowSet?.() ?? new Set<string>();
  const handles = extractHandlesFromDOM().filter((handle) => !knownHandles.has(handle));
  if (handles.length > 0) void saveFollowHandles(handles, deps);
}

export function disconnectFollowObserver(): void {
  if (followObserver) {
    followObserver.disconnect();
    followObserver = null;
  }
  if (followRetryTimerId !== null) clearTimeout(followRetryTimerId);
  if (followExtractTimerId !== null) clearTimeout(followExtractTimerId);
  if (followDebounceTimerId !== null) clearTimeout(followDebounceTimerId);
  followRetryTimerId = null;
  followExtractTimerId = null;
  followDebounceTimerId = null;
  document.getElementById(SYNC_BANNER_ID)?.remove();
}

export function listenForFollowButtonClicks(deps: FollowCollectorDeps): void {
  document.addEventListener('click', (e) => {
    const target = e.target as HTMLElement;
    const button = target.closest('button[aria-label]');
    if (!button) return;
    const label = button.getAttribute('aria-label') ?? '';
    const followSet = deps.getFollowSet?.() ?? new Set<string>();

    // 팔로우: "팔로우 @handle" / "Follow @handle"
    const followMatch = label.match(/^(?:팔로우|Follow)\s+@(\S+)$/i);
    if (followMatch?.[1]) {
      const handle = followMatch[1].toLowerCase();
      if (!followSet.has(handle)) {
        followSet.add(handle);
        void saveFollowHandles([handle], deps);
        deps.onFollowed?.(handle);
      }
      return;
    }

    // 언팔: "팔로잉 @handle" / "Following @handle"
    const unfollowMatch = label.match(/^(?:팔로잉|Following)\s+@(\S+)$/i);
    if (unfollowMatch?.[1]) {
      const handle = unfollowMatch[1].toLowerCase();
      setTimeout(() => {
        const updatedLabel = button.getAttribute('aria-label') ?? '';
        if (/^(?:팔로우|Follow)\s+@/i.test(updatedLabel)) {
          followSet.delete(handle);
          void removeFollowHandle(handle, deps);
          deps.onUnfollowed?.(handle);
        }
      }, TIMINGS.UNFOLLOW_DETECT_DELAY);
    }
  }, true);
}
