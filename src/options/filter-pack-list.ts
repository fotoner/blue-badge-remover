import {
  getFilterPacks,
  parseFilterPackJson,
  removeFilterPack,
  saveFilterPack,
  toggleFilterPack,
} from '@features/filter-pack';
import type { FilterPackEntry } from '@shared/types';
import { showExportModal } from './export-modal';
import { countRules } from './rule-stats';

interface PackEventOptions {
  customEl: HTMLTextAreaElement;
  onChange: () => void;
}

export async function renderFilterPacks(onChange: () => void): Promise<void> {
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
    container.appendChild(createPackItem(entry, onChange));
  }
}

export function bindPackEvents({ customEl, onChange }: PackEventOptions): void {
  document.getElementById('export-pack-btn')?.addEventListener('click', () => {
    const rules = customEl.value.trim();
    if (!rules) return;
    showExportModal(rules);
  });

  const fileInput = document.getElementById('import-pack-file') as HTMLInputElement | null;
  document.getElementById('import-pack-btn')?.addEventListener('click', () => {
    fileInput?.click();
  });

  fileInput?.addEventListener('change', async () => {
    const file = fileInput.files?.[0];
    if (!file) return;
    try {
      const text = await file.text();
      await saveFilterPack(parseFilterPackJson(text));
      await renderFilterPacks(onChange);
      onChange();
    } catch {
      // 잘못된 파일 — 조용히 실패
    }
    fileInput.value = '';
  });
}

function createPackItem(entry: FilterPackEntry, onChange: () => void): HTMLElement {
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
  count.textContent = String(countRules(pack.rules));

  info.appendChild(name);
  info.appendChild(count);

  const actions = document.createElement('div');
  actions.style.cssText = 'display:flex;align-items:center;gap:8px';

  const toggle = document.createElement('input');
  toggle.type = 'checkbox';
  toggle.checked = entry.enabled;
  toggle.addEventListener('change', () => {
    item.classList.toggle('is-disabled', !toggle.checked);
    void toggleFilterPack(pack.id, toggle.checked).then(onChange);
  });

  const removeBtn = document.createElement('button');
  removeBtn.className = 'btn-remove';
  removeBtn.textContent = '\u00D7';
  removeBtn.style.cssText = 'background:none;border:none;color:#536471;font-size:16px;cursor:pointer;padding:2px 6px';
  removeBtn.addEventListener('click', async () => {
    await removeFilterPack(pack.id);
    await renderFilterPacks(onChange);
    onChange();
  });

  actions.appendChild(toggle);
  actions.appendChild(removeBtn);
  header.appendChild(info);
  header.appendChild(actions);
  item.appendChild(header);
  item.appendChild(createKeywordPreview(pack.rules));

  if (!entry.enabled) item.classList.add('is-disabled');
  return item;
}

function createKeywordPreview(rules: string): HTMLElement {
  const keywordsEl = document.createElement('div');
  keywordsEl.className = 'category-keywords';
  const keywords = rules.split('\n').filter((line) => line.trim() && !line.startsWith('!'));
  for (const keyword of keywords.slice(0, 20)) {
    const chip = document.createElement('span');
    chip.className = 'keyword-chip';
    chip.textContent = keyword.trim();
    keywordsEl.appendChild(chip);
  }
  if (keywords.length > 20) {
    const more = document.createElement('span');
    more.className = 'keyword-chip';
    more.textContent = `+${keywords.length - 20}`;
    more.style.opacity = '0.6';
    keywordsEl.appendChild(more);
  }
  return keywordsEl;
}
