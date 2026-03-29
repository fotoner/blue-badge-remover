import { STORAGE_KEYS } from '@shared/constants';

export async function getCustomFilterList(): Promise<string> {
  const result = await chrome.storage.local.get([STORAGE_KEYS.CUSTOM_FILTER_LIST]);
  return (result[STORAGE_KEYS.CUSTOM_FILTER_LIST] as string | undefined) ?? '';
}

export async function saveCustomFilterList(text: string): Promise<void> {
  await chrome.storage.local.set({ [STORAGE_KEYS.CUSTOM_FILTER_LIST]: text });
}
