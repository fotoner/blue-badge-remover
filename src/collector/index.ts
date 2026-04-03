// src/collector/index.ts
// 키워드 수집기 페이지 진입점
import { getCollectedFadaks } from '@features/keyword-collector';
import { getCustomFilterList, parseFilterList, DEFAULT_FILTER_LIST } from '@features/keyword-filter';
import type { CollectedFadak, FilterRule } from '@shared/types';
import { renderKeywords } from './keyword-chart';
import { renderList, renderStats, bindExportEvents } from './account-list';

let cachedList: CollectedFadak[] = [];
let filterRules: FilterRule[] = [];

async function loadFilterRules(): Promise<FilterRule[]> {
  const custom = await getCustomFilterList();
  return parseFilterList(DEFAULT_FILTER_LIST + '\n' + custom);
}

async function init(): Promise<void> {
  const [list, rules] = await Promise.all([getCollectedFadaks(), loadFilterRules()]);
  cachedList = list;
  filterRules = rules;
  renderStats(list);
  renderKeywords(list, filterRules);
  renderList(list);
  bindExportEvents();

  chrome.storage.onChanged.addListener((changes) => {
    if (changes['collectedFadaks']) {
      const updated = (changes['collectedFadaks'].newValue as CollectedFadak[] | undefined) ?? [];
      cachedList = updated;
      renderStats(updated);
      renderKeywords(updated, filterRules);
      renderList(updated);
    }
  });
}

init();
