import { browser } from 'wxt/browser';
import {
  DEFAULT_FILTER_LIST,
  buildActiveRules,
  buildFilterTextFromCategories,
  parseCategories,
  parseFilterList,
} from '@features/keyword-filter';
import { getFilterPacks } from '@features/filter-pack';
import { STORAGE_KEYS } from '@shared/constants';

type FilterCategory = ReturnType<typeof parseCategories>[number];

export function renderCategories(
  container: HTMLDivElement,
  categories: FilterCategory[],
  disabledCategories: string[],
  masterEnabled: boolean,
): void {
  container.innerHTML = '';
  if (!masterEnabled) {
    container.innerHTML = '<p class="categories-disabled">내장 필터가 비활성화되어 있습니다</p>';
    return;
  }
  const disabledSet = new Set(disabledCategories);
  for (const category of categories) {
    container.appendChild(createCategoryCard(category, disabledSet, disabledCategories));
  }
}

function createCategoryCard(
  category: FilterCategory,
  disabledSet: Set<string>,
  disabledCategories: string[],
): HTMLElement {
  const card = document.createElement('div');
  const isDisabled = disabledSet.has(category.name);
  card.className = `category-card${isDisabled ? ' is-disabled' : ''}`;
  const header = document.createElement('label');
  header.className = 'category-header';
  const info = document.createElement('div');
  info.className = 'category-info';
  info.append(
    createTextElement('span', 'category-name', category.name),
    createTextElement('span', 'category-count', String(category.keywords.length)),
  );
  const toggle = document.createElement('input');
  toggle.type = 'checkbox';
  toggle.checked = !isDisabled;
  toggle.addEventListener('change', () => {
    void handleCategoryToggle(category.name, toggle.checked, disabledCategories, card);
  });
  header.append(info, toggle);
  const keywords = document.createElement('div');
  keywords.className = 'category-keywords';
  for (const keyword of category.keywords) {
    keywords.appendChild(createTextElement('span', 'keyword-chip', keyword));
  }
  card.append(header, keywords);
  return card;
}

function createTextElement(tag: 'span', className: string, text: string): HTMLSpanElement {
  const element = document.createElement(tag);
  element.className = className;
  element.textContent = text;
  return element;
}

async function handleCategoryToggle(
  categoryName: string,
  enabled: boolean,
  disabledCategories: string[],
  card: HTMLElement,
): Promise<void> {
  const index = disabledCategories.indexOf(categoryName);
  if (enabled && index !== -1) disabledCategories.splice(index, 1);
  if (!enabled && index === -1) disabledCategories.push(categoryName);
  card.classList.toggle('is-disabled', !enabled);
  await browser.storage.local.set({
    [STORAGE_KEYS.DISABLED_FILTER_CATEGORIES]: [...disabledCategories],
  });
  const custom = (document.getElementById('custom-filters') as HTMLTextAreaElement).value;
  const master = (document.getElementById('default-filter-enabled') as HTMLInputElement).checked;
  void updateStats(master, disabledCategories, custom);
}

export async function updateStats(
  defaultFilterEnabled: boolean,
  disabledCategories: string[],
  custom: string,
): Promise<void> {
  const categories = parseCategories(DEFAULT_FILTER_LIST);
  const builtinText = defaultFilterEnabled
    ? buildFilterTextFromCategories(categories, disabledCategories)
    : '';
  const activeRules = buildActiveRules(defaultFilterEnabled, builtinText, custom);
  const builtinCount = builtinText ? parseFilterList(builtinText).length : 0;
  const customCount = custom.trim() ? parseFilterList(custom).length : 0;
  const packCount = await countEnabledPackRules();
  setCount('active-rule-count', activeRules.length + packCount);
  setCount('builtin-rule-count', builtinCount);
  setCount('custom-rule-count', customCount);
  setCount('pack-rule-count', packCount);
}

async function countEnabledPackRules(): Promise<number> {
  try {
    const entries = await getFilterPacks();
    return entries.reduce((total, entry) => {
      if (!entry.enabled) return total;
      return total + entry.pack.rules.split('\n').filter(isRuleLine).length;
    }, 0);
  } catch {
    return 0;
  }
}

function isRuleLine(line: string): boolean {
  return Boolean(line.trim()) && !line.startsWith('!');
}

function setCount(id: string, count: number): void {
  const element = document.getElementById(id);
  if (element) element.textContent = String(count);
}
