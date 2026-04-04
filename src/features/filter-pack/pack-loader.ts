// src/features/filter-pack/pack-loader.ts
// URL에서 FilterPack JSON 또는 텍스트를 로드. 자동 업데이트.
import { browser } from 'wxt/browser';
import type { FilterPack } from '@shared/types';
import { getFilterPacks, saveFilterPack } from './pack-storage';

const LAST_UPDATE_KEY = 'filterPackLastUpdate';

function isNewerVersion(local: string, remote: string): boolean {
  const l = local.split('.').map(Number);
  const r = remote.split('.').map(Number);
  for (let i = 0; i < Math.max(l.length, r.length); i++) {
    const lv = l[i] ?? 0;
    const rv = r[i] ?? 0;
    if (rv > lv) return true;
    if (rv < lv) return false;
  }
  return false;
}

export async function fetchPack(url: string): Promise<FilterPack> {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  const text = await response.text();

  // JSON 또는 텍스트 자동 감지
  try {
    const json = JSON.parse(text) as FilterPack;
    if (json.id && json.name && typeof json.rules === 'string') {
      return json;
    }
    throw new Error('Invalid FilterPack schema');
  } catch {
    // JSON이 아니면 텍스트 규칙으로 간주
    throw new Error('Invalid pack format: expected JSON with id, name, rules fields');
  }
}

export async function updateAllPacks(): Promise<void> {
  const entries = await getFilterPacks();
  for (const entry of entries) {
    if (!entry.pack.homepage) continue;
    try {
      const remote = await fetchPack(entry.pack.homepage);
      if (isNewerVersion(entry.pack.version, remote.version)) {
        await saveFilterPack(remote);
      }
    } catch {
      // 개별 팩 업데이트 실패 — 다음 cycle에서 재시도
    }
  }
  await browser.storage.local.set({ [LAST_UPDATE_KEY]: Date.now() });
}

export async function shouldUpdate(): Promise<boolean> {
  const result = await browser.storage.local.get([LAST_UPDATE_KEY]);
  const last = result[LAST_UPDATE_KEY] as number | undefined;
  if (!last) return true;
  return Date.now() - last > 24 * 60 * 60 * 1000;
}
