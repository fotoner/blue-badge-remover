import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { FilterPack } from '@shared/types';

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

const {
  getFilterPacks,
  saveFilterPack,
  getActiveFilterPacks,
  toggleFilterPack,
  removeFilterPack,
} = await import('@features/filter-pack/pack-storage');

function makePack(overrides: Partial<FilterPack> = {}): FilterPack {
  return {
    id: 'test-pack',
    name: 'Test Pack',
    description: 'A test filter pack',
    author: 'tester',
    version: '1.0.0',
    updatedAt: '2026-01-01',
    rules: '테슬라\n투자',
    ...overrides,
  };
}

beforeEach(() => {
  store.clear();
});

describe('getFilterPacks', () => {
  it('returns empty array when none saved', async () => {
    const packs = await getFilterPacks();
    expect(packs).toEqual([]);
  });
});

describe('saveFilterPack', () => {
  it('inserts new pack with enabled:false', async () => {
    const pack = makePack();
    await saveFilterPack(pack);

    const entries = await getFilterPacks();
    expect(entries).toHaveLength(1);
    expect(entries[0]!.pack.id).toBe('test-pack');
    expect(entries[0]!.enabled).toBe(false);
  });

  it('updates existing pack by id, preserves enabled state', async () => {
    const pack = makePack();
    await saveFilterPack(pack);
    await toggleFilterPack('test-pack', true);

    const updatedPack = makePack({ version: '2.0.0', name: 'Updated Pack' });
    await saveFilterPack(updatedPack);

    const entries = await getFilterPacks();
    expect(entries).toHaveLength(1);
    expect(entries[0]!.pack.version).toBe('2.0.0');
    expect(entries[0]!.pack.name).toBe('Updated Pack');
    expect(entries[0]!.enabled).toBe(true); // preserved
  });
});

describe('getActiveFilterPacks', () => {
  it('returns only enabled packs', async () => {
    await saveFilterPack(makePack({ id: 'pack-a', name: 'Pack A' }));
    await saveFilterPack(makePack({ id: 'pack-b', name: 'Pack B' }));
    await toggleFilterPack('pack-b', true);

    const active = await getActiveFilterPacks();
    expect(active).toHaveLength(1);
    expect(active[0]!.id).toBe('pack-b');
  });
});

describe('toggleFilterPack', () => {
  it('toggles enabled state', async () => {
    await saveFilterPack(makePack());

    await toggleFilterPack('test-pack', true);
    let entries = await getFilterPacks();
    expect(entries[0]!.enabled).toBe(true);

    await toggleFilterPack('test-pack', false);
    entries = await getFilterPacks();
    expect(entries[0]!.enabled).toBe(false);
  });
});

describe('removeFilterPack', () => {
  it('removes by id', async () => {
    await saveFilterPack(makePack({ id: 'pack-a' }));
    await saveFilterPack(makePack({ id: 'pack-b' }));

    await removeFilterPack('pack-a');

    const entries = await getFilterPacks();
    expect(entries).toHaveLength(1);
    expect(entries[0]!.pack.id).toBe('pack-b');
  });
});
