import { browser } from 'wxt/browser';
import {
  DEFAULT_FILTER_LIST,
  getCustomFilterList,
  saveCustomFilterList,
  buildActiveRules,
  parseCategories,
  buildFilterTextFromCategories,
  parseFilterList,
} from '@features/keyword-filter';
import { getFilterPacks, saveFilterPack, toggleFilterPack, removeFilterPack } from '@features/filter-pack';
import { getSettings, saveSettings } from '@features/settings';
import { STORAGE_KEYS } from '@shared/constants';
import type { FilterPack, FilterPackEntry } from '@shared/types';

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
    browser.storage.local.get([STORAGE_KEYS.DISABLED_FILTER_CATEGORIES]),
  ]);

  const disabledCategories: string[] =
    (stored[STORAGE_KEYS.DISABLED_FILTER_CATEGORIES] as string[] | undefined) ?? [];

  customEl.value = customText;
  defaultFilterToggle.checked = settings.defaultFilterEnabled;

  renderCategories(categoryListEl, categories, disabledCategories, settings.defaultFilterEnabled);
  void updateStats(settings.defaultFilterEnabled, disabledCategories, customText);

  defaultFilterToggle.addEventListener('change', async () => {
    const current = await getSettings();
    const updated = { ...current, defaultFilterEnabled: defaultFilterToggle.checked };
    await saveSettings(updated);
    renderCategories(categoryListEl, categories, disabledCategories, defaultFilterToggle.checked);
    void updateStats(defaultFilterToggle.checked, disabledCategories, customEl.value);
  });

  saveBtn.addEventListener('click', async () => {
    const text = customEl.value;
    try {
      await saveCustomFilterList(text);
      void updateStats(defaultFilterToggle.checked, disabledCategories, text);
      saveStatus.textContent = '저장 완료';
      saveStatus.className = 'save-status success';
    } catch {
      saveStatus.textContent = '저장 실패';
      saveStatus.className = 'save-status error';
    }
    setTimeout(() => { saveStatus.textContent = ''; }, 2000);
  });

  await renderFilterPacks();
  bindPackEvents();
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

  await browser.storage.local.set({
    [STORAGE_KEYS.DISABLED_FILTER_CATEGORIES]: [...disabledCategories],
  });

  const customEl = document.getElementById('custom-filters') as HTMLTextAreaElement;
  const defaultFilterToggle = document.getElementById('default-filter-enabled') as HTMLInputElement;
  void updateStats(defaultFilterToggle.checked, disabledCategories, customEl.value);
}

async function updateStats(
  defaultFilterEnabled: boolean,
  disabledCategories: string[],
  custom: string,
): Promise<void> {
  const categories = parseCategories(DEFAULT_FILTER_LIST);
  const activeBuiltinText = defaultFilterEnabled
    ? buildFilterTextFromCategories(categories, disabledCategories)
    : '';
  const allRules = buildActiveRules(defaultFilterEnabled, activeBuiltinText, custom);
  const builtinRules = activeBuiltinText ? parseFilterList(activeBuiltinText).length : 0;
  const customRules = custom.trim() ? parseFilterList(custom).length : 0;

  // 팩 규칙 수
  let packRules = 0;
  try {
    const entries = await getFilterPacks();
    for (const entry of entries) {
      if (entry.enabled) {
        packRules += entry.pack.rules.split('\n').filter((l) => l.trim() && !l.startsWith('!')).length;
      }
    }
  } catch { /* ignore */ }

  const el = (id: string) => document.getElementById(id);
  const activeEl = el('active-rule-count');
  const builtinEl = el('builtin-rule-count');
  const customEl = el('custom-rule-count');
  const packEl = el('pack-rule-count');
  if (activeEl) activeEl.textContent = String(allRules.length + packRules);
  if (builtinEl) builtinEl.textContent = String(builtinRules);
  if (customEl) customEl.textContent = String(customRules);
  if (packEl) packEl.textContent = String(packRules);
}

// --- 필터 팩 관리 ---

async function renderFilterPacks(): Promise<void> {
  const entries = await getFilterPacks();
  const container = document.getElementById('filter-pack-list');
  const emptyEl = document.getElementById('packs-empty');
  if (!container) return;

  container.innerHTML = '';
  if (entries.length === 0) {
    if (emptyEl) emptyEl.style.display = 'block';
    return;
  }
  if (emptyEl) emptyEl.style.display = 'none';

  for (const entry of entries) {
    container.appendChild(createPackItem(entry));
  }
}

function createPackItem(entry: FilterPackEntry): HTMLElement {
  const pack = entry.pack;
  const item = document.createElement('div');
  item.className = 'category-card';

  const header = document.createElement('label');
  header.className = 'category-header';

  const info = document.createElement('div');
  info.className = 'category-info';

  const name = document.createElement('span');
  name.className = 'category-name';
  name.textContent = pack.name;

  const count = document.createElement('span');
  count.className = 'category-count';
  const ruleCount = pack.rules.split('\n').filter((l) => l.trim() && !l.startsWith('!')).length;
  count.textContent = String(ruleCount);

  info.appendChild(name);
  info.appendChild(count);

  const actions = document.createElement('div');
  actions.style.cssText = 'display:flex;align-items:center;gap:8px';

  const toggle = document.createElement('input');
  toggle.type = 'checkbox';
  toggle.checked = entry.enabled;
  toggle.addEventListener('change', () => {
    item.classList.toggle('is-disabled', !toggle.checked);
    void toggleFilterPack(pack.id, toggle.checked);
  });

  const removeBtn = document.createElement('button');
  removeBtn.className = 'btn-remove';
  removeBtn.textContent = '\u00D7';
  removeBtn.style.cssText = 'background:none;border:none;color:#536471;font-size:16px;cursor:pointer;padding:2px 6px';
  removeBtn.addEventListener('click', async () => {
    await removeFilterPack(pack.id);
    await renderFilterPacks();
  });

  actions.appendChild(toggle);
  actions.appendChild(removeBtn);
  header.appendChild(info);
  header.appendChild(actions);
  item.appendChild(header);

  // 키워드 chips
  const keywordsEl = document.createElement('div');
  keywordsEl.className = 'category-keywords';
  const keywords = pack.rules.split('\n').filter((l) => l.trim() && !l.startsWith('!'));
  for (const kw of keywords.slice(0, 20)) {
    const chip = document.createElement('span');
    chip.className = 'keyword-chip';
    chip.textContent = kw.trim();
    keywordsEl.appendChild(chip);
  }
  if (keywords.length > 20) {
    const more = document.createElement('span');
    more.className = 'keyword-chip';
    more.textContent = `+${keywords.length - 20}`;
    more.style.opacity = '0.6';
    keywordsEl.appendChild(more);
  }
  item.appendChild(keywordsEl);

  if (!entry.enabled) item.classList.add('is-disabled');
  return item;
}

function bindPackEvents(): void {
  const customEl = document.getElementById('custom-filters') as HTMLTextAreaElement;

  // 팩으로 내보내기 → 커스텀 키워드를 JSON 다운로드
  document.getElementById('export-pack-btn')?.addEventListener('click', () => {
    const rules = customEl.value.trim();
    if (!rules) return;
    const pack: FilterPack = {
      id: `custom-${Date.now()}`,
      name: '내 키워드 필터',
      description: '커스텀 키워드 필터 팩',
      author: '',
      version: '1.0.0',
      updatedAt: new Date().toISOString(),
      rules,
    };
    const blob = new Blob([JSON.stringify(pack, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'keyword-filter-pack.json';
    a.click();
    URL.revokeObjectURL(url);
  });

  // 팩 가져오기 → 파일 선택
  const fileInput = document.getElementById('import-pack-file') as HTMLInputElement | null;
  document.getElementById('import-pack-btn')?.addEventListener('click', () => {
    fileInput?.click();
  });

  fileInput?.addEventListener('change', async () => {
    const file = fileInput.files?.[0];
    if (!file) return;
    try {
      const text = await file.text();
      const json = JSON.parse(text) as FilterPack;
      if (!json.id || !json.name || typeof json.rules !== 'string') {
        throw new Error('Invalid pack format');
      }
      await saveFilterPack(json);
      await renderFilterPacks();
    } catch {
      // 잘못된 파일 — 조용히 실패
    }
    fileInput.value = '';
  });
}

init();
