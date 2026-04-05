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

  // 팩으로 내보내기 → 메타 입력 모달 → JSON 다운로드
  document.getElementById('export-pack-btn')?.addEventListener('click', () => {
    const rules = customEl.value.trim();
    if (!rules) return;
    showExportModal(rules);
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
      const json = JSON.parse(text) as Record<string, unknown>;
      if (!json.id || !json.name || typeof json.rules !== 'string') {
        throw new Error('Invalid pack format');
      }
      // 허용된 필드만 추출 — 악성 필드 주입 방지
      const sanitized: FilterPack = {
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
      await saveFilterPack(sanitized);
      await renderFilterPacks();
    } catch {
      // 잘못된 파일 — 조용히 실패
    }
    fileInput.value = '';
  });
}

function showExportModal(rules: string): void {
  const overlay = document.createElement('div');
  overlay.className = 'export-modal-overlay';

  const modal = document.createElement('div');
  modal.className = 'export-modal';

  modal.innerHTML = `
    <h3>필터 팩 내보내기</h3>
    <label>팩 이름 *</label>
    <input type="text" id="export-name" value="내 키워드 필터" placeholder="필터 팩 이름">
    <label>설명</label>
    <textarea id="export-desc" placeholder="이 필터 팩에 대한 설명"></textarea>
    <label>작성자</label>
    <input type="text" id="export-author" placeholder="@handle 또는 이름">
    <label>카테고리</label>
    <input type="text" id="export-category" placeholder="예: 정치, 금융, 어그로">
    <label>버전</label>
    <input type="text" id="export-version" value="1.0.0" placeholder="1.0.0">
    <div class="btn-row">
      <button class="btn-secondary" id="export-cancel">취소</button>
      <button class="btn-primary" id="export-confirm">내보내기</button>
    </div>
  `;

  overlay.appendChild(modal);
  document.body.appendChild(overlay);

  overlay.addEventListener('click', (e) => {
    if (e.target === overlay) overlay.remove();
  });

  document.getElementById('export-cancel')?.addEventListener('click', () => overlay.remove());

  document.getElementById('export-confirm')?.addEventListener('click', () => {
    const name = (document.getElementById('export-name') as HTMLInputElement).value.trim() || '내 키워드 필터';
    const description = (document.getElementById('export-desc') as HTMLTextAreaElement).value.trim();
    const author = (document.getElementById('export-author') as HTMLInputElement).value.trim();
    const category = (document.getElementById('export-category') as HTMLInputElement).value.trim();
    const version = (document.getElementById('export-version') as HTMLInputElement).value.trim() || '1.0.0';

    const pack: FilterPack = {
      id: `custom-${Date.now()}`,
      name,
      description: description || '',
      author: author || '',
      category: category || undefined,
      version,
      updatedAt: new Date().toISOString(),
      rules,
    };

    const blob = new Blob([JSON.stringify(pack, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${name.replace(/\s+/g, '-').toLowerCase()}.json`;
    a.click();
    URL.revokeObjectURL(url);
    overlay.remove();
  });

  (document.getElementById('export-name') as HTMLInputElement)?.focus();
}

init();
