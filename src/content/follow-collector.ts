// src/content/follow-collector.ts
import { STORAGE_KEYS, TIMINGS } from '@shared/constants';
import type { Settings } from '@shared/types';
import { logger } from '@shared/utils/logger';
import { t } from '@shared/i18n';
import { getProfileLinkHref } from './page-utils';

export interface FollowCollectorDeps {
  getCurrentSettings: () => Settings;
  setFollowSet: (set: Set<string>) => void;
  getFollowSet?: () => Set<string>;
  onFollowed?: (handle: string) => void;
  onUnfollowed?: (handle: string) => void;
}

let followObserver: MutationObserver | null = null;
const SYNC_BANNER_ID = 'bbr-follow-sync-banner';

export function getMyHandle(): string | null {
  const href = getProfileLinkHref();
  return href ? href.slice(1).toLowerCase() : null;
}

export async function saveFollowHandles(
  handles: string[],
  deps: FollowCollectorDeps,
): Promise<void> {
  if (!handles.length) return;
  const stored = await chrome.storage.local.get([STORAGE_KEYS.FOLLOW_CACHE, STORAGE_KEYS.CURRENT_USER_ID]);
  const currentAccount = (stored[STORAGE_KEYS.CURRENT_USER_ID] as string | null) ?? '';
  const cache = (stored[STORAGE_KEYS.FOLLOW_CACHE] as Record<string, string[]> | undefined) ?? {};
  const existing = currentAccount ? (cache[currentAccount] ?? []) : [];
  const merged = [...new Set([...existing, ...handles])];
  if (currentAccount) {
    cache[currentAccount] = merged;
  }
  await chrome.storage.local.set({
    [STORAGE_KEYS.FOLLOW_CACHE]: cache,
    [STORAGE_KEYS.FOLLOW_LIST]: merged,
    [STORAGE_KEYS.LAST_SYNC_AT]: new Date().toISOString(),
  });
  deps.setFollowSet(new Set(merged));
  const settings = deps.getCurrentSettings();
  if (settings.debugMode) logger.info('Follow handles saved', { account: currentAccount, newCount: handles.length, totalCount: merged.length });
}

export async function removeFollowHandle(
  handle: string,
  deps: FollowCollectorDeps,
): Promise<void> {
  const lower = handle.toLowerCase();
  const stored = await chrome.storage.local.get([STORAGE_KEYS.FOLLOW_CACHE, STORAGE_KEYS.CURRENT_USER_ID]);
  const currentAccount = (stored[STORAGE_KEYS.CURRENT_USER_ID] as string | null) ?? '';
  const cache = (stored[STORAGE_KEYS.FOLLOW_CACHE] as Record<string, string[]> | undefined) ?? {};
  const existing = currentAccount ? (cache[currentAccount] ?? []) : [];
  const filtered = existing.filter((h) => h !== lower);
  if (currentAccount) {
    cache[currentAccount] = filtered;
  }
  await chrome.storage.local.set({
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
  if (!window.location.pathname.includes('/following')) return;

  // 배너는 /following 진입 시 항상 표시
  showSyncBanner(deps);

  // myHandle이 아직 없으면 재시도
  const myHandle = getMyHandle();
  if (!myHandle) {
    setTimeout(() => collectFollowsFromDOMInner(deps), TIMINGS.FOLLOW_COLLECT_RETRY);
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
    const handles = extractHandlesFromDOM();
    if (handles.length > 0) {
      void saveFollowHandles(handles, deps);
    }
  });

  followObserver.observe(document.body, { childList: true, subtree: true });

  // Initial collection
  setTimeout(() => {
    const handles = extractHandlesFromDOM();
    if (handles.length > 0) {
      void saveFollowHandles(handles, deps);
    }
  }, TIMINGS.FOLLOW_EXTRACT_DELAY);
}

function showSyncBanner(deps: FollowCollectorDeps): void {
  if (document.getElementById(SYNC_BANNER_ID)) return;
  const lang = deps.getCurrentSettings().language;

  const banner = document.createElement('div');
  banner.id = SYNC_BANNER_ID;
  banner.style.cssText = 'position:fixed;top:0;left:0;right:0;z-index:10000;background:#1d9bf0;color:white;text-align:center;padding:10px 16px;font-size:14px;font-weight:500;font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif;display:flex;align-items:center;justify-content:center;gap:8px;';
  banner.textContent = t('followSyncBanner', lang);

  const dismiss = document.createElement('button');
  dismiss.textContent = '\u2715';
  dismiss.style.cssText = 'background:none;border:none;color:white;font-size:18px;cursor:pointer;padding:0 4px;margin-left:8px;opacity:0.7;';
  dismiss.addEventListener('click', () => banner.remove());
  banner.appendChild(dismiss);

  document.body.appendChild(banner);

  // 페이지 이탈 시 자동 제거
  setTimeout(() => {
    document.getElementById(SYNC_BANNER_ID)?.remove();
  }, TIMINGS.SYNC_BANNER_DISMISS);
}

export function disconnectFollowObserver(): void {
  if (followObserver) {
    followObserver.disconnect();
    followObserver = null;
  }
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
