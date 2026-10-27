// src/content/page-utils.ts
// Side-effect-free page detection utilities for content scripts

import type { PageType } from '@features/content-filter';
import { X_HANDLE_PATTERN } from '@shared/constants';

const RESERVED_PATHS = ['home', 'explore', 'search', 'notifications', 'messages', 'i', 'settings', 'compose'];

export function isProfilePage(): boolean {
  const path = window.location.pathname;
  const segments = path.split('/').filter(Boolean);
  if (segments.length === 0) return false;
  if (RESERVED_PATHS.includes(segments[0]!)) return false;
  return !path.includes('/status/') && !path.includes('/following') && !path.includes('/followers');
}

const PROFILE_LINK_SELECTOR = 'a[data-testid="AppTabBar_Profile_Link"]';
// 2026-10: 사이드바에서 프로필 링크가 빠졌다 — 계정 전환 버튼 아바타의 testid에만 핸들이 남아 있다
const AVATAR_TESTID_PREFIX = 'UserAvatar-Container-';
const ACCOUNT_AVATAR_SELECTOR = `[data-testid="SideNav_AccountSwitcher_Button"] [data-testid^="${AVATAR_TESTID_PREFIX}"]`;

/** 로그인한 계정 핸들(소문자). 프로필 링크가 없으면 계정 전환 버튼 아바타에서 읽는다 */
export function getAccountHandleFromDOM(): string | null {
  const candidates = [
    document.querySelector(PROFILE_LINK_SELECTOR)?.getAttribute('href')?.slice(1),
    document.querySelector(ACCOUNT_AVATAR_SELECTOR)?.getAttribute('data-testid')?.slice(AVATAR_TESTID_PREFIX.length),
  ];
  const handle = candidates.find((value) => value !== undefined && X_HANDLE_PATTERN.test(value));
  return handle ? handle.toLowerCase() : null;
}

export function isDetailPage(): boolean {
  return window.location.pathname.includes('/status/');
}

// X가 북마크를 /i/bookmarks에서 /i/history(마음에 들어요는 /i/history/likes 탭)로 옮김
const BOOKMARKS_PATH = /^\/i\/(bookmarks|history)(\/|$)/;

export function getPageType(): PageType {
  const path = window.location.pathname;
  if (BOOKMARKS_PATH.test(path)) return 'bookmarks';
  if (path.includes('/i/lists/') || path.includes('/lists/')) return 'lists';
  if (path.includes('/search')) return 'search';
  if (path.includes('/status/')) return 'replies';
  return 'timeline';
}
