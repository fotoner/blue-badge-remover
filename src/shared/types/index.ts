export interface Settings {
  enabled: boolean;
  filter: {
    timeline: boolean;
    replies: boolean;
    search: boolean;
    bookmarks: boolean;
    lists: boolean;
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
  lastSyncAt: string | null;
  customFilterList: string;
}

export interface BadgeInfo {
  userId: string;
  handle: string | null;
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
  | { type: 'keyword'; value: string; packId?: string; category?: string; reason?: string }
  | { type: 'wildcard'; pattern: RegExp; original: string; packId?: string; category?: string; reason?: string }
  | { type: 'exception'; handle: string; packId?: string; category?: string };

export interface KeywordMatchResult {
  matched: boolean;
  matchedRule?: string;
  packId?: string;
  category?: string;
}

export interface FilterPack {
  id: string;
  name: string;
  description: string;
  author: string;
  version: string;
  updatedAt: string;
  homepage?: string;
  category?: string;
  rules: string;
}

export interface FilterPackEntry {
  pack: FilterPack;
  enabled: boolean;
}

export type StorageKey = keyof StorageSchema;
