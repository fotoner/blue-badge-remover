import type { Settings } from '@shared/types';
import { DEFAULT_SETTINGS, STORAGE_KEYS } from '@shared/constants';

export async function getSettings(): Promise<Settings> {
  const result = await chrome.storage.local.get([STORAGE_KEYS.SETTINGS]);
  const stored = result[STORAGE_KEYS.SETTINGS] as Partial<Settings> | undefined;
  if (!stored) return DEFAULT_SETTINGS;
  return {
    ...DEFAULT_SETTINGS,
    ...stored,
    filter: { ...DEFAULT_SETTINGS.filter, ...stored.filter },
  };
}

export async function saveSettings(settings: Settings): Promise<void> {
  await chrome.storage.local.set({ [STORAGE_KEYS.SETTINGS]: settings });
}

export async function getWhitelist(): Promise<string[]> {
  const result = await chrome.storage.local.get([STORAGE_KEYS.WHITELIST]);
  return (result[STORAGE_KEYS.WHITELIST] as string[] | undefined) ?? [];
}

export async function addToWhitelist(handle: string): Promise<void> {
  const list = await getWhitelist();
  if (!list.includes(handle)) {
    list.push(handle);
    await chrome.storage.local.set({ [STORAGE_KEYS.WHITELIST]: list });
  }
}

export async function removeFromWhitelist(handle: string): Promise<void> {
  const list = await getWhitelist();
  const filtered = list.filter((h) => h !== handle);
  await chrome.storage.local.set({ [STORAGE_KEYS.WHITELIST]: filtered });
}
