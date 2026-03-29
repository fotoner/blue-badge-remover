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

  it('should merge stored settings with defaults when fields are missing (migration)', async () => {
    mockStorage['settings'] = { enabled: true };
    const settings = await getSettings();
    expect(settings.enabled).toBe(true);
    expect(settings.keywordFilterEnabled).toBe(DEFAULT_SETTINGS.keywordFilterEnabled);
    expect(settings.filterMode).toBe(DEFAULT_SETTINGS.filterMode);
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
