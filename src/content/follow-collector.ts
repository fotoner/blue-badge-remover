// src/content/follow-collector.ts
import { STORAGE_KEYS } from '@shared/constants';
import type { Settings } from '@shared/types';
import { logger } from '@shared/utils/logger';

export interface FollowCollectorDeps {
  getCurrentSettings: () => Settings;
  setFollowSet: (set: Set<string>) => void;
}

let followObserver: MutationObserver | null = null;

export function getMyHandle(): string | null {
  const profileLink = document.querySelector('a[data-testid="AppTabBar_Profile_Link"]');
  const href = profileLink?.getAttribute('href');
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
  // Only collect from Following page, and only for my own following list
  if (!window.location.pathname.includes('/following')) return;
  const myHandle = getMyHandle();
  if (!myHandle) return;
  const pathUser = window.location.pathname.split('/')[1]?.toLowerCase();
  if (pathUser && pathUser !== myHandle) return;

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
  }, 2000);
}

export function disconnectFollowObserver(): void {
  if (followObserver) {
    followObserver.disconnect();
    followObserver = null;
  }
}
