import { browser } from 'wxt/browser';
import type { Settings } from '@shared/types';
import { DEFAULT_SETTINGS, STORAGE_KEYS } from '@shared/constants';

export async function getSettings(): Promise<Settings> {
  const result = await browser.storage.local.get([STORAGE_KEYS.SETTINGS]);
  const stored = result[STORAGE_KEYS.SETTINGS] as Partial<Settings> | undefined;
  if (!stored) return DEFAULT_SETTINGS;
  return {
    ...DEFAULT_SETTINGS,
    ...stored,
    filter: { ...DEFAULT_SETTINGS.filter, ...stored.filter },
  };
}

export async function saveSettings(settings: Settings): Promise<void> {
  await browser.storage.local.set({ [STORAGE_KEYS.SETTINGS]: settings });
}

function normalizeWhitelistEntry(handle: string): string {
  const stripped = handle.trim().replace(/^@+/, '');
  return `@${stripped.toLowerCase()}`;
}

function dedupeNormalized(list: string[]): string[] {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const raw of list) {
    const normalized = normalizeWhitelistEntry(raw);
    if (!seen.has(normalized)) {
      seen.add(normalized);
      result.push(normalized);
    }
  }
  return result;
}

function listsEqual(a: string[], b: string[]): boolean {
  return a.length === b.length && a.every((v, i) => v === b[i]);
}

export async function getWhitelist(): Promise<string[]> {
  const result = await browser.storage.local.get([STORAGE_KEYS.WHITELIST]);
  const stored = (result[STORAGE_KEYS.WHITELIST] as string[] | undefined) ?? [];
  const normalized = dedupeNormalized(stored);
  if (!listsEqual(stored, normalized)) {
    await browser.storage.local.set({ [STORAGE_KEYS.WHITELIST]: normalized });
  }
  return normalized;
}

export async function addToWhitelist(handle: string): Promise<void> {
  const normalized = normalizeWhitelistEntry(handle);
  const list = await getWhitelist();
  if (!list.includes(normalized)) {
    list.push(normalized);
    await browser.storage.local.set({ [STORAGE_KEYS.WHITELIST]: list });
  }
}

export async function removeFromWhitelist(handle: string): Promise<void> {
  const normalized = normalizeWhitelistEntry(handle);
  const list = await getWhitelist();
  const filtered = list.filter((h) => h !== normalized);
  await browser.storage.local.set({ [STORAGE_KEYS.WHITELIST]: filtered });
}
