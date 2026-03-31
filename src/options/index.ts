import {
  DEFAULT_FILTER_LIST,
  getCustomFilterList,
  saveCustomFilterList,
  buildActiveRules,
  parseCategories,
  buildFilterTextFromCategories,
  parseFilterList,
} from '@features/keyword-filter';
import { getSettings, saveSettings } from '@features/settings';
import { STORAGE_KEYS } from '@shared/constants';

async function init(): Promise<void> {
  const customEl = document.getElementById('custom-filters') as HTMLTextAreaElement;
  const saveBtn = document.getElementById('save-btn') as HTMLButtonElement;
  const saveStatus = document.getElementById('save-status') as HTMLSpanElement;
  const defaultFilterToggle = document.getElementById('default-filter-enabled') as HTMLInputElement;
  const categoryListEl = document.getElementById('category-list') as HTMLDivElement;

  const categories = parseCategories(DEFAULT_FILTER_LIST);

  const [customText, settings, stored] = await Promise.all([
    getCustomFilterList(),
    getSettings(),
    chrome.storage.local.get([STORAGE_KEYS.DISABLED_FILTER_CATEGORIES]),
  ]);

  const disabledCategories: string[] =
    (stored[STORAGE_KEYS.DISABLED_FILTER_CATEGORIES] as string[] | undefined) ?? [];

  customEl.value = customText;
  defaultFilterToggle.checked = settings.defaultFilterEnabled;

  renderCategories(categoryListEl, categories, disabledCategories, settings.defaultFilterEnabled);
  updateStats(settings.defaultFilterEnabled, disabledCategories, customText);

  defaultFilterToggle.addEventListener('change', async () => {
    const current = await getSettings();
    const updated = { ...current, defaultFilterEnabled: defaultFilterToggle.checked };
    await saveSettings(updated);
    renderCategories(categoryListEl, categories, disabledCategories, defaultFilterToggle.checked);
    updateStats(defaultFilterToggle.checked, disabledCategories, customEl.value);
  });

  saveBtn.addEventListener('click', async () => {
    const text = customEl.value;
    try {
      await saveCustomFilterList(text);
      updateStats(defaultFilterToggle.checked, disabledCategories, text);
      saveStatus.textContent = '저장 완료';
      saveStatus.className = 'save-status success';
    } catch {
      saveStatus.textContent = '저장 실패';
      saveStatus.className = 'save-status error';
    }
    setTimeout(() => { saveStatus.textContent = ''; }, 2000);
  });
}

function renderCategories(
  container: HTMLDivElement,
  categories: ReturnType<typeof parseCategories>,
  disabledCategories: string[],
  masterEnabled: boolean,
): void {
  container.innerHTML = '';
  if (!masterEnabled) {
    container.innerHTML = '<p class="categories-disabled">내장 필터가 비활성화되어 있습니다</p>';
    return;
  }

  const disabledSet = new Set(disabledCategories);

  for (const cat of categories) {
    const isDisabled = disabledSet.has(cat.name);

    const card = document.createElement('div');
    card.className = 'category-card' + (isDisabled ? ' is-disabled' : '');

    const header = document.createElement('label');
    header.className = 'category-header';

    const info = document.createElement('div');
    info.className = 'category-info';

    const name = document.createElement('span');
    name.className = 'category-name';
    name.textContent = cat.name;

    const count = document.createElement('span');
    count.className = 'category-count';
    count.textContent = `${cat.keywords.length}`;

    info.appendChild(name);
    info.appendChild(count);

    const toggle = document.createElement('input');
    toggle.type = 'checkbox';
    toggle.checked = !isDisabled;
    toggle.addEventListener('change', () => {
      void handleCategoryToggle(cat.name, toggle.checked, disabledCategories, card);
    });

    header.appendChild(info);
    header.appendChild(toggle);

    const keywordsEl = document.createElement('div');
    keywordsEl.className = 'category-keywords';
    for (const kw of cat.keywords) {
      const chip = document.createElement('span');
      chip.className = 'keyword-chip';
      chip.textContent = kw;
      keywordsEl.appendChild(chip);
    }

    card.appendChild(header);
    card.appendChild(keywordsEl);
    container.appendChild(card);
  }
}

async function handleCategoryToggle(
  categoryName: string,
  enabled: boolean,
  disabledCategories: string[],
  card: HTMLDivElement,
): Promise<void> {
  if (enabled) {
    const idx = disabledCategories.indexOf(categoryName);
    if (idx !== -1) disabledCategories.splice(idx, 1);
    card.classList.remove('is-disabled');
  } else {
    if (!disabledCategories.includes(categoryName)) {
      disabledCategories.push(categoryName);
    }
    card.classList.add('is-disabled');
  }

  await chrome.storage.local.set({
    [STORAGE_KEYS.DISABLED_FILTER_CATEGORIES]: [...disabledCategories],
  });

  const customEl = document.getElementById('custom-filters') as HTMLTextAreaElement;
  const defaultFilterToggle = document.getElementById('default-filter-enabled') as HTMLInputElement;
  updateStats(defaultFilterToggle.checked, disabledCategories, customEl.value);
}

function updateStats(
  defaultFilterEnabled: boolean,
  disabledCategories: string[],
  custom: string,
): void {
  const categories = parseCategories(DEFAULT_FILTER_LIST);
  const activeBuiltinText = defaultFilterEnabled
    ? buildFilterTextFromCategories(categories, disabledCategories)
    : '';
  const allRules = buildActiveRules(defaultFilterEnabled, activeBuiltinText, custom);
  const builtinRules = activeBuiltinText ? parseFilterList(activeBuiltinText).length : 0;
  const customRules = custom.trim() ? parseFilterList(custom).length : 0;

  const el = (id: string) => document.getElementById(id);
  const activeEl = el('active-rule-count');
  const builtinEl = el('builtin-rule-count');
  const customEl = el('custom-rule-count');
  if (activeEl) activeEl.textContent = String(allRules.length);
  if (builtinEl) builtinEl.textContent = String(builtinRules);
  if (customEl) customEl.textContent = String(customRules);
}

init();
