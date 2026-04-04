// src/content/filter-pipeline.ts
// 필터 규칙 로드 파이프라인: 기본 필터 + 커스텀 + 팩을 하나의 FilterRule[]로 병합.
import { browser } from 'wxt/browser';
import { DEFAULT_FILTER_LIST, getCustomFilterList, buildActiveRules, parseCategories, buildFilterTextFromCategories, parseFilterList } from '@features/keyword-filter';
import { getActiveFilterPacks } from '@features/filter-pack';
import { STORAGE_KEYS } from '@shared/constants';
import type { FilterRule } from '@shared/types';
import { getSettings, setActiveFilterRules } from './state';

function tagRulesWithPack(rules: FilterRule[], packId: string, defaultCategory?: string): FilterRule[] {
  return rules.map((rule) => ({ ...rule, packId, category: rule.category ?? defaultCategory }));
}

export async function loadFilterRules(): Promise<void> {
  const settings = getSettings();
  const [custom, stored] = await Promise.all([
    getCustomFilterList(),
    browser.storage.local.get([STORAGE_KEYS.DISABLED_FILTER_CATEGORIES]),
  ]);
  const disabledCategories = (stored[STORAGE_KEYS.DISABLED_FILTER_CATEGORIES] as string[] | undefined) ?? [];
  const categories = parseCategories(DEFAULT_FILTER_LIST);
  const activeBuiltinText = buildFilterTextFromCategories(categories, disabledCategories);
  const baseRules = buildActiveRules(settings.defaultFilterEnabled, activeBuiltinText, custom);

  // 활성 팩 규칙 병합
  let packRules: FilterRule[] = [];
  try {
    const activePacks = await getActiveFilterPacks();
    for (const pack of activePacks) {
      const parsed = parseFilterList(pack.rules);
      packRules = packRules.concat(tagRulesWithPack(parsed, pack.id, pack.category));
    }
  } catch {
    // 팩 로드 실패 시 조용히 무시 — 기본+커스텀 규칙은 정상 동작
  }

  setActiveFilterRules([...baseRules, ...packRules]);
}
