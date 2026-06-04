import { browser } from 'wxt/browser';
import { STORAGE_KEYS } from '@shared/constants';

export async function getCustomFilterList(): Promise<string> {
  const result = await browser.storage.local.get([STORAGE_KEYS.CUSTOM_FILTER_LIST]);
  return (result[STORAGE_KEYS.CUSTOM_FILTER_LIST] as string | undefined) ?? '';
}

export async function saveCustomFilterList(text: string): Promise<void> {
  await browser.storage.local.set({ [STORAGE_KEYS.CUSTOM_FILTER_LIST]: text });
}

export async function getDisabledFilterCategories(): Promise<string[]> {
  const result = await browser.storage.local.get([STORAGE_KEYS.DISABLED_FILTER_CATEGORIES]);
  return (result[STORAGE_KEYS.DISABLED_FILTER_CATEGORIES] as string[] | undefined) ?? [];
}

export async function saveDisabledFilterCategories(categories: string[]): Promise<void> {
  await browser.storage.local.set({ [STORAGE_KEYS.DISABLED_FILTER_CATEGORIES]: categories });
}
