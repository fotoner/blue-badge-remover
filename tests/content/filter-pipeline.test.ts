import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { Settings, FilterPack, FilterRule } from '@shared/types';
import { DEFAULT_SETTINGS } from '@shared/constants';

const store = new Map<string, unknown>();

vi.mock('wxt/browser', () => ({
  browser: {
    storage: {
      local: {
        get: vi.fn(async (keys: string[] | null) => {
          if (keys === null) {
            const result: Record<string, unknown> = {};
            for (const [k, v] of store) result[k] = v;
            return result;
          }
          const result: Record<string, unknown> = {};
          for (const k of keys) {
            if (store.has(k)) result[k] = store.get(k);
          }
          return result;
        }),
        set: vi.fn(async (items: Record<string, unknown>) => {
          for (const [k, v] of Object.entries(items)) store.set(k, v);
        }),
        remove: vi.fn(async (keys: string[]) => {
          for (const k of keys) store.delete(k);
        }),
      },
    },
  },
}));

// Mock @features/keyword-filter
const mockParseCategories = vi.fn();
const mockParseFilterList = vi.fn();
const mockGetCustomFilterList = vi.fn();
const MOCK_DEFAULT_FILTER_LIST = `! Test Defaults

! Category A
keyword_a1
keyword_a2

! Category B
keyword_b1
`;

vi.mock('@features/keyword-filter', () => ({
  parseCategories: (...args: unknown[]) => mockParseCategories(...args),
  parseFilterList: (...args: unknown[]) => mockParseFilterList(...args),
  getCustomFilterList: (...args: unknown[]) => mockGetCustomFilterList(...args),
  DEFAULT_FILTER_LIST: MOCK_DEFAULT_FILTER_LIST,
}));

// Mock @features/filter-pack
const mockGetActiveFilterPacks = vi.fn<() => Promise<FilterPack[]>>();
vi.mock('@features/filter-pack', () => ({
  getActiveFilterPacks: (...args: unknown[]) => mockGetActiveFilterPacks(...(args as [])),
}));

// Mock ./state
let mockSettings: Settings = { ...DEFAULT_SETTINGS };
const capturedRules: FilterRule[][] = [];

vi.mock('../../src/content/state', () => ({
  getSettings: () => mockSettings,
  setActiveFilterRules: (rules: FilterRule[]) => {
    capturedRules.push(rules);
  },
}));

const { loadFilterRules } = await import('../../src/content/filter-pipeline');

beforeEach(() => {
  store.clear();
  vi.clearAllMocks();
  capturedRules.length = 0;
  mockSettings = { ...DEFAULT_SETTINGS, defaultFilterEnabled: true };
  mockGetCustomFilterList.mockResolvedValue('');
  mockGetActiveFilterPacks.mockResolvedValue([]);

  // Default parseCategories returns two categories
  mockParseCategories.mockReturnValue([
    { name: 'Category A', keywords: ['keyword_a1', 'keyword_a2'] },
    { name: 'Category B', keywords: ['keyword_b1'] },
  ]);

  // parseFilterList returns one rule per keyword line
  mockParseFilterList.mockImplementation((text: string) => {
    const lines = text.split('\n').filter((l: string) => l.trim());
    return lines.map((l: string) => ({ type: 'keyword', value: l.trim() }));
  });
});

describe('loadFilterRules', () => {
  it('loads builtin + custom + pack rules', async () => {
    mockGetCustomFilterList.mockResolvedValue('custom_word');
    const pack: FilterPack = {
      id: 'p1',
      name: 'Pack1',
      description: '',
      author: '',
      version: '1.0.0',
      updatedAt: '',
      rules: 'pack_word',
      category: 'PackCat',
    };
    mockGetActiveFilterPacks.mockResolvedValue([pack]);

    await loadFilterRules();

    expect(capturedRules).toHaveLength(1);
    const rules = capturedRules[0]!;
    // builtin: keyword_a1, keyword_a2, keyword_b1 = 3
    // custom: custom_word = 1
    // pack: pack_word = 1
    expect(rules.length).toBe(5);
  });

  it('excludes disabled categories', async () => {
    store.set('disabledFilterCategories', ['Category A']);

    await loadFilterRules();

    expect(capturedRules).toHaveLength(1);
    const rules = capturedRules[0]!;
    // Only Category B keyword remains from builtin
    const builtinValues = rules.map((r) => ('value' in r ? r.value : null)).filter(Boolean);
    expect(builtinValues).toContain('keyword_b1');
    expect(builtinValues).not.toContain('keyword_a1');
    expect(builtinValues).not.toContain('keyword_a2');
  });

  it('merges custom filter rules', async () => {
    mockGetCustomFilterList.mockResolvedValue('my_custom_keyword');

    await loadFilterRules();

    expect(capturedRules).toHaveLength(1);
    const rules = capturedRules[0]!;
    const values = rules.map((r) => ('value' in r ? r.value : null)).filter(Boolean);
    expect(values).toContain('my_custom_keyword');
  });

  it('does not crash when pack load fails (silent catch)', async () => {
    mockGetActiveFilterPacks.mockRejectedValue(new Error('network error'));

    await expect(loadFilterRules()).resolves.toBeUndefined();
    expect(capturedRules).toHaveLength(1);
    // Still has builtin rules
    expect(capturedRules[0]!.length).toBeGreaterThan(0);
  });

  it('produces no custom rules when custom filter is empty', async () => {
    mockGetCustomFilterList.mockResolvedValue('');

    await loadFilterRules();

    expect(capturedRules).toHaveLength(1);
    // Only builtin rules (3)
    expect(capturedRules[0]!.length).toBe(3);
  });

  it('skips builtin rules when defaultFilterEnabled=false', async () => {
    mockSettings = { ...DEFAULT_SETTINGS, defaultFilterEnabled: false };

    await loadFilterRules();

    expect(capturedRules).toHaveLength(1);
    // No builtin, no custom, no packs
    expect(capturedRules[0]!.length).toBe(0);
    expect(mockParseCategories).not.toHaveBeenCalled();
  });
});
