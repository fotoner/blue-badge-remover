# Keyword Filter (D5) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a beta keyword filter feature that hides only blue-badge accounts whose profile matches user-defined keywords, instead of hiding all of them.

**Architecture:** New `src/features/keyword-filter/` module with pure-function parser and matcher (fully testable). The fetch interceptor is extended to extract profile data, which the content script caches and consults when `filterMode === 'keyword'`. A new `src/options/` entry point provides the filter list management UI.

**Tech Stack:** TypeScript, Vitest (tests), Chrome Extensions API (storage, runtime), CRXJS (build), vanilla HTML/CSS (options page).

---

## File Map

### New Files
| File | Responsibility |
|------|---------------|
| `src/features/keyword-filter/filter-rule-parser.ts` | Parse AdGuard-like filter list text → `FilterRule[]` |
| `src/features/keyword-filter/keyword-matcher.ts` | Match `ProfileInfo` against `FilterRule[]` |
| `src/features/keyword-filter/profile-cache.ts` | LRU cache: `userId → ProfileInfo` |
| `src/features/keyword-filter/default-filters.ts` | Built-in filter list constant |
| `src/features/keyword-filter/filter-storage.ts` | Chrome Storage CRUD for custom filter text |
| `src/features/keyword-filter/index.ts` | Public API exports |
| `src/options/index.html` | Options page HTML |
| `src/options/index.ts` | Options page logic |
| `src/options/style.css` | Options page dark-theme styles |
| `tests/features/keyword-filter/filter-rule-parser.test.ts` | Unit tests for parser |
| `tests/features/keyword-filter/keyword-matcher.test.ts` | Unit tests for matcher |
| `tests/features/keyword-filter/profile-cache.test.ts` | Unit tests for cache |
| `tests/features/keyword-filter/filter-storage.test.ts` | Unit tests for storage |

### Modified Files
| File | Change |
|------|--------|
| `src/shared/types/index.ts` | Add `keywordFilterEnabled`, `filterMode` to `Settings`; add `ProfileInfo`, `FilterRule`, `KeywordMatchResult`; add `customFilterList` to `StorageSchema` |
| `src/shared/constants/index.ts` | Add `CUSTOM_FILTER_LIST` to `STORAGE_KEYS`; add `PROFILE_DATA` to `MESSAGE_TYPES`; add defaults to `DEFAULT_SETTINGS` |
| `src/shared/i18n.ts` | Add 5 new translation keys for popup UI |
| `src/injected/fetch-interceptor.ts` | Add `PROFILE_DATA` to local constants; add `extractProfileData()` |
| `tests/injected/fetch-interceptor-constants.test.ts` | Add `PROFILE_DATA` assertion |
| `src/content/index.ts` | Import keyword-filter; integrate into `processTweet()`; listen for PROFILE_DATA messages |
| `src/popup/index.html` | Add beta section: toggle, filter mode radios, options button |
| `src/popup/index.ts` | Bind new settings and open-options handler |
| `src/manifest.json` | Add `"options_page": "src/options/index.html"` |

---

## Task 1: Extend Types and Constants

**Files:**
- Modify: `src/shared/types/index.ts`
- Modify: `src/shared/constants/index.ts`
- Modify: `tests/injected/fetch-interceptor-constants.test.ts`

- [ ] **Step 1: Replace `src/shared/types/index.ts` with extended version**

```typescript
// src/shared/types/index.ts
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
  filterMode: 'all' | 'keyword';
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
```

- [ ] **Step 2: Replace `src/shared/constants/index.ts` with extended version**

```typescript
// src/shared/constants/index.ts
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
  keywordFilterEnabled: false,
  filterMode: 'all',
};

export const STORAGE_KEYS = {
  SETTINGS: 'settings',
  WHITELIST: 'whitelist',
  FOLLOW_LIST: 'followList',
  FOLLOW_CACHE: 'followCache',
  CURRENT_USER_ID: 'currentUserId',
  LAST_SYNC_AT: 'lastSyncAt',
  CUSTOM_FILTER_LIST: 'customFilterList',
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
  PROFILE_DATA: 'BBR_PROFILE_DATA',
} as const;
```

- [ ] **Step 3: Update fetch-interceptor constants test**

```typescript
// tests/injected/fetch-interceptor-constants.test.ts
import { describe, it, expect } from 'vitest';
import { MESSAGE_TYPES, X_GRAPHQL_ENDPOINTS } from '@shared/constants';

// The injected script duplicates these constants because it runs in page context.
// This test ensures they stay in sync.
describe('fetch-interceptor constant sync', () => {
  it('MESSAGE_TYPES should match shared constants', () => {
    expect(MESSAGE_TYPES.BADGE_DATA).toBe('BBR_BADGE_DATA');
    expect(MESSAGE_TYPES.TOKEN_DATA).toBe('BBR_TOKEN_DATA');
    expect(MESSAGE_TYPES.USER_ID).toBe('BBR_USER_ID');
    expect(MESSAGE_TYPES.CSRF_TOKEN).toBe('BBR_CSRF_TOKEN');
    expect(MESSAGE_TYPES.FOLLOW_DATA).toBe('BBR_FOLLOW_DATA');
    expect(MESSAGE_TYPES.PROFILE_DATA).toBe('BBR_PROFILE_DATA');
  });

  it('X_GRAPHQL_ENDPOINTS should match shared constants', () => {
    expect(X_GRAPHQL_ENDPOINTS).toContain('/i/api/graphql/');
    expect(X_GRAPHQL_ENDPOINTS).toContain('/i/api/2/');
  });
});
```

- [ ] **Step 4: Run typecheck and tests**

```bash
npx tsc --noEmit
npx vitest run tests/injected/fetch-interceptor-constants.test.ts
```

Expected: typecheck passes (new fields have defaults so existing code still valid); constants test PASSES.

- [ ] **Step 5: Commit**

```bash
git add src/shared/types/index.ts src/shared/constants/index.ts tests/injected/fetch-interceptor-constants.test.ts
git commit -m "feat(d5): extend types and constants for keyword filter"
```

---

## Task 2: Filter Rule Parser (D5.1)

**Files:**
- Create: `src/features/keyword-filter/filter-rule-parser.ts`
- Create: `tests/features/keyword-filter/filter-rule-parser.test.ts`

- [ ] **Step 1: Write failing tests**

```typescript
// tests/features/keyword-filter/filter-rule-parser.test.ts
import { describe, it, expect } from 'vitest';
import { parseFilterList } from '@features/keyword-filter/filter-rule-parser';

describe('parseFilterList', () => {
  it('should parse a simple keyword rule', () => {
    const rules = parseFilterList('테슬라');
    expect(rules).toHaveLength(1);
    expect(rules[0]).toEqual({ type: 'keyword', value: '테슬라' });
  });

  it('should parse an exception rule starting with @@', () => {
    const rules = parseFilterList('@@elonmusk');
    expect(rules).toHaveLength(1);
    expect(rules[0]).toEqual({ type: 'exception', handle: 'elonmusk' });
  });

  it('should parse a wildcard rule containing *', () => {
    const rules = parseFilterList('*coin*');
    expect(rules).toHaveLength(1);
    expect(rules[0].type).toBe('wildcard');
    if (rules[0].type === 'wildcard') {
      expect(rules[0].original).toBe('*coin*');
      expect(rules[0].pattern).toBeInstanceOf(RegExp);
      expect(rules[0].pattern.test('bitcoin')).toBe(true);
      expect(rules[0].pattern.test('coinbase')).toBe(true);
      expect(rules[0].pattern.test('hello')).toBe(false);
    }
  });

  it('should handle wildcard at start only: coin*', () => {
    const rules = parseFilterList('coin*');
    expect(rules[0].type).toBe('wildcard');
    if (rules[0].type === 'wildcard') {
      expect(rules[0].pattern.test('coinbase')).toBe(true);
      expect(rules[0].pattern.test('bitcoin')).toBe(false);
    }
  });

  it('should ignore lines starting with !', () => {
    const rules = parseFilterList('! this is a comment\n테슬라');
    expect(rules).toHaveLength(1);
    expect(rules[0]).toEqual({ type: 'keyword', value: '테슬라' });
  });

  it('should ignore empty lines', () => {
    const rules = parseFilterList('테슬라\n\n년차\n');
    expect(rules).toHaveLength(2);
  });

  it('should parse multiple rules from multiline text', () => {
    const text = '! comment\n테슬라\n년차\n@@gooduser\n*crypto*';
    const rules = parseFilterList(text);
    expect(rules).toHaveLength(4);
    expect(rules[0]).toEqual({ type: 'keyword', value: '테슬라' });
    expect(rules[1]).toEqual({ type: 'keyword', value: '년차' });
    expect(rules[2]).toEqual({ type: 'exception', handle: 'gooduser' });
    expect(rules[3].type).toBe('wildcard');
  });

  it('should return empty array for empty string', () => {
    const rules = parseFilterList('');
    expect(rules).toHaveLength(0);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
npx vitest run tests/features/keyword-filter/filter-rule-parser.test.ts
```

Expected: FAIL — "Cannot find module '@features/keyword-filter/filter-rule-parser'"

- [ ] **Step 3: Implement filter-rule-parser**

```typescript
// src/features/keyword-filter/filter-rule-parser.ts
import type { FilterRule } from '@shared/types';

function wildcardToRegExp(pattern: string): RegExp {
  const escaped = pattern
    .split('*')
    .map((part) => part.replace(/[.+?^${}()|[\]\\]/g, '\\$&'))
    .join('.*');
  return new RegExp(escaped, 'i');
}

export function parseFilterList(text: string): FilterRule[] {
  const rules: FilterRule[] = [];

  for (const rawLine of text.split('\n')) {
    const line = rawLine.trim();
    if (!line || line.startsWith('!')) continue;

    if (line.startsWith('@@')) {
      rules.push({ type: 'exception', handle: line.slice(2).trim() });
    } else if (line.includes('*')) {
      rules.push({ type: 'wildcard', pattern: wildcardToRegExp(line), original: line });
    } else {
      rules.push({ type: 'keyword', value: line });
    }
  }

  return rules;
}
```

- [ ] **Step 4: Run test to verify it passes**

```bash
npx vitest run tests/features/keyword-filter/filter-rule-parser.test.ts
```

Expected: PASS (8 tests)

- [ ] **Step 5: Commit**

```bash
git add src/features/keyword-filter/filter-rule-parser.ts tests/features/keyword-filter/filter-rule-parser.test.ts
git commit -m "feat(d5.1): implement filter rule parser"
```

---

## Task 3: Keyword Matcher (D5.3)

**Files:**
- Create: `src/features/keyword-filter/keyword-matcher.ts`
- Create: `tests/features/keyword-filter/keyword-matcher.test.ts`

- [ ] **Step 1: Write failing tests**

```typescript
// tests/features/keyword-filter/keyword-matcher.test.ts
import { describe, it, expect } from 'vitest';
import { matchesKeywordFilter } from '@features/keyword-filter/keyword-matcher';
import type { FilterRule, ProfileInfo } from '@shared/types';

const baseProfile: ProfileInfo = {
  handle: 'testuser',
  displayName: 'Test User',
  bio: '',
};

describe('matchesKeywordFilter', () => {
  it('should match keyword in displayName (case insensitive)', () => {
    const rules: FilterRule[] = [{ type: 'keyword', value: '테슬라' }];
    const profile: ProfileInfo = { ...baseProfile, displayName: '테슬라 팬' };
    const result = matchesKeywordFilter(profile, rules);
    expect(result.matched).toBe(true);
    expect(result.matchedRule).toBe('테슬라');
  });

  it('should match keyword in handle (case insensitive)', () => {
    const rules: FilterRule[] = [{ type: 'keyword', value: 'tesla' }];
    const profile: ProfileInfo = { ...baseProfile, handle: 'TeslaFan' };
    const result = matchesKeywordFilter(profile, rules);
    expect(result.matched).toBe(true);
  });

  it('should match keyword in bio', () => {
    const rules: FilterRule[] = [{ type: 'keyword', value: '년차' }];
    const profile: ProfileInfo = { ...baseProfile, bio: '5년차 개발자' };
    const result = matchesKeywordFilter(profile, rules);
    expect(result.matched).toBe(true);
  });

  it('should not match when keyword is not in any field', () => {
    const rules: FilterRule[] = [{ type: 'keyword', value: '테슬라' }];
    const result = matchesKeywordFilter(baseProfile, rules);
    expect(result.matched).toBe(false);
  });

  it('should return not matched for empty rules', () => {
    const result = matchesKeywordFilter(baseProfile, []);
    expect(result.matched).toBe(false);
  });

  it('should apply exception rule: exception handle blocks match', () => {
    const rules: FilterRule[] = [
      { type: 'keyword', value: 'tesla' },
      { type: 'exception', handle: 'testuser' },
    ];
    const profile: ProfileInfo = { ...baseProfile, handle: 'testuser', bio: 'I love tesla' };
    const result = matchesKeywordFilter(profile, rules);
    expect(result.matched).toBe(false);
  });

  it('should apply wildcard rule', () => {
    const rules: FilterRule[] = [
      { type: 'wildcard', pattern: /.*coin.*/i, original: '*coin*' },
    ];
    const profile: ProfileInfo = { ...baseProfile, displayName: 'Bitcoin Lover' };
    const result = matchesKeywordFilter(profile, rules);
    expect(result.matched).toBe(true);
    expect(result.matchedRule).toBe('*coin*');
  });

  it('should match keywords case-insensitively', () => {
    const rules: FilterRule[] = [{ type: 'keyword', value: 'TESLA' }];
    const profile: ProfileInfo = { ...baseProfile, bio: 'tesla is great' };
    const result = matchesKeywordFilter(profile, rules);
    expect(result.matched).toBe(true);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
npx vitest run tests/features/keyword-filter/keyword-matcher.test.ts
```

Expected: FAIL — "Cannot find module '@features/keyword-filter/keyword-matcher'"

- [ ] **Step 3: Implement keyword-matcher**

```typescript
// src/features/keyword-filter/keyword-matcher.ts
import type { FilterRule, KeywordMatchResult, ProfileInfo } from '@shared/types';

function textContains(text: string, keyword: string): boolean {
  return text.toLowerCase().includes(keyword.toLowerCase());
}

function profileMatchesRule(profile: ProfileInfo, rule: FilterRule): boolean {
  if (rule.type === 'keyword') {
    return (
      textContains(profile.handle, rule.value) ||
      textContains(profile.displayName, rule.value) ||
      textContains(profile.bio, rule.value)
    );
  }
  if (rule.type === 'wildcard') {
    return (
      rule.pattern.test(profile.handle) ||
      rule.pattern.test(profile.displayName) ||
      rule.pattern.test(profile.bio)
    );
  }
  return false;
}

export function matchesKeywordFilter(
  profile: ProfileInfo,
  rules: FilterRule[],
): KeywordMatchResult {
  // Exception rules take priority — checked first
  for (const rule of rules) {
    if (
      rule.type === 'exception' &&
      rule.handle.toLowerCase() === profile.handle.toLowerCase()
    ) {
      return { matched: false };
    }
  }

  for (const rule of rules) {
    if (rule.type === 'exception') continue;
    if (profileMatchesRule(profile, rule)) {
      const matchedRule = rule.type === 'keyword' ? rule.value : rule.original;
      return { matched: true, matchedRule };
    }
  }

  return { matched: false };
}
```

- [ ] **Step 4: Run test to verify it passes**

```bash
npx vitest run tests/features/keyword-filter/keyword-matcher.test.ts
```

Expected: PASS (8 tests)

- [ ] **Step 5: Commit**

```bash
git add src/features/keyword-filter/keyword-matcher.ts tests/features/keyword-filter/keyword-matcher.test.ts
git commit -m "feat(d5.3): implement keyword matching engine"
```

---

## Task 4: Profile Cache (D5.2)

**Files:**
- Create: `src/features/keyword-filter/profile-cache.ts`
- Create: `tests/features/keyword-filter/profile-cache.test.ts`

- [ ] **Step 1: Write failing tests**

```typescript
// tests/features/keyword-filter/profile-cache.test.ts
import { describe, it, expect, beforeEach } from 'vitest';
import { ProfileCache } from '@features/keyword-filter/profile-cache';
import type { ProfileInfo } from '@shared/types';

describe('ProfileCache', () => {
  let cache: ProfileCache;

  beforeEach(() => {
    cache = new ProfileCache();
  });

  it('should return undefined for unknown userId', () => {
    expect(cache.get('unknown')).toBeUndefined();
  });

  it('should store and retrieve a profile', () => {
    const profile: ProfileInfo = { handle: 'testuser', displayName: 'Test', bio: 'hello' };
    cache.set('123', profile);
    expect(cache.get('123')).toEqual(profile);
  });

  it('should evict oldest entry when max size is exceeded', () => {
    const smallCache = new ProfileCache(3);
    smallCache.set('a', { handle: 'a', displayName: '', bio: '' });
    smallCache.set('b', { handle: 'b', displayName: '', bio: '' });
    smallCache.set('c', { handle: 'c', displayName: '', bio: '' });
    smallCache.set('d', { handle: 'd', displayName: '', bio: '' });
    expect(smallCache.get('a')).toBeUndefined();
    expect(smallCache.get('d')).toBeDefined();
  });

  it('should report has() correctly', () => {
    cache.set('xyz', { handle: 'xyz', displayName: 'X', bio: '' });
    expect(cache.has('xyz')).toBe(true);
    expect(cache.has('other')).toBe(false);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
npx vitest run tests/features/keyword-filter/profile-cache.test.ts
```

Expected: FAIL — "Cannot find module '@features/keyword-filter/profile-cache'"

- [ ] **Step 3: Implement profile-cache**

```typescript
// src/features/keyword-filter/profile-cache.ts
import type { ProfileInfo } from '@shared/types';

const DEFAULT_MAX_SIZE = 10000;

export class ProfileCache {
  private cache = new Map<string, ProfileInfo>();
  private readonly maxSize: number;

  constructor(maxSize = DEFAULT_MAX_SIZE) {
    this.maxSize = maxSize;
  }

  get(userId: string): ProfileInfo | undefined {
    return this.cache.get(userId);
  }

  set(userId: string, profile: ProfileInfo): void {
    if (this.cache.size >= this.maxSize) {
      const firstKey = this.cache.keys().next().value;
      if (firstKey !== undefined) this.cache.delete(firstKey);
    }
    this.cache.set(userId, profile);
  }

  has(userId: string): boolean {
    return this.cache.has(userId);
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

```bash
npx vitest run tests/features/keyword-filter/profile-cache.test.ts
```

Expected: PASS (4 tests)

- [ ] **Step 5: Commit**

```bash
git add src/features/keyword-filter/profile-cache.ts tests/features/keyword-filter/profile-cache.test.ts
git commit -m "feat(d5.2): implement profile LRU cache"
```

---

## Task 5: Default Filters and Filter Storage (D5.5)

**Files:**
- Create: `src/features/keyword-filter/default-filters.ts`
- Create: `src/features/keyword-filter/filter-storage.ts`
- Create: `tests/features/keyword-filter/filter-storage.test.ts`

- [ ] **Step 1: Create default-filters constant**

```typescript
// src/features/keyword-filter/default-filters.ts
export const DEFAULT_FILTER_LIST = `! Blue Badge Remover - 기본 필터 리스트 (Beta)
! 악성 파딱 키워드 필터

테슬라
년차`;
```

- [ ] **Step 2: Write failing tests for filter-storage**

```typescript
// tests/features/keyword-filter/filter-storage.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { getCustomFilterList, saveCustomFilterList } from '@features/keyword-filter/filter-storage';

const mockStorage: Record<string, unknown> = {};

vi.stubGlobal('chrome', {
  storage: {
    local: {
      get: vi.fn((keys: string[]) =>
        Promise.resolve(
          Object.fromEntries(
            keys.filter((k) => k in mockStorage).map((k) => [k, mockStorage[k]]),
          ),
        ),
      ),
      set: vi.fn((items: Record<string, unknown>) => {
        Object.assign(mockStorage, items);
        return Promise.resolve();
      }),
    },
  },
});

beforeEach(() => {
  Object.keys(mockStorage).forEach((k) => delete mockStorage[k]);
});

describe('getCustomFilterList', () => {
  it('should return empty string when storage is empty', async () => {
    const result = await getCustomFilterList();
    expect(result).toBe('');
  });

  it('should return stored filter list', async () => {
    mockStorage['customFilterList'] = '테슬라\n년차';
    const result = await getCustomFilterList();
    expect(result).toBe('테슬라\n년차');
  });
});

describe('saveCustomFilterList', () => {
  it('should save filter list to storage', async () => {
    await saveCustomFilterList('테슬라\n년차');
    expect(mockStorage['customFilterList']).toBe('테슬라\n년차');
  });
});
```

- [ ] **Step 3: Run test to verify it fails**

```bash
npx vitest run tests/features/keyword-filter/filter-storage.test.ts
```

Expected: FAIL — "Cannot find module '@features/keyword-filter/filter-storage'"

- [ ] **Step 4: Implement filter-storage**

```typescript
// src/features/keyword-filter/filter-storage.ts
import { STORAGE_KEYS } from '@shared/constants';

export async function getCustomFilterList(): Promise<string> {
  const result = await chrome.storage.local.get([STORAGE_KEYS.CUSTOM_FILTER_LIST]);
  return (result[STORAGE_KEYS.CUSTOM_FILTER_LIST] as string | undefined) ?? '';
}

export async function saveCustomFilterList(text: string): Promise<void> {
  await chrome.storage.local.set({ [STORAGE_KEYS.CUSTOM_FILTER_LIST]: text });
}
```

- [ ] **Step 5: Run test to verify it passes**

```bash
npx vitest run tests/features/keyword-filter/filter-storage.test.ts
```

Expected: PASS (3 tests)

- [ ] **Step 6: Commit**

```bash
git add src/features/keyword-filter/default-filters.ts src/features/keyword-filter/filter-storage.ts tests/features/keyword-filter/filter-storage.test.ts
git commit -m "feat(d5.5): add default filters and filter storage"
```

---

## Task 6: keyword-filter Public API

**Files:**
- Create: `src/features/keyword-filter/index.ts`

- [ ] **Step 1: Create index.ts**

```typescript
// src/features/keyword-filter/index.ts
export { parseFilterList } from './filter-rule-parser';
export { matchesKeywordFilter } from './keyword-matcher';
export { ProfileCache } from './profile-cache';
export { DEFAULT_FILTER_LIST } from './default-filters';
export { getCustomFilterList, saveCustomFilterList } from './filter-storage';
```

- [ ] **Step 2: Run all tests**

```bash
npx vitest run
```

Expected: All tests pass (including the 4 new test files)

- [ ] **Step 3: Commit**

```bash
git add src/features/keyword-filter/index.ts
git commit -m "feat(d5): export keyword-filter public API"
```

---

## Task 7: Extend Fetch Interceptor with Profile Data (D5.2)

**Files:**
- Modify: `src/injected/fetch-interceptor.ts`

The fetch interceptor runs in page context and cannot use extension imports, so it duplicates constants. We need to add `PROFILE_DATA` to the local `MESSAGE_TYPES` object and add `extractProfileData()`.

- [ ] **Step 1: Add `PROFILE_DATA` to local MESSAGE_TYPES in fetch-interceptor.ts**

Replace the `MESSAGE_TYPES` const block (lines 6–12):

```typescript
const MESSAGE_TYPES = {
  BADGE_DATA: 'BBR_BADGE_DATA',
  TOKEN_DATA: 'BBR_TOKEN_DATA',
  USER_ID: 'BBR_USER_ID',
  CSRF_TOKEN: 'BBR_CSRF_TOKEN',
  FOLLOW_DATA: 'BBR_FOLLOW_DATA',
  PROFILE_DATA: 'BBR_PROFILE_DATA',
} as const;
```

- [ ] **Step 2: Call `extractProfileData` in the GraphQL intercept block**

In the `if (isGraphQL)` block (around line 56), add one line after `extractViewerUserId(data)`:

```typescript
      extractBadgeData(data);
      extractViewerUserId(data);
      extractProfileData(data);  // ← add this line
```

- [ ] **Step 3: Add `extractProfileData` and `findProfileObjects` at the bottom of the file**

Append after the existing `findUserObjects` function:

```typescript
interface ProfileEntry {
  userId: string;
  handle: string;
  displayName: string;
  bio: string;
}

function extractProfileData(data: unknown): void {
  const profiles: ProfileEntry[] = [];
  findProfileObjects(data, profiles);
  if (profiles.length > 0) {
    window.postMessage({ type: MESSAGE_TYPES.PROFILE_DATA, profiles }, '*');
  }
}

function findProfileObjects(obj: unknown, result: ProfileEntry[]): void {
  if (obj === null || typeof obj !== 'object') return;
  const record = obj as Record<string, unknown>;

  if (
    'rest_id' in record &&
    'is_blue_verified' in record &&
    'legacy' in record &&
    typeof record['rest_id'] === 'string'
  ) {
    const legacy = record['legacy'] as Record<string, unknown> | null;
    if (legacy) {
      result.push({
        userId: record['rest_id'] as string,
        handle: typeof legacy['screen_name'] === 'string' ? legacy['screen_name'] : '',
        displayName: typeof legacy['name'] === 'string' ? legacy['name'] : '',
        bio: typeof legacy['description'] === 'string' ? legacy['description'] : '',
      });
    }
  }

  for (const value of Object.values(record)) {
    if (Array.isArray(value)) {
      value.forEach((item) => findProfileObjects(item, result));
    } else if (typeof value === 'object') {
      findProfileObjects(value, result);
    }
  }
}
```

- [ ] **Step 4: Run all tests**

```bash
npx vitest run
```

Expected: All tests pass (constants sync test now asserts PROFILE_DATA)

- [ ] **Step 5: Commit**

```bash
git add src/injected/fetch-interceptor.ts
git commit -m "feat(d5.2): extract profile data in fetch interceptor"
```

---

## Task 8: Content Script Integration (D5.2, D5.3)

**Files:**
- Modify: `src/content/index.ts`

- [ ] **Step 1: Add imports at the top of `src/content/index.ts`**

After the last existing `import` line, add:

```typescript
import { ProfileCache, parseFilterList, matchesKeywordFilter, DEFAULT_FILTER_LIST, getCustomFilterList } from '@features/keyword-filter';
import type { FilterRule } from '@shared/types';
```

- [ ] **Step 2: Add module-scope variables after the existing ones (after `let feedObserver: FeedObserver;`)**

```typescript
const profileCache = new ProfileCache();
let activeFilterRules: FilterRule[] = [];
```

- [ ] **Step 3: Add `loadFilterRules` function before `init()`**

```typescript
async function loadFilterRules(): Promise<void> {
  const custom = await getCustomFilterList();
  activeFilterRules = parseFilterList(DEFAULT_FILTER_LIST + '\n' + custom);
}
```

- [ ] **Step 4: Call `loadFilterRules` in `init()`, after `currentSettings = await getSettings()`**

```typescript
async function init(): Promise<void> {
  currentSettings = await getSettings();
  await loadFilterRules();  // ← add this line
  // ... rest of existing init ...
```

- [ ] **Step 5: Add PROFILE_DATA handler inside `listenForMessages()`**

In `listenForMessages()`, after the existing `FOLLOW_DATA` block, add:

```typescript
    if (event.data?.type === MESSAGE_TYPES.PROFILE_DATA) {
      for (const p of event.data.profiles as Array<{
        userId: string;
        handle: string;
        displayName: string;
        bio: string;
      }>) {
        profileCache.set(p.userId, { handle: p.handle, displayName: p.displayName, bio: p.bio });
      }
    }
```

- [ ] **Step 6: Watch for CUSTOM_FILTER_LIST changes in `listenForSettingsChanges()`**

In `listenForSettingsChanges()`, after the `whitelistChange` block, add:

```typescript
    const filterListChange = changes[STORAGE_KEYS.CUSTOM_FILTER_LIST];
    if (filterListChange) {
      void loadFilterRules();
    }
```

- [ ] **Step 7: Apply keyword filter in `processTweet()`**

In `processTweet()`, replace the `if (isFadak && !inFollow)` block:

```typescript
  if (isFadak && !inFollow) {
    if (currentSettings.keywordFilterEnabled && currentSettings.filterMode === 'keyword') {
      const cached = profileCache.get(userId);
      const profile = cached ?? {
        handle,
        displayName: extractDisplayName(tweetEl, handle),
        bio: '',
      };
      const { matched } = matchesKeywordFilter(profile, activeFilterRules);
      if (!matched) return;
    }
    const hide = shouldHideTweet({
      settings: currentSettings,
      followList: new Set<string>(),
      whitelist: whitelistSet,
      isFadak: true,
      userId,
      handle: `@${handle}`,
      pageType: getPageType(),
    });
    if (hide) {
      hideTweet(tweetEl, currentSettings.hideMode, { reason: 'fadak', handle: `@${handle}` });
      return;
    }
  }
```

- [ ] **Step 8: Run typecheck and all tests**

```bash
npx tsc --noEmit
npx vitest run
```

Expected: No type errors; all tests pass.

- [ ] **Step 9: Commit**

```bash
git add src/content/index.ts
git commit -m "feat(d5.3): integrate keyword filter into content script"
```

---

## Task 9: i18n Additions for Popup (D5.4)

**Files:**
- Modify: `src/shared/i18n.ts`

- [ ] **Step 1: Add 5 new keys to `TranslationKeys` type (after the last `|` entry before the closing semicolon)**

```typescript
  | 'keywordFilterBeta'
  | 'filterModeLabel'
  | 'filterModeAll'
  | 'filterModeKeyword'
  | 'advancedFilterSettings'
```

- [ ] **Step 2: Add Korean translations to the `ko` object**

```typescript
  keywordFilterBeta: '[Beta] 키워드 필터',
  filterModeLabel: '필터 모드',
  filterModeAll: '전체 숨김',
  filterModeKeyword: '키워드만 숨김',
  advancedFilterSettings: '고급 필터 설정',
```

- [ ] **Step 3: Add English translations to the `en` object**

```typescript
  keywordFilterBeta: '[Beta] Keyword Filter',
  filterModeLabel: 'Filter Mode',
  filterModeAll: 'Hide All',
  filterModeKeyword: 'Keyword Only',
  advancedFilterSettings: 'Advanced Filter Settings',
```

- [ ] **Step 4: Add Japanese translations to the `ja` object**

```typescript
  keywordFilterBeta: '[Beta] キーワードフィルター',
  filterModeLabel: 'フィルターモード',
  filterModeAll: 'すべて非表示',
  filterModeKeyword: 'キーワードのみ非表示',
  advancedFilterSettings: '高度なフィルター設定',
```

- [ ] **Step 5: Run typecheck**

```bash
npx tsc --noEmit
```

Expected: No errors (all 3 language objects must have all `TranslationKeys`, TypeScript will error if any are missing).

- [ ] **Step 6: Commit**

```bash
git add src/shared/i18n.ts
git commit -m "feat(d5.4): add i18n keys for keyword filter UI"
```

---

## Task 10: Popup UI Changes (D5.4, D5.6)

**Files:**
- Modify: `src/popup/index.html`
- Modify: `src/popup/index.ts`

- [ ] **Step 1: Add beta section to `src/popup/index.html`**

Insert the following block **before** the `<div class="section">` that contains `data-i18n="developer"`:

```html
    <div class="section">
      <label class="toggle-row">
        <span data-i18n="keywordFilterBeta">[Beta] 키워드 필터</span>
        <input type="checkbox" id="keywordFilterEnabled">
      </label>
      <div id="filter-mode-group" style="display:none; margin-top:12px;">
        <p class="desc" data-i18n="filterModeLabel">필터 모드</p>
        <label class="radio-row">
          <input type="radio" name="filterMode" value="all" checked>
          <span data-i18n="filterModeAll">전체 숨김</span>
        </label>
        <label class="radio-row">
          <input type="radio" name="filterMode" value="keyword">
          <span data-i18n="filterModeKeyword">키워드만 숨김</span>
        </label>
        <button id="open-options-btn" class="btn-secondary" style="margin-top:8px;" data-i18n="advancedFilterSettings">고급 필터 설정</button>
      </div>
    </div>
```

- [ ] **Step 2: Update `renderSettings()` in `src/popup/index.ts`**

At the end of `renderSettings()`, add:

```typescript
  (document.getElementById('keywordFilterEnabled') as HTMLInputElement).checked =
    settings.keywordFilterEnabled;
  const filterModeGroup = document.getElementById('filter-mode-group') as HTMLElement;
  filterModeGroup.style.display = settings.keywordFilterEnabled ? 'block' : 'none';
  const filterModeRadio = document.querySelector(
    `input[name="filterMode"][value="${settings.filterMode}"]`,
  ) as HTMLInputElement | null;
  if (filterModeRadio) filterModeRadio.checked = true;
```

- [ ] **Step 3: Update the `save` function inside `bindEvents()` in `src/popup/index.ts`**

At the end of the assignments inside `save`, before `await saveSettings(settings)`, add:

```typescript
    settings.keywordFilterEnabled = (
      document.getElementById('keywordFilterEnabled') as HTMLInputElement
    ).checked;
    settings.filterMode =
      (
        (document.querySelector('input[name="filterMode"]:checked') as HTMLInputElement | null)
          ?.value as Settings['filterMode']
      ) ?? 'all';
```

- [ ] **Step 4: Add event handlers in `bindEvents()` in `src/popup/index.ts`**

After the `clear-cache-btn` handler, add:

```typescript
  document.getElementById('keywordFilterEnabled')!.addEventListener('change', async () => {
    const enabled = (document.getElementById('keywordFilterEnabled') as HTMLInputElement).checked;
    const filterModeGroup = document.getElementById('filter-mode-group') as HTMLElement;
    filterModeGroup.style.display = enabled ? 'block' : 'none';
    await save();
  });

  document.getElementById('open-options-btn')!.addEventListener('click', () => {
    chrome.runtime.openOptionsPage();
  });
```

- [ ] **Step 5: Run typecheck and all tests**

```bash
npx tsc --noEmit
npx vitest run
```

Expected: No type errors; all tests pass.

- [ ] **Step 6: Commit**

```bash
git add src/popup/index.html src/popup/index.ts
git commit -m "feat(d5.4): add keyword filter beta section to popup"
```

---

## Task 11: Options Page and Manifest (D5.6)

**Files:**
- Create: `src/options/index.html`
- Create: `src/options/index.ts`
- Create: `src/options/style.css`
- Modify: `src/manifest.json`

- [ ] **Step 1: Create `src/options/index.html`**

```html
<!DOCTYPE html>
<html lang="ko">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <link rel="stylesheet" href="style.css">
  <title>Blue Badge Remover - 고급 필터 설정</title>
</head>
<body>
  <div class="container">
    <header>
      <h1>Blue Badge Remover</h1>
      <p class="subtitle">고급 필터 설정 (Beta)</p>
    </header>

    <section class="section">
      <h2>📋 내장 필터 <span class="readonly-badge">읽기 전용</span></h2>
      <textarea id="builtin-filters" class="filter-textarea" readonly></textarea>
    </section>

    <section class="section">
      <h2>✏️ 커스텀 필터</h2>
      <textarea
        id="custom-filters"
        class="filter-textarea"
        placeholder="키워드를 한 줄에 하나씩 입력하세요&#10;예: 테슬라&#10;예: @@gooduser (예외)&#10;예: *coin* (와일드카드)"
      ></textarea>
      <button id="save-btn" class="btn-primary">저장</button>
      <p id="save-status" class="save-status"></p>
    </section>

    <section class="section">
      <p id="rule-stats" class="rule-stats"></p>
    </section>

    <section class="section guide">
      <h2>📖 문법 가이드</h2>
      <ul>
        <li>한 줄에 하나의 키워드</li>
        <li><code>!</code> 주석 (무시됨)</li>
        <li><code>*</code> 와일드카드 (예: <code>*coin*</code>)</li>
        <li><code>@@handle</code> 예외 (숨기지 않을 계정)</li>
      </ul>
    </section>
  </div>
  <script type="module" src="index.ts"></script>
</body>
</html>
```

- [ ] **Step 2: Create `src/options/index.ts`**

```typescript
// src/options/index.ts
import {
  DEFAULT_FILTER_LIST,
  getCustomFilterList,
  saveCustomFilterList,
  parseFilterList,
} from '@features/keyword-filter';

async function init(): Promise<void> {
  const builtinEl = document.getElementById('builtin-filters') as HTMLTextAreaElement;
  const customEl = document.getElementById('custom-filters') as HTMLTextAreaElement;
  const saveBtn = document.getElementById('save-btn') as HTMLButtonElement;
  const saveStatus = document.getElementById('save-status') as HTMLParagraphElement;
  const ruleStats = document.getElementById('rule-stats') as HTMLParagraphElement;

  builtinEl.value = DEFAULT_FILTER_LIST;

  const customText = await getCustomFilterList();
  customEl.value = customText;

  updateStats(DEFAULT_FILTER_LIST, customText, ruleStats);

  saveBtn.addEventListener('click', async () => {
    const text = customEl.value;
    try {
      await saveCustomFilterList(text);
      updateStats(DEFAULT_FILTER_LIST, text, ruleStats);
      saveStatus.textContent = '저장되었습니다.';
      saveStatus.className = 'save-status success';
    } catch {
      saveStatus.textContent = '저장에 실패했습니다.';
      saveStatus.className = 'save-status error';
    }
    setTimeout(() => {
      saveStatus.textContent = '';
    }, 2000);
  });
}

function updateStats(
  builtin: string,
  custom: string,
  el: HTMLParagraphElement,
): void {
  const allRules = parseFilterList(builtin + '\n' + custom);
  const nonEmptyNonComment = (builtin + '\n' + custom)
    .split('\n')
    .filter((l) => {
      const t = l.trim();
      return t.length > 0 && !t.startsWith('!');
    }).length;
  const errorCount = Math.max(0, nonEmptyNonComment - allRules.length);
  el.textContent = `활성 규칙: ${allRules.length}개 | 파싱 에러: ${errorCount}개`;
}

init();
```

- [ ] **Step 3: Create `src/options/style.css`**

```css
/* src/options/style.css */
* { margin: 0; padding: 0; box-sizing: border-box; }

body {
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
  font-size: 14px;
  color: #e7e9ea;
  background: #15202b;
  line-height: 1.6;
}

.container {
  max-width: 640px;
  margin: 0 auto;
  padding: 32px 24px;
}

header {
  margin-bottom: 32px;
}

header h1 {
  font-size: 20px;
  font-weight: 700;
}

.subtitle {
  color: #71767b;
  font-size: 13px;
  margin-top: 4px;
}

.section {
  margin-bottom: 28px;
  padding-bottom: 24px;
  border-bottom: 1px solid rgba(56, 68, 77, 0.5);
}

.section:last-child {
  border-bottom: none;
}

.section h2 {
  font-size: 15px;
  font-weight: 600;
  margin-bottom: 12px;
  display: flex;
  align-items: center;
  gap: 8px;
}

.readonly-badge {
  font-size: 11px;
  font-weight: 400;
  background: #273340;
  border: 1px solid #38444d;
  color: #71767b;
  padding: 2px 8px;
  border-radius: 12px;
}

.filter-textarea {
  width: 100%;
  min-height: 120px;
  background: #1e2732;
  border: 1px solid #38444d;
  color: #e7e9ea;
  padding: 12px;
  border-radius: 8px;
  font-family: 'Courier New', monospace;
  font-size: 13px;
  resize: vertical;
  outline: none;
  transition: border-color 0.15s;
}

.filter-textarea:focus {
  border-color: #1d9bf0;
}

.filter-textarea[readonly] {
  opacity: 0.6;
  cursor: not-allowed;
  resize: none;
}

.btn-primary {
  margin-top: 12px;
  background: #1d9bf0;
  color: #fff;
  border: none;
  padding: 8px 20px;
  border-radius: 20px;
  font-size: 14px;
  font-weight: 600;
  cursor: pointer;
  transition: background 0.15s;
}

.btn-primary:hover {
  background: #1a8cd8;
}

.save-status {
  margin-top: 8px;
  font-size: 13px;
  min-height: 20px;
}

.save-status.success { color: #00ba7c; }
.save-status.error { color: #f4212e; }

.rule-stats {
  color: #71767b;
  font-size: 13px;
}

.guide ul {
  padding-left: 20px;
  color: #71767b;
  font-size: 13px;
}

.guide ul li {
  margin-bottom: 4px;
}

.guide code {
  background: #273340;
  padding: 1px 5px;
  border-radius: 4px;
  font-family: 'Courier New', monospace;
  font-size: 12px;
  color: #e7e9ea;
}
```

- [ ] **Step 4: Add `options_page` to `src/manifest.json`**

Add `"options_page": "src/options/index.html"` after the `"default_locale"` line:

```json
{
  "manifest_version": 3,
  "name": "__MSG_extName__",
  "version": "1.0.2",
  "description": "__MSG_extDescription__",
  "default_locale": "ko",
  "options_page": "src/options/index.html",
  "permissions": ["storage"],
  ...
}
```

- [ ] **Step 5: Run all tests and build**

```bash
npx vitest run
```

Expected: All tests pass.

```bash
npm run build
```

Expected: Build succeeds and the output includes the options page HTML.

- [ ] **Step 6: Commit**

```bash
git add src/options/index.html src/options/index.ts src/options/style.css src/manifest.json
git commit -m "feat(d5.6): add options page for filter list management"
```

---

## Verification Checklist

After all tasks complete:

- [ ] `npm run build` — 빌드 성공, options page 포함
- [ ] 수동 테스트: 확장프로그램 로드 → 팝업 열기 → `[Beta] 키워드 필터` 토글 ON → 필터 모드 라디오 노출 확인
- [ ] 수동 테스트: `키워드만 숨김` 선택 → X.com에서 `테슬라` 포함 bio 파딱 트윗만 숨김 확인
- [ ] 수동 테스트: `고급 필터 설정` 버튼 → 옵션 페이지 새 탭 열림 확인
- [ ] 수동 테스트: 옵션 페이지에서 커스텀 키워드 추가 → 저장 → 즉시 반영 확인
- [ ] 수동 테스트: `keywordFilterEnabled: false` (기본값) → 기존 동작(모든 파딱 숨김) 유지 확인
