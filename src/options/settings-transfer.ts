import { browser } from 'wxt/browser';
import { getWhitelist } from '@features/settings';
import { STORAGE_KEYS } from '@shared/constants';
import { logger } from '@shared/utils/logger';

const SCHEMA_VERSION = 1;
const MAX_FILTER_LENGTH = 200_000;
const MAX_LIST_ITEMS = 10_000;
const MAX_KEYWORD_LENGTH = 100;

export interface FilterListBackup {
  schemaVersion: 1;
  exportedAt: string;
  whitelist: string[];
  customFilterList: string;
  protectedKeywords: string[];
}

function normalizeHandle(value: string): string | null {
  const handle = value.trim().replace(/^@+/, '');
  return /^[A-Za-z0-9_]{1,15}$/.test(handle) ? `@${handle.toLowerCase()}` : null;
}

function normalizeKeywords(values: string[]): string[] {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const value of values) {
    const keyword = value.trim();
    const key = keyword.toLowerCase();
    if (!keyword || keyword.length > MAX_KEYWORD_LENGTH || seen.has(key)) continue;
    seen.add(key);
    result.push(keyword);
  }
  return result;
}

export function buildFilterListBackup(
  whitelist: string[],
  customFilterList: string,
  protectedKeywords: string[],
): FilterListBackup {
  const normalizedHandles = whitelist.map(normalizeHandle).filter((value): value is string => value !== null);
  return {
    schemaVersion: SCHEMA_VERSION,
    exportedAt: new Date().toISOString(),
    whitelist: [...new Set(normalizedHandles)],
    customFilterList,
    protectedKeywords: normalizeKeywords(protectedKeywords),
  };
}

export function parseFilterListBackup(input: unknown): FilterListBackup | null {
  if (!input || typeof input !== 'object' || Array.isArray(input)) return null;
  const value = input as Record<string, unknown>;
  if (value['schemaVersion'] !== SCHEMA_VERSION) return null;
  if (!Array.isArray(value['whitelist']) || value['whitelist'].length > MAX_LIST_ITEMS) return null;
  if (typeof value['customFilterList'] !== 'string' || value['customFilterList'].length > MAX_FILTER_LENGTH) return null;
  const rawHandles = value['whitelist'];
  if (!rawHandles.every((handle) => typeof handle === 'string')) return null;
  const handles = rawHandles.map((handle) => normalizeHandle(handle as string));
  if (handles.some((handle) => handle === null)) return null;
  const rawKeywords = value['protectedKeywords'] ?? [];
  if (!Array.isArray(rawKeywords) || rawKeywords.length > MAX_LIST_ITEMS) return null;
  if (!rawKeywords.every((keyword) => typeof keyword === 'string')) return null;
  return buildFilterListBackup(
    handles as string[],
    value['customFilterList'],
    normalizeKeywords(rawKeywords as string[]),
  );
}

export function renderImportedFilterLists(
  backup: FilterListBackup,
  customElement: HTMLTextAreaElement,
  protectedElement: HTMLTextAreaElement,
): void {
  customElement.value = backup.customFilterList;
  protectedElement.value = backup.protectedKeywords.join('\n');
}

async function exportFilterLists(): Promise<void> {
  const [whitelist, stored] = await Promise.all([
    getWhitelist(),
    browser.storage.local.get([STORAGE_KEYS.CUSTOM_FILTER_LIST, STORAGE_KEYS.PROTECTED_KEYWORDS]),
  ]);
  const backup = buildFilterListBackup(
    whitelist,
    (stored[STORAGE_KEYS.CUSTOM_FILTER_LIST] as string | undefined) ?? '',
    (stored[STORAGE_KEYS.PROTECTED_KEYWORDS] as string[] | undefined) ?? [],
  );
  downloadBackup(backup);
}

function downloadBackup(backup: FilterListBackup): void {
  const blob = new Blob([JSON.stringify(backup, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = 'blue-badge-remover-filter-lists.json';
  anchor.click();
  URL.revokeObjectURL(url);
}

async function importFilterLists(
  input: HTMLInputElement,
  customElement: HTMLTextAreaElement,
  protectedElement: HTMLTextAreaElement,
): Promise<void> {
  const file = input.files?.[0];
  if (!file) return;
  try {
    const backup = parseFilterListBackup(JSON.parse(await file.text()) as unknown);
    if (!backup) throw new Error('Invalid filter list backup');
    await browser.storage.local.set({
      [STORAGE_KEYS.WHITELIST]: backup.whitelist,
      [STORAGE_KEYS.CUSTOM_FILTER_LIST]: backup.customFilterList,
      [STORAGE_KEYS.PROTECTED_KEYWORDS]: backup.protectedKeywords,
    });
    renderImportedFilterLists(backup, customElement, protectedElement);
  } catch (error) {
    logger.warn('Filter list backup import rejected', { error: String(error) });
  } finally {
    input.value = '';
  }
}

export function bindSettingsTransferEvents(customElement: HTMLTextAreaElement): void {
  document.getElementById('export-lists-btn')?.addEventListener('click', () => { void exportFilterLists(); });
  const fileInput = document.getElementById('import-lists-file') as HTMLInputElement | null;
  const protectedElement = document.getElementById('protected-keywords') as HTMLTextAreaElement | null;
  document.getElementById('import-lists-btn')?.addEventListener('click', () => fileInput?.click());
  if (fileInput && protectedElement) {
    fileInput.addEventListener('change', () => {
      void importFilterLists(fileInput, customElement, protectedElement);
    });
  }
}
