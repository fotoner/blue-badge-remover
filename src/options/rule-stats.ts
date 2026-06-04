import {
  buildActiveRules,
  buildFilterTextFromCategories,
  parseFilterList,
  type FilterCategory,
} from '@features/keyword-filter';
import { getFilterPacks } from '@features/filter-pack';

interface UpdateStatsOptions {
  defaultFilterEnabled: boolean;
  disabledCategories: string[];
  custom: string;
  categories: FilterCategory[];
}

export async function updateStats({
  defaultFilterEnabled,
  disabledCategories,
  custom,
  categories,
}: UpdateStatsOptions): Promise<void> {
  const activeBuiltinText = defaultFilterEnabled
    ? buildFilterTextFromCategories(categories, disabledCategories)
    : '';
  const allRules = buildActiveRules(defaultFilterEnabled, activeBuiltinText, custom);
  const builtinRules = activeBuiltinText ? parseFilterList(activeBuiltinText).length : 0;
  const customRules = custom.trim() ? parseFilterList(custom).length : 0;
  const packRules = await countEnabledPackRules();

  setText('active-rule-count', String(allRules.length + packRules));
  setText('builtin-rule-count', String(builtinRules));
  setText('custom-rule-count', String(customRules));
  setText('pack-rule-count', String(packRules));
}

async function countEnabledPackRules(): Promise<number> {
  try {
    const entries = await getFilterPacks();
    return entries.reduce((total, entry) => {
      if (!entry.enabled) return total;
      return total + countRules(entry.pack.rules);
    }, 0);
  } catch {
    return 0;
  }
}

export function countRules(rules: string): number {
  return rules.split('\n').filter((line) => line.trim() && !line.startsWith('!')).length;
}

function setText(id: string, value: string): void {
  const el = document.getElementById(id);
  if (el) el.textContent = value;
}
