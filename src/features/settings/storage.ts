import { browser } from 'wxt/browser';
import type { Settings } from '@shared/types';
import { DEFAULT_SETTINGS, MESSAGE_TYPES, STORAGE_KEYS } from '@shared/constants';
import type { WhitelistRequest, WhitelistResponse } from './whitelist-storage';

export type SettingsPatch = Partial<Omit<Settings, 'filter'>> & { filter?: Partial<Settings['filter']> };

function mergeSettings(base: Partial<Settings> | undefined, patch: SettingsPatch = {}): Settings {
  return {
    ...DEFAULT_SETTINGS,
    ...base,
    ...patch,
    filter: { ...DEFAULT_SETTINGS.filter, ...base?.filter, ...patch.filter },
  };
}

/** 항상 새 객체를 반환 — 호출부가 수정해도 DEFAULT_SETTINGS가 오염되지 않는다 */
export async function getSettings(): Promise<Settings> {
  const result = await browser.storage.local.get([STORAGE_KEYS.SETTINGS]);
  return mergeSettings(result[STORAGE_KEYS.SETTINGS] as Partial<Settings> | undefined);
}

/**
 * 최신 저장값을 다시 읽어 변경분만 병합해 저장한다.
 * 화면을 연 시점의 설정 스냅샷을 통째로 저장하면 다른 화면(options 등)의 변경을 되돌린다.
 */
export async function updateSettings(patch: SettingsPatch): Promise<Settings> {
  const merged = mergeSettings(await getSettings(), patch);
  await browser.storage.local.set({ [STORAGE_KEYS.SETTINGS]: merged });
  return merged;
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

/** 백업 가져오기용 — 목록 전체를 background 큐에서 교체한다 */
export async function replaceWhitelist(handles: string[]): Promise<void> {
  await sendWhitelistRequest({
    type: MESSAGE_TYPES.WHITELIST,
    operation: 'replace',
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
