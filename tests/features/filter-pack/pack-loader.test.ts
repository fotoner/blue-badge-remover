import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { FilterPack, FilterPackEntry } from '@shared/types';

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

const mockGetFilterPacks = vi.fn<() => Promise<FilterPackEntry[]>>();
const mockSaveFilterPack = vi.fn<(pack: FilterPack) => Promise<void>>();

vi.mock('@features/filter-pack/pack-storage', () => ({
  getFilterPacks: (...args: unknown[]) => mockGetFilterPacks(...(args as [])),
  saveFilterPack: (...args: unknown[]) => mockSaveFilterPack(...(args as [FilterPack])),
  getActiveFilterPacks: vi.fn().mockResolvedValue([]),
  toggleFilterPack: vi.fn().mockResolvedValue(undefined),
  removeFilterPack: vi.fn().mockResolvedValue(undefined),
}));

const mockFetch = vi.fn<(input: string | URL | Request, init?: RequestInit) => Promise<Response>>();
vi.stubGlobal('fetch', mockFetch);

const { fetchPack, updateAllPacks, shouldUpdate } = await import('@features/filter-pack/pack-loader');

function makePack(overrides: Partial<FilterPack> = {}): FilterPack {
  return {
    id: 'test-pack',
    name: 'Test Pack',
    description: 'desc',
    author: 'tester',
    version: '1.0.0',
    updatedAt: '2026-01-01',
    rules: 'keyword1\nkeyword2',
    ...overrides,
  };
}

beforeEach(() => {
  store.clear();
  vi.clearAllMocks();
  mockGetFilterPacks.mockResolvedValue([]);
  mockSaveFilterPack.mockResolvedValue(undefined);
});

describe('fetchPack', () => {
  it('parses valid JSON FilterPack', async () => {
    const pack = makePack();
    mockFetch.mockResolvedValue(new Response(JSON.stringify(pack), { status: 200 }));

    const result = await fetchPack('https://example.com/pack.json');
    expect(result.id).toBe('test-pack');
    expect(result.name).toBe('Test Pack');
    expect(result.rules).toBe('keyword1\nkeyword2');
  });

  it('throws on invalid JSON', async () => {
    mockFetch.mockResolvedValue(new Response('not json {{{', { status: 200 }));

    await expect(fetchPack('https://example.com/bad.json')).rejects.toThrow('Invalid pack format');
  });

  it('throws on HTTP error', async () => {
    mockFetch.mockResolvedValue(new Response('Not Found', { status: 404 }));

    await expect(fetchPack('https://example.com/missing.json')).rejects.toThrow('HTTP 404');
  });
});

describe('updateAllPacks (isNewerVersion indirectly)', () => {
  it('does not save when versions are the same', async () => {
    const localPack = makePack({ homepage: 'https://example.com/pack.json', version: '1.0.0' });
    mockGetFilterPacks.mockResolvedValue([{ pack: localPack, enabled: true }]);

    const remotePack = makePack({ version: '1.0.0' });
    mockFetch.mockResolvedValue(new Response(JSON.stringify(remotePack), { status: 200 }));

    await updateAllPacks();
    expect(mockSaveFilterPack).not.toHaveBeenCalled();
  });

  it('saves when remote version is newer', async () => {
    const localPack = makePack({ homepage: 'https://example.com/pack.json', version: '1.0.0' });
    mockGetFilterPacks.mockResolvedValue([{ pack: localPack, enabled: true }]);

    const remotePack = makePack({ version: '1.1.0' });
    mockFetch.mockResolvedValue(new Response(JSON.stringify(remotePack), { status: 200 }));

    await updateAllPacks();
    expect(mockSaveFilterPack).toHaveBeenCalledWith(expect.objectContaining({ version: '1.1.0' }));
  });

  it('handles shorter version string (e.g., 1.0 vs 1.0.1)', async () => {
    const localPack = makePack({ homepage: 'https://example.com/pack.json', version: '1.0' });
    mockGetFilterPacks.mockResolvedValue([{ pack: localPack, enabled: true }]);

    const remotePack = makePack({ version: '1.0.1' });
    mockFetch.mockResolvedValue(new Response(JSON.stringify(remotePack), { status: 200 }));

    await updateAllPacks();
    expect(mockSaveFilterPack).toHaveBeenCalledWith(expect.objectContaining({ version: '1.0.1' }));
  });

  it('skips packs without homepage', async () => {
    const localPack = makePack({ homepage: undefined, version: '1.0.0' });
    mockGetFilterPacks.mockResolvedValue([{ pack: localPack, enabled: true }]);

    await updateAllPacks();
    expect(mockFetch).not.toHaveBeenCalled();
  });
});

describe('shouldUpdate', () => {
  it('returns true when no last update', async () => {
    const result = await shouldUpdate();
    expect(result).toBe(true);
  });

  it('returns false within 24h', async () => {
    store.set('filterPackLastUpdate', Date.now() - 1000); // 1 second ago

    const result = await shouldUpdate();
    expect(result).toBe(false);
  });

  it('returns true after 24h', async () => {
    store.set('filterPackLastUpdate', Date.now() - 25 * 60 * 60 * 1000); // 25 hours ago

    const result = await shouldUpdate();
    expect(result).toBe(true);
  });
});
