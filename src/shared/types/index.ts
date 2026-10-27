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
  milestoneBannerEnabled: boolean;
  aggressorFilterEnabled: boolean;
  /** 트윗 상세에서 들어간 트윗 글쓴이의 앞뒤 타래는 숨기지 않는다 (#94) */
  showAuthorThread: boolean;
  /** 트윗 상세에서는 숨김 방식이 완전 제거여도 접어 두고 펼쳐볼 수 있게 한다 (#94) */
  collapseOnDetail: boolean;
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
  protectedKeywords: string[];
}

export interface ProfileInfo {
  handle: string;
  displayName: string;
  bio: string;
  createdAt?: string;
  followersCount?: number;
  followingCount?: number;
}

/** 와일드카드 규칙 매처 — 선형 시간 구현 (RegExp도 구조적으로 호환) */
export interface WildcardMatcher {
  test(text: string): boolean;
}

export type FilterRule =
  | { type: 'keyword'; value: string; packId?: string; category?: string; reason?: string }
  | { type: 'wildcard'; pattern: WildcardMatcher; original: string; packId?: string; category?: string; reason?: string }
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
