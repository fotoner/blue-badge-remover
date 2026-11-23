// src/content/page-utils.ts
// Side-effect-free page detection utilities for content scripts

import type { PageType } from '@features/content-filter';
import { X_HANDLE_PATTERN } from '@shared/constants';
import { getViewerHandleHint } from './state';

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

// 앱 구별: xweb은 abs.twimg.com/x-web/x-web/entry-client*.js, rweb은 responsive-web/client-web/main.*.js (2026-11-23 실측, #142)
const XWEB_SCRIPT_HOST = 'abs.twimg.com';
const XWEB_SCRIPT_PATH_PREFIX = '/x-web/x-web/entry-client';

/** 이 문서가 새 웹 앱(xweb)인지. 스크립트 주소의 호스트와 경로로 가른다 — 다른 호스트가 같은 경로를 흉내 내도 속지 않는다 (#142) */
export function isXwebDocument(): boolean {
  return Array.from(document.scripts).some((script) => {
    try {
      const { hostname, pathname } = new URL(script.src);
      return hostname === XWEB_SCRIPT_HOST && pathname.startsWith(XWEB_SCRIPT_PATH_PREFIX);
    } catch {
      return false;
    }
  });
}

/**
 * DOM에서 못 찾으면, xweb 문서에 한해 MAIN world가 알려 준 초기 데이터의 본인 핸들(소문자)로 대신한다.
 * xweb에는 계정 전환 링크가 없다. rweb은 힌트를 받아 두어도 쓰지 않는다 (#142)
 */
export function getAccountHandle(): string | null {
  return getAccountHandleFromDOM() ?? (isXwebDocument() ? getViewerHandleHint() : null);
}

const STATUS_PATH = /^\/([^/]+)\/status\/\d+/;

/** 트윗 상세에서 들어간 트윗의 글쓴이 핸들(소문자). 상세가 아니거나 /i/status처럼 핸들이 없으면 null (#94) */
export function getDetailAuthorHandle(): string | null {
  const handle = STATUS_PATH.exec(window.location.pathname)?.[1];
  if (!handle || RESERVED_PATHS.includes(handle) || !X_HANDLE_PATTERN.test(handle)) return null;
  return handle.toLowerCase();
}

export function isDetailPage(): boolean {
  return window.location.pathname.includes('/status/');
}

// X가 북마크를 /i/bookmarks에서 /i/history(마음에 들어요는 /i/history/likes 탭)로 옮김
const BOOKMARKS_PATH = /^\/i\/(bookmarks|history)(\/|$)/;

export function getPageType(): PageType {
  const path = window.location.pathname;
  if (BOOKMARKS_PATH.test(path)) return 'bookmarks';
  // 상세를 먼저 본다 — search·lists로 시작하는 핸들(/searchfan/status/…)이 검색·리스트로 판정되지 않게 (#94)
  if (path.includes('/status/')) return 'replies';
  if (path.includes('/i/lists/') || path.includes('/lists/')) return 'lists';
  if (path.includes('/search')) return 'search';
  return 'timeline';
}
