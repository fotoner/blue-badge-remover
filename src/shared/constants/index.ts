import type { Settings } from '@shared/types';

export const DEFAULT_SETTINGS: Settings = {
  enabled: true,
  filter: {
    timeline: true,
    replies: true,
    search: true,
  },
  hideMode: 'remove',
  retweetFilter: true,
  quoteMode: 'off',
  debugMode: false,
  language: 'ko',
};

export const STORAGE_KEYS = {
  SETTINGS: 'settings',
  WHITELIST: 'whitelist',
  FOLLOW_LIST: 'followList',
  FOLLOW_CACHE: 'followCache',
  CURRENT_USER_ID: 'currentUserId',
  LAST_SYNC_AT: 'lastSyncAt',
} as const;

export const X_GRAPHQL_ENDPOINTS = [
  '/i/api/graphql/',
  '/i/api/2/',
] as const;

export const MESSAGE_TYPES = {
  BADGE_DATA: 'BBR_BADGE_DATA',
  TOKEN_DATA: 'BBR_TOKEN_DATA',
  USER_ID: 'BBR_USER_ID',
  CSRF_TOKEN: 'BBR_CSRF_TOKEN',
  FOLLOW_DATA: 'BBR_FOLLOW_DATA',
} as const;
