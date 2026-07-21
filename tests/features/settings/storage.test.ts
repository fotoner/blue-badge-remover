import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { Mock } from 'vitest';
import { DEFAULT_SETTINGS } from '@shared/constants';

const mockStorage: Record<string, unknown> = {};

vi.mock('wxt/browser', () => ({
  browser: {
    storage: {
      local: {
        get: vi.fn((keys: string[]) =>
          Promise.resolve(
            Object.fromEntries(keys.filter((k: string) => k in mockStorage).map((k: string) => [k, mockStorage[k]])),
          ),
        ),
        set: vi.fn((items: Record<string, unknown>) => {
          Object.assign(mockStorage, items);
          return Promise.resolve();
        }),
      },
    },
  },
}));

// Dynamic import after mock is set up
const { getSettings, saveSettings, getWhitelist, addToWhitelist, removeFromWhitelist } = await import('@features/settings/storage');
const { browser } = await import('wxt/browser');

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
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const { debugMode, ...withoutDebugMode } = DEFAULT_SETTINGS;
    mockStorage['settings'] = withoutDebugMode;
    const settings = await getSettings();
    expect(settings.enabled).toBe(DEFAULT_SETTINGS.enabled);
    expect(settings.debugMode).toBe(DEFAULT_SETTINGS.debugMode);
  });

  it('should deep merge nested filter object', async () => {
    const partial = {
      ...DEFAULT_SETTINGS,
      filter: { timeline: false, replies: true, search: false },
    };
    mockStorage['settings'] = partial;
    const settings = await getSettings();
    expect(settings.filter.timeline).toBe(false);
    expect(settings.filter.replies).toBe(true);
    expect(settings.filter.search).toBe(false);
    for (const key of Object.keys(DEFAULT_SETTINGS.filter)) {
      expect(settings.filter).toHaveProperty(key);
    }
  });

  it('should merge stored settings with defaults when fields are missing (migration)', async () => {
    mockStorage['settings'] = { enabled: true };
    const settings = await getSettings();
    expect(settings.enabled).toBe(true);
    expect(settings.keywordFilterEnabled).toBe(DEFAULT_SETTINGS.keywordFilterEnabled);
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

  it('should store mixed-case handle as lowercase', async () => {
    await addToWhitelist('@MixedCase');
    expect(mockStorage['whitelist']).toEqual(['@mixedcase']);
  });

  it('should not add a duplicate when a normalized-equivalent handle already exists', async () => {
    mockStorage['whitelist'] = ['@mixedcase'];
    await addToWhitelist('@MixedCase');
    expect((mockStorage['whitelist'] as string[]).length).toBe(1);
  });

  it('should remove handle regardless of input case', async () => {
    mockStorage['whitelist'] = ['@foo', '@bar'];
    await removeFromWhitelist('@FOO');
    expect(mockStorage['whitelist']).toEqual(['@bar']);
  });

  it('should migrate mixed-case + duplicate storage on read', async () => {
    mockStorage['whitelist'] = ['@Foo', '@foo', '@bar'];
    const list = await getWhitelist();
    expect(list).toEqual(['@foo', '@bar']);
    expect(mockStorage['whitelist']).toEqual(['@foo', '@bar']);
  });

  it('should strip multiple leading "@" characters on migration', async () => {
    mockStorage['whitelist'] = ['@@Foo'];
    const list = await getWhitelist();
    expect(list).toEqual(['@foo']);
    expect(mockStorage['whitelist']).toEqual(['@foo']);
  });

  it('should perform exactly one write when migrating dirty storage', async () => {
    mockStorage['whitelist'] = ['@Foo', '@foo', '@bar'];
    const before = (browser.storage.local.set as Mock).mock.calls.length;
    await getWhitelist();
    const after = (browser.storage.local.set as Mock).mock.calls.length;
    expect(after - before).toBe(1);
  });

  it('should not write when storage is already clean', async () => {
    mockStorage['whitelist'] = ['@foo', '@bar'];
    const before = (browser.storage.local.set as Mock).mock.calls.length;
    const list = await getWhitelist();
    const after = (browser.storage.local.set as Mock).mock.calls.length;
    expect(after - before).toBe(0);
    expect(list).toEqual(['@foo', '@bar']);
  });

  it('should return empty array and perform zero writes when no whitelist is stored', async () => {
    const before = (browser.storage.local.set as Mock).mock.calls.length;
    const list = await getWhitelist();
    const after = (browser.storage.local.set as Mock).mock.calls.length;
    expect(list).toEqual([]);
    expect(after - before).toBe(0);
  });
});
