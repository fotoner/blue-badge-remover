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

  // JSON 파싱 + 허용된 필드만 추출
  const json = JSON.parse(text) as Record<string, unknown>;
  if (!json.id || !json.name || typeof json.rules !== 'string') {
    throw new Error('Invalid pack format: expected JSON with id, name, rules fields');
  }
  return {
    id: String(json.id),
    name: String(json.name).slice(0, 100),
    description: typeof json.description === 'string' ? json.description.slice(0, 500) : '',
    author: typeof json.author === 'string' ? json.author.slice(0, 100) : '',
    version: typeof json.version === 'string' ? json.version.slice(0, 20) : '1.0.0',
    updatedAt: typeof json.updatedAt === 'string' ? json.updatedAt : new Date().toISOString(),
    rules: String(json.rules),
    category: typeof json.category === 'string' ? json.category.slice(0, 50) : undefined,
    homepage: typeof json.homepage === 'string' && json.homepage.startsWith('https://') ? json.homepage : undefined,
  };
}

export async function updateAllPacks(): Promise<void> {
  const entries = await getFilterPacks();
  let anySuccess = false;
  for (const entry of entries) {
    if (!entry.pack.homepage) continue;
    try {
      const remote = await fetchPack(entry.pack.homepage);
      if (isNewerVersion(entry.pack.version, remote.version)) {
        await saveFilterPack(remote);
      }
      anySuccess = true;
    } catch {
      // 개별 팩 업데이트 실패 — 다음 cycle에서 재시도
    }
  }
  if (anySuccess || entries.length === 0) {
    await browser.storage.local.set({ [LAST_UPDATE_KEY]: Date.now() });
  }
}

export async function shouldUpdate(): Promise<boolean> {
  const result = await browser.storage.local.get([LAST_UPDATE_KEY]);
  const last = result[LAST_UPDATE_KEY] as number | undefined;
  if (!last) return true;
  return Date.now() - last > 24 * 60 * 60 * 1000;
}
