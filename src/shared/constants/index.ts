import type { Settings } from '@shared/types';

export const DEFAULT_SETTINGS: Settings = {
  enabled: true,
  filter: {
    timeline: true,
    replies: true,
    search: true,
    bookmarks: false,
  },
  hideMode: 'remove',
  retweetFilter: true,
  quoteMode: 'off',
  debugMode: false,
  language: 'ko',
  keywordFilterEnabled: false,
  keywordCollectorEnabled: false,
  defaultFilterEnabled: true,
};

export const STORAGE_KEYS = {
  SETTINGS: 'settings',
  WHITELIST: 'whitelist',
  FOLLOW_LIST: 'followList',
  FOLLOW_CACHE: 'followCache',
  CURRENT_USER_ID: 'currentUserId',
  LAST_SYNC_AT: 'lastSyncAt',
  CUSTOM_FILTER_LIST: 'customFilterList',
  COLLECTED_FADAKS: 'collectedFadaks',
  DISABLED_FILTER_CATEGORIES: 'disabledFilterCategories',
} as const;

export const X_GRAPHQL_ENDPOINTS = [
  '/i/api/graphql/',
  '/i/api/2/',
] as const;

/** 타이밍 상수 (ms) */
export const TIMINGS = {
  /** 계정 전환 감지 폴링 주기 */
  ACCOUNT_SWITCH_POLL: 2000,
  /** 초기 설정 지연 (DOM 안정화 대기) */
  INITIAL_SETUP_DELAY: 3000,
  /** 키워드 수집기 플러시 주기 */
  COLLECTOR_FLUSH_INTERVAL: 5000,
  /** 호버 카드 옵저버 타임아웃 */
  HOVER_CARD_TIMEOUT: 3000,
  /** 파딱 배너 성공 메시지 표시 시간 */
  BANNER_SUCCESS_DISMISS: 1500,
  /** 파딱 배너 옵저버 타임아웃 */
  BANNER_OBSERVER_TIMEOUT: 10000,
  /** 팔로우 수집 재시도 지연 */
  FOLLOW_COLLECT_RETRY: 3000,
  /** 팔로우 핸들 추출 초기 지연 */
  FOLLOW_EXTRACT_DELAY: 2000,
  /** 팔로우 동기화 배너 자동 닫기 */
  SYNC_BANNER_DISMISS: 60000,
  /** 언팔로우 감지 지연 */
  UNFOLLOW_DETECT_DELAY: 2000,
} as const;

export const MESSAGE_TYPES = {
  BADGE_DATA: 'BBR_BADGE_DATA',
  USER_ID: 'BBR_USER_ID',
  FOLLOW_DATA: 'BBR_FOLLOW_DATA',
  PROFILE_DATA: 'BBR_PROFILE_DATA',
  CONTENT_READY: 'BBR_CONTENT_READY',
  OPEN_SETTINGS: 'BBR_OPEN_SETTINGS',
} as const;
