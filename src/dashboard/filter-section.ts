import { browser } from 'wxt/browser';
import {
  getCustomFilterList,
  parseCategories,
  DEFAULT_FILTER_LIST,
} from '@features/keyword-filter';
import type { FilterCategory } from '@features/keyword-filter';
import {
  getFilterPacks,
  toggleFilterPack,
  removeFilterPack,
  saveFilterPack,
} from '@features/filter-pack';
import type { FilterPack, FilterPackEntry } from '@shared/types';
import { STORAGE_KEYS } from '@shared/constants';
import type { Settings } from '@shared/types';

export async function renderFilters(settings: Settings): Promise<void> {
  await renderCustomFilterPreview(settings);
  renderDefaultCategories(settings);
  await renderFilterPacks();
}

async function renderCustomFilterPreview(settings: Settings): Promise<void> {
  const text = await getCustomFilterList();
  const el = document.getElementById('custom-filter-text');
  if (el) {
    el.textContent = text || '(필터가 비어 있습니다)';
  }
  // 키워드 필터 비활성 시 미리보기 흐리게
  const preview = document.getElementById('custom-filter-preview');
  if (preview) {
    preview.style.opacity = settings.keywordFilterEnabled ? '1' : '0.5';
  }
}

function renderDefaultCategories(settings: Settings): void {
  const container = document.getElementById('default-category-list');
  if (!container) return;

  const categories = parseCategories(DEFAULT_FILTER_LIST);
  container.innerHTML = '';

  void browser.storage.local
    .get([STORAGE_KEYS.DISABLED_FILTER_CATEGORIES])
    .then((result) => {
      const disabled =
        (result[STORAGE_KEYS.DISABLED_FILTER_CATEGORIES] as string[] | undefined) ?? [];
      const disabledSet = new Set(disabled);

      for (const cat of categories) {
        const card = createCategoryCard(cat, !disabledSet.has(cat.name));
        container.appendChild(card);
      }

      if (!settings.defaultFilterEnabled) {
        container.style.opacity = '0.5';
        container.style.pointerEvents = 'none';
      }
    });
}

function createCategoryCard(
  cat: FilterCategory,
  enabled: boolean,
): HTMLElement {
  const card = document.createElement('div');
  card.className = `category-card${enabled ? '' : ' is-disabled'}`;

  const info = document.createElement('div');
  info.className = 'category-card-info';

  const name = document.createElement('span');
  name.className = 'category-card-name';
  name.textContent = cat.name;

  const count = document.createElement('span');
  count.className = 'category-card-count';
  count.textContent = `${cat.keywords.length}개`;

  info.appendChild(name);
  info.appendChild(count);

  const toggle = document.createElement('input');
  toggle.type = 'checkbox';
  toggle.checked = enabled;
  toggle.addEventListener('change', () => {
    void toggleCategory(cat.name, toggle.checked);
    card.classList.toggle('is-disabled', !toggle.checked);
  });

  card.appendChild(info);
  card.appendChild(toggle);
  return card;
}

async function toggleCategory(
  name: string,
  enabled: boolean,
): Promise<void> {
  const result = await browser.storage.local.get([
    STORAGE_KEYS.DISABLED_FILTER_CATEGORIES,
  ]);
  const disabled =
    (result[STORAGE_KEYS.DISABLED_FILTER_CATEGORIES] as string[] | undefined) ?? [];
  const set = new Set(disabled);

  if (enabled) {
    set.delete(name);
  } else {
    set.add(name);
  }
  await browser.storage.local.set({
    [STORAGE_KEYS.DISABLED_FILTER_CATEGORIES]: [...set],
  });
}

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
  item.className = 'pack-item';

  const info = document.createElement('div');
  info.className = 'pack-info';

  const name = document.createElement('span');
  name.className = 'pack-name';
  name.textContent = pack.name;

  const author = document.createElement('span');
  author.className = 'pack-author';
  author.textContent = pack.author;

  info.appendChild(name);
  info.appendChild(author);

  const actions = document.createElement('div');
  actions.className = 'pack-actions';

  const toggle = document.createElement('input');
  toggle.type = 'checkbox';
  toggle.checked = entry.enabled;
  toggle.addEventListener('change', () => {
    void toggleFilterPack(pack.id, toggle.checked);
  });

  const removeBtn = document.createElement('button');
  removeBtn.className = 'pack-remove';
  removeBtn.textContent = '\u00D7';
  removeBtn.addEventListener('click', async () => {
    await removeFilterPack(pack.id);
    await renderFilterPacks();
  });

  actions.appendChild(toggle);
  actions.appendChild(removeBtn);
  item.appendChild(info);
  item.appendChild(actions);
  return item;
}

export function bindFilterEvents(settings: Settings): void {
  // 필터 편집 → options 페이지
  document
    .getElementById('edit-custom-filter-btn')
    ?.addEventListener('click', () => {
      void browser.tabs.create({
        url: browser.runtime.getURL('/options.html'),
      });
    });

  // 기본 필터 토글 → 카테고리 리스트 활성/비활성
  document
    .getElementById('defaultFilterEnabled')
    ?.addEventListener('change', () => {
      const container = document.getElementById('default-category-list');
      if (container) {
        const enabled = (
          document.getElementById('defaultFilterEnabled') as HTMLInputElement
        ).checked;
        container.style.opacity = enabled ? '1' : '0.5';
        container.style.pointerEvents = enabled ? 'auto' : 'none';
      }
    });

  // 팩으로 내보내기 → 커스텀 키워드를 JSON 다운로드
  document
    .getElementById('export-pack-btn')
    ?.addEventListener('click', async () => {
      const rules = await getCustomFilterList();
      if (!rules.trim()) {
        const btn = document.getElementById('export-pack-btn') as HTMLButtonElement;
        btn.textContent = '키워드가 비어 있습니다';
        setTimeout(() => { btn.textContent = '팩으로 내보내기'; }, 2000);
        return;
      }
      const pack: FilterPack = {
        id: `custom-${Date.now()}`,
        name: '내 키워드 필터',
        description: '커스텀 키워드 필터 팩',
        author: '',
        version: '1.0.0',
        updatedAt: new Date().toISOString(),
        rules,
      };
      const json = JSON.stringify(pack, null, 2);
      const blob = new Blob([json], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'keyword-filter-pack.json';
      a.click();
      URL.revokeObjectURL(url);
    });

  // 팩 가져오기 → 파일 선택
  const fileInput = document.getElementById('import-pack-file') as HTMLInputElement | null;
  document
    .getElementById('import-pack-btn')
    ?.addEventListener('click', () => {
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
      const btn = document.getElementById('import-pack-btn') as HTMLButtonElement;
      btn.textContent = '가져오기 완료!';
      setTimeout(() => { btn.textContent = '팩 가져오기'; }, 2000);
    } catch {
      const btn = document.getElementById('import-pack-btn') as HTMLButtonElement;
      btn.textContent = '잘못된 파일';
      setTimeout(() => { btn.textContent = '팩 가져오기'; }, 2000);
    }
    fileInput.value = '';
  });
}
