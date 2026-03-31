import type { FilterRule } from '@shared/types';
import { parseFilterList } from './filter-rule-parser';

export function buildActiveRules(
  defaultFilterEnabled: boolean,
  defaultList: string,
  custom: string,
): FilterRule[] {
  const base = defaultFilterEnabled ? defaultList + '\n' : '';
  return parseFilterList(base + custom);
}
