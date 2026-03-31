import { describe, it, expect, vi, beforeEach } from 'vitest';
import { getSettings, saveSettings, getWhitelist, addToWhitelist, removeFromWhitelist } from '@features/settings/storage';
import { DEFAULT_SETTINGS } from '@shared/constants';

const mockStorage: Record<string, unknown> = {};

vi.stubGlobal('chrome', {
  storage: {
    local: {
      get: vi.fn((keys: string[]) =>
        Promise.resolve(
          Object.fromEntries(keys.filter((k) => k in mockStorage).map((k) => [k, mockStorage[k]])),
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

describe('getSettings', () => {
  it('should return default settings when storage is empty', async () => {
    const settings = await getSettings();
    expect(settings).toEqual(DEFAULT_SETTINGS);
  });

  it('should return stored settings', async () => {
    const custom = { ...DEFAULT_SETTINGS, enabled: false };
    mockStorage['settings'] = custom;
    const settings = await getSettings();
    expect(settings.enabled).toBe(false);
  });

  it('should fill missing top-level fields from defaults on upgrade', async () => {
    // Simulate a stored object that is missing some keys (e.g. future fields added in v1.1.0)
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const { debugMode, ...withoutDebugMode } = DEFAULT_SETTINGS;
    mockStorage['settings'] = withoutDebugMode;
    const settings = await getSettings();
    // Existing fields preserved
    expect(settings.enabled).toBe(DEFAULT_SETTINGS.enabled);
    // Missing field filled from default
    expect(settings.debugMode).toBe(DEFAULT_SETTINGS.debugMode);
  });

  it('should deep merge nested filter object', async () => {
    // Stored settings have filter without a new sub-key
    const partial = {
      ...DEFAULT_SETTINGS,
      filter: { timeline: false, replies: true, search: false },
    };
    mockStorage['settings'] = partial;
    const settings = await getSettings();
    expect(settings.filter.timeline).toBe(false);
    expect(settings.filter.replies).toBe(true);
    expect(settings.filter.search).toBe(false);
    // All default filter keys should exist
    for (const key of Object.keys(DEFAULT_SETTINGS.filter)) {
      expect(settings.filter).toHaveProperty(key);
    }
  });
});

describe('whitelist', () => {
  it('should return empty array when no whitelist', async () => {
    const list = await getWhitelist();
    expect(list).toEqual([]);
  });

  it('should add handle to whitelist', async () => {
    await addToWhitelist('@testuser');
    expect(mockStorage['whitelist']).toContain('@testuser');
  });

  it('should not add duplicate handle', async () => {
    mockStorage['whitelist'] = ['@testuser'];
    await addToWhitelist('@testuser');
    expect((mockStorage['whitelist'] as string[]).length).toBe(1);
  });

  it('should remove handle from whitelist', async () => {
    mockStorage['whitelist'] = ['@testuser', '@other'];
    await removeFromWhitelist('@testuser');
    expect(mockStorage['whitelist']).toEqual(['@other']);
  });
});
