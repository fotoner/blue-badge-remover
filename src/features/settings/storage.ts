import { browser } from 'wxt/browser';
import type { Settings } from '@shared/types';
import { DEFAULT_SETTINGS, MESSAGE_TYPES, STORAGE_KEYS } from '@shared/constants';
import type { WhitelistRequest, WhitelistResponse } from './whitelist-storage';

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

async function sendWhitelistRequest(request: WhitelistRequest): Promise<WhitelistResponse> {
  const response = await browser.runtime.sendMessage(request) as WhitelistResponse | undefined;
  if (!response || !Array.isArray(response.whitelist)) {
    throw new Error('Whitelist background request failed');
  }
  return response;
}

export async function getWhitelist(): Promise<string[]> {
  const response = await sendWhitelistRequest({
    type: MESSAGE_TYPES.WHITELIST,
    operation: 'get',
  });
  return response.whitelist;
}

export async function addToWhitelist(handle: string): Promise<void> {
  await addManyToWhitelist([handle]);
}

export async function addManyToWhitelist(handles: string[]): Promise<void> {
  await sendWhitelistRequest({
    type: MESSAGE_TYPES.WHITELIST,
    operation: 'add',
    handles,
  });
}

export async function removeFromWhitelist(handle: string): Promise<void> {
  await sendWhitelistRequest({
    type: MESSAGE_TYPES.WHITELIST,
    operation: 'remove',
    handles: [handle],
  });
}
