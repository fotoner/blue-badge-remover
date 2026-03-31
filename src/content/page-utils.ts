// src/content/page-utils.ts
// Side-effect-free page detection utilities for content scripts

import type { PageType } from '@features/content-filter';

const RESERVED_PATHS = ['home', 'explore', 'search', 'notifications', 'messages', 'i', 'settings', 'compose'];

export function isProfilePage(): boolean {
  const path = window.location.pathname;
  const segments = path.split('/').filter(Boolean);
  if (segments.length === 0) return false;
  if (RESERVED_PATHS.includes(segments[0]!)) return false;
  return !path.includes('/status/') && !path.includes('/following') && !path.includes('/followers');
}

export function getPageType(): PageType {
  const path = window.location.pathname;
  if (path.includes('/i/bookmarks')) return 'bookmarks';
  if (path.includes('/search')) return 'search';
  if (path.includes('/status/')) return 'replies';
  return 'timeline';
}
