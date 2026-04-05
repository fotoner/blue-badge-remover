// src/content/filter-pipeline.ts
// 필터 규칙 로드 파이프라인: 기본 필터 + 커스텀 + 팩을 하나의 FilterRule[]로 병합.
import { browser } from 'wxt/browser';
import { DEFAULT_FILTER_LIST, getCustomFilterList, parseCategories, parseFilterList } from '@features/keyword-filter';
import { getActiveFilterPacks } from '@features/filter-pack';
import { STORAGE_KEYS } from '@shared/constants';
import type { FilterRule } from '@shared/types';
import { getSettings, setActiveFilterRules } from './state';

function tagRules(rules: FilterRule[], category: string, packId?: string): FilterRule[] {
  return rules.map((rule) => ({ ...rule, category: rule.category ?? category, packId: packId ?? rule.packId }));
}

export async function loadFilterRules(): Promise<void> {
  const settings = getSettings();
  const [custom, stored] = await Promise.all([
    getCustomFilterList(),
    browser.storage.local.get([STORAGE_KEYS.DISABLED_FILTER_CATEGORIES]),
  ]);
  const disabledCategories = (stored[STORAGE_KEYS.DISABLED_FILTER_CATEGORIES] as string[] | undefined) ?? [];
  const disabledSet = new Set(disabledCategories);

  // 내장 필터: 카테고리별로 파싱 + 카테고리명 태깅
  let builtinRules: FilterRule[] = [];
  if (settings.defaultFilterEnabled) {
    const categories = parseCategories(DEFAULT_FILTER_LIST);
    for (const cat of categories) {
      if (disabledSet.has(cat.name)) continue;
      const rules = parseFilterList(cat.keywords.join('\n'));
      builtinRules = builtinRules.concat(tagRules(rules, cat.name));
    }
  }

  // 커스텀 필터
  const customRules = custom.trim() ? parseFilterList(custom) : [];

  // 팩 규칙
  let packRules: FilterRule[] = [];
  try {
    const activePacks = await getActiveFilterPacks();
    for (const pack of activePacks) {
      const parsed = parseFilterList(pack.rules);
      packRules = packRules.concat(tagRules(parsed, pack.category ?? pack.name, pack.id));
    }
  } catch {
    // 팩 로드 실패 시 조용히 무시
  }

  setActiveFilterRules([...builtinRules, ...customRules, ...packRules]);
}
