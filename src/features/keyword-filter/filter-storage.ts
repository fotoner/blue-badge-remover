import { browser } from 'wxt/browser';
import { STORAGE_KEYS } from '@shared/constants';
import { normalizeProtectedKeywords } from './protection-matcher';

export async function getCustomFilterList(): Promise<string> {
  const result = await browser.storage.local.get([STORAGE_KEYS.CUSTOM_FILTER_LIST]);
  return (result[STORAGE_KEYS.CUSTOM_FILTER_LIST] as string | undefined) ?? '';
}

export async function saveCustomFilterList(text: string): Promise<void> {
  await browser.storage.local.set({ [STORAGE_KEYS.CUSTOM_FILTER_LIST]: text });
}

export async function getProtectedKeywords(): Promise<string[]> {
  const result = await browser.storage.local.get([STORAGE_KEYS.PROTECTED_KEYWORDS]);
  const stored = (result[STORAGE_KEYS.PROTECTED_KEYWORDS] as string[] | undefined) ?? [];
  return normalizeProtectedKeywords(stored);
}

export async function saveProtectedKeywords(values: string[]): Promise<void> {
  await browser.storage.local.set({
    [STORAGE_KEYS.PROTECTED_KEYWORDS]: normalizeProtectedKeywords(values),
  });
}
