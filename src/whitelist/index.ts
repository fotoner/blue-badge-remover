import { browser } from 'wxt/browser';
import { getSettings, getWhitelist, addManyToWhitelist, removeFromWhitelist } from '@features/settings';
import { t } from '@shared/i18n';
import type { Language } from '@shared/i18n';

export function normalizeHandle(input: string): string | null {
  const handle = input.trim().replace(/^@/, '');
  if (!handle || !/^[A-Za-z0-9_]{1,15}$/.test(handle)) return null;
  return `@${handle.toLowerCase()}`;
}

export function parseWhitelistInput(input: string): string[] {
  const handles = input.split(/[\s,]+/).map(normalizeHandle).filter((handle): handle is string => handle !== null);
  return [...new Set(handles)];
}

export function renderWhitelistItems(
  container: HTMLElement,
  emptyEl: HTMLElement,
  headingEl: HTMLElement,
  list: string[],
  lang: Language,
  onRemove: (handle: string) => Promise<void>,
): void {
  container.innerHTML = '';

  if (list.length === 0) {
    emptyEl.style.display = 'block';
    headingEl.textContent = t('whitelistCount', lang, { count: '0' });
    return;
  }

  emptyEl.style.display = 'none';
  headingEl.textContent = t('whitelistCount', lang, { count: String(list.length) });

  for (const handle of list) {
    const item = document.createElement('div');
    item.className = 'whitelist-item';

    const span = document.createElement('span');
    span.textContent = handle;

    const btn = document.createElement('button');
    btn.textContent = '✕';
    btn.type = 'button';
    btn.addEventListener('click', () => { void onRemove(handle); });

    item.append(span, btn);
    container.appendChild(item);
  }
}

async function init(): Promise<void> {
  const settings = await getSettings();
  const lang = settings.language;

  const subtitleEl = document.getElementById('page-subtitle')!;
  const inputEl = document.getElementById('whitelist-input') as HTMLTextAreaElement;
  const addBtn = document.getElementById('whitelist-add') as HTMLButtonElement;
  const container = document.getElementById('whitelist-container')!;
  const emptyEl = document.getElementById('whitelist-empty')!;
  const headingEl = document.getElementById('list-heading')!;

  subtitleEl.textContent = t('manageWhitelist', lang);
  inputEl.placeholder = t('whitelistPlaceholder', lang);
  addBtn.textContent = t('add', lang);
  emptyEl.textContent = t('whitelistEmpty', lang);

  const refresh = async (): Promise<void> => {
    const list = await getWhitelist();
    renderWhitelistItems(container, emptyEl, headingEl, list, lang, async (handle) => {
      await removeFromWhitelist(handle);
      await refresh();
    });
  };

  addBtn.addEventListener('click', async () => {
    const handles = parseWhitelistInput(inputEl.value);
    if (!handles.length) return;
    await addManyToWhitelist(handles);
    inputEl.value = '';
    await refresh();
  });

  inputEl.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) addBtn.click();
  });

  await refresh();
}

if (browser?.storage) {
  void init();
}
