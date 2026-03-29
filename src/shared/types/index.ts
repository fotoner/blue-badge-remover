export interface Settings {
  enabled: boolean;
  filter: {
    timeline: boolean;
    replies: boolean;
    search: boolean;
  };
  hideMode: 'remove' | 'collapse';
  retweetFilter: boolean;
  quoteMode: 'off' | 'quote-only' | 'entire';
  debugMode: boolean;
  language: 'ko' | 'en' | 'ja';
  keywordFilterEnabled: boolean;
  keywordCollectorEnabled: boolean;
  defaultFilterEnabled: boolean;
}

export interface CollectedFadak {
  userId: string;
  handle: string;
  displayName: string;
  bio: string;
  tweetTexts: string[];
  firstSeenAt: number;
  lastSeenAt: number;
}

export interface StorageSchema {
  settings: Settings;
  whitelist: string[];
  followList: string[];
  currentUserId: string | null;
  token: string | null;
  lastSyncAt: string | null;
  customFilterList: string;
}

export interface BadgeInfo {
  userId: string;
  isBluePremium: boolean;
  isLegacyVerified: boolean;
  isBusiness: boolean;
}

export interface ProfileInfo {
  handle: string;
  displayName: string;
  bio: string;
}

export type FilterRule =
  | { type: 'keyword'; value: string }
  | { type: 'wildcard'; pattern: RegExp; original: string }
  | { type: 'exception'; handle: string };

export interface KeywordMatchResult {
  matched: boolean;
  matchedRule?: string;
}

export type StorageKey = keyof StorageSchema;
