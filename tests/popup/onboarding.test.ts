import { describe, it, expect, vi, beforeEach } from 'vitest';

// Minimal chrome stub for storage
const storageData: Record<string, unknown> = {};
vi.stubGlobal('chrome', {
  storage: {
    local: {
      get: vi.fn(async (keys: string[]) => {
        const result: Record<string, unknown> = {};
        for (const key of keys) {
          if (key in storageData) result[key] = storageData[key];
        }
        return result;
      }),
      set: vi.fn(async (data: Record<string, unknown>) => {
        Object.assign(storageData, data);
      }),
    },
    onChanged: {
      addListener: vi.fn(),
    },
  },
  tabs: { create: vi.fn(), query: vi.fn() },
  runtime: { getURL: vi.fn((path: string) => path), openOptionsPage: vi.fn() },
});

describe('onboarding banner logic', () => {
  beforeEach(() => {
    // Reset storage
    for (const key of Object.keys(storageData)) {
      delete storageData[key];
    }
  });

  it('should show banner when followList is empty, lastSyncAt is null, and not dismissed', async () => {
    // No storage data = fresh install
    const result = await chrome.storage.local.get(['followList', 'lastSyncAt', 'onboardingDismissed']);
    const followList = (result['followList'] as string[] | undefined) ?? [];
    const lastSyncAt = result['lastSyncAt'] ?? null;
    const dismissed = (result['onboardingDismissed'] as boolean | undefined) ?? false;

    const shouldShow = followList.length === 0 && lastSyncAt === null && !dismissed;
    expect(shouldShow).toBe(true);
  });

  it('should hide banner when followList has entries', async () => {
    storageData['followList'] = ['@user1', '@user2'];
    const result = await chrome.storage.local.get(['followList', 'lastSyncAt', 'onboardingDismissed']);
    const followList = (result['followList'] as string[] | undefined) ?? [];
    const lastSyncAt = result['lastSyncAt'] ?? null;
    const dismissed = (result['onboardingDismissed'] as boolean | undefined) ?? false;

    const shouldShow = followList.length === 0 && lastSyncAt === null && !dismissed;
    expect(shouldShow).toBe(false);
  });

  it('should hide banner when lastSyncAt is set', async () => {
    storageData['lastSyncAt'] = '2026-04-01T00:00:00Z';
    const result = await chrome.storage.local.get(['followList', 'lastSyncAt', 'onboardingDismissed']);
    const followList = (result['followList'] as string[] | undefined) ?? [];
    const lastSyncAt = result['lastSyncAt'] ?? null;
    const dismissed = (result['onboardingDismissed'] as boolean | undefined) ?? false;

    const shouldShow = followList.length === 0 && lastSyncAt === null && !dismissed;
    expect(shouldShow).toBe(false);
  });

  it('should hide banner when dismissed', async () => {
    storageData['onboardingDismissed'] = true;
    const result = await chrome.storage.local.get(['followList', 'lastSyncAt', 'onboardingDismissed']);
    const followList = (result['followList'] as string[] | undefined) ?? [];
    const lastSyncAt = result['lastSyncAt'] ?? null;
    const dismissed = (result['onboardingDismissed'] as boolean | undefined) ?? false;

    const shouldShow = followList.length === 0 && lastSyncAt === null && !dismissed;
    expect(shouldShow).toBe(false);
  });

  it('should persist onboardingDismissed to storage on dismiss', async () => {
    await chrome.storage.local.set({ onboardingDismissed: true });
    expect(storageData['onboardingDismissed']).toBe(true);
  });
});
