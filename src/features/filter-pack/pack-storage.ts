// src/features/filter-pack/pack-storage.ts
// FilterPack CRUD — chrome.storage.local 기반.
import { browser } from 'wxt/browser';
import type { FilterPack, FilterPackEntry } from '@shared/types';

const STORAGE_KEY = 'filterPacks';

async function readEntries(): Promise<FilterPackEntry[]> {
  const result = await browser.storage.local.get([STORAGE_KEY]);
  return (result[STORAGE_KEY] as FilterPackEntry[] | undefined) ?? [];
}

async function writeEntries(entries: FilterPackEntry[]): Promise<void> {
  await browser.storage.local.set({ [STORAGE_KEY]: entries });
}

export async function getFilterPacks(): Promise<FilterPackEntry[]> {
  return readEntries();
}

export async function getActiveFilterPacks(): Promise<FilterPack[]> {
  const entries = await readEntries();
  return entries.filter((e) => e.enabled).map((e) => e.pack);
}

export async function saveFilterPack(pack: FilterPack): Promise<void> {
  const entries = await readEntries();
  const idx = entries.findIndex((e) => e.pack.id === pack.id);
  if (idx >= 0) {
    entries[idx] = { pack, enabled: entries[idx].enabled };
  } else {
    entries.push({ pack, enabled: false });
  }
  await writeEntries(entries);
}

export async function removeFilterPack(id: string): Promise<void> {
  const entries = await readEntries();
  await writeEntries(entries.filter((e) => e.pack.id !== id));
}

export async function toggleFilterPack(id: string, enabled: boolean): Promise<void> {
  const entries = await readEntries();
  const entry = entries.find((e) => e.pack.id === id);
  if (entry) {
    entry.enabled = enabled;
    await writeEntries(entries);
  }
}
