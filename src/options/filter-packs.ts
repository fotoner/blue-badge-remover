import {
  getFilterPacks,
  removeFilterPack,
  saveFilterPack,
  toggleFilterPack,
} from '@features/filter-pack';
import type { FilterPackEntry } from '@shared/types';
import { logger } from '@shared/utils/logger';
import { parseImportedFilterPack, showExportModal } from './pack-transfer';

export async function renderFilterPacks(): Promise<void> {
  const entries = await getFilterPacks();
  const container = document.getElementById('filter-pack-list');
  const emptyElement = document.getElementById('packs-empty');
  if (!container) return;
  container.innerHTML = '';
  if (entries.length === 0) {
    if (emptyElement) emptyElement.style.display = 'block';
    return;
  }
  if (emptyElement) emptyElement.style.display = 'none';
  for (const entry of entries) container.appendChild(createPackItem(entry));
}

function createPackItem(entry: FilterPackEntry): HTMLElement {
  const item = document.createElement('div');
  item.className = `category-card${entry.enabled ? '' : ' is-disabled'}`;
  item.append(
    createPackHeader(entry, item),
    createKeywordChips(entry.pack.rules),
  );
  return item;
}

function createPackHeader(entry: FilterPackEntry, item: HTMLElement): HTMLElement {
  const header = document.createElement('label');
  header.className = 'category-header';
  const info = document.createElement('div');
  info.className = 'category-info';
  const name = createSpan('category-name', entry.pack.name);
  const ruleCount = entry.pack.rules.split('\n').filter(isRuleLine).length;
  info.append(name, createSpan('category-count', String(ruleCount)));
  const actions = document.createElement('div');
  actions.style.cssText = 'display:flex;align-items:center;gap:8px';
  actions.append(createPackToggle(entry, item), createRemoveButton(entry.pack.id));
  header.append(info, actions);
  return header;
}

function createPackToggle(entry: FilterPackEntry, item: HTMLElement): HTMLInputElement {
  const toggle = document.createElement('input');
  toggle.type = 'checkbox';
  toggle.checked = entry.enabled;
  toggle.addEventListener('change', () => {
    item.classList.toggle('is-disabled', !toggle.checked);
    void toggleFilterPack(entry.pack.id, toggle.checked);
  });
  return toggle;
}

function createRemoveButton(packId: string): HTMLButtonElement {
  const button = document.createElement('button');
  button.className = 'btn-remove';
  button.textContent = '\u00D7';
  button.style.cssText = 'background:none;border:none;color:#536471;font-size:16px;cursor:pointer;padding:2px 6px';
  button.addEventListener('click', async () => {
    await removeFilterPack(packId);
    await renderFilterPacks();
  });
  return button;
}

function createKeywordChips(rules: string): HTMLElement {
  const element = document.createElement('div');
  element.className = 'category-keywords';
  const keywords = rules.split('\n').filter(isRuleLine);
  for (const keyword of keywords.slice(0, 20)) {
    element.appendChild(createSpan('keyword-chip', keyword.trim()));
  }
  if (keywords.length > 20) {
    const more = createSpan('keyword-chip', `+${keywords.length - 20}`);
    more.style.opacity = '0.6';
    element.appendChild(more);
  }
  return element;
}

function createSpan(className: string, text: string): HTMLSpanElement {
  const span = document.createElement('span');
  span.className = className;
  span.textContent = text;
  return span;
}

function isRuleLine(line: string): boolean {
  return Boolean(line.trim()) && !line.startsWith('!');
}

export function bindPackEvents(customElement: HTMLTextAreaElement): void {
  document.getElementById('export-pack-btn')?.addEventListener('click', () => {
    const rules = customElement.value.trim();
    if (rules) showExportModal(rules);
  });
  const fileInput = document.getElementById('import-pack-file') as HTMLInputElement | null;
  document.getElementById('import-pack-btn')?.addEventListener('click', () => fileInput?.click());
  fileInput?.addEventListener('change', () => { void importSelectedPack(fileInput); });
}

async function importSelectedPack(input: HTMLInputElement): Promise<void> {
  const file = input.files?.[0];
  if (!file) return;
  try {
    const pack = parseImportedFilterPack(JSON.parse(await file.text()) as unknown);
    if (!pack) throw new Error('Invalid pack format');
    await saveFilterPack(pack);
    await renderFilterPacks();
  } catch (error) {
    logger.warn('Filter pack import rejected', {
      error: error instanceof Error ? error.message : String(error),
    });
  } finally {
    input.value = '';
  }
}
