import type { CollectedFadak } from '@shared/types';
import { STORAGE_KEYS } from '@shared/constants';

export async function getCollectedFadaks(): Promise<CollectedFadak[]> {
  const result = await chrome.storage.local.get([STORAGE_KEYS.COLLECTED_FADAKS]);
  return (result[STORAGE_KEYS.COLLECTED_FADAKS] as CollectedFadak[] | undefined) ?? [];
}

export async function saveCollectedFadaks(list: CollectedFadak[]): Promise<void> {
  await chrome.storage.local.set({ [STORAGE_KEYS.COLLECTED_FADAKS]: list });
}

export async function clearCollectedFadaks(): Promise<void> {
  await chrome.storage.local.set({ [STORAGE_KEYS.COLLECTED_FADAKS]: [] });
}
