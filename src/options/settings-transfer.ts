import { browser } from 'wxt/browser';
import { getWhitelist, replaceWhitelist } from '@features/settings';
import { parseFilterList } from '@features/keyword-filter';
import { STORAGE_KEYS } from '@shared/constants';
import { logger } from '@shared/utils/logger';

const SCHEMA_VERSION = 1;
const MAX_FILTER_LENGTH = 200_000;
const MAX_LIST_ITEMS = 10_000;
const MAX_KEYWORD_LENGTH = 100;
// 필터 200KB + 핸들/키워드 각 10,000개를 담고도 남는 크기 — 초과 파일은 읽지 않는다
const MAX_BACKUP_FILE_BYTES = 2_000_000;

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

export interface ImportSummary {
  whitelist: number;
  customRules: number;
  protectedKeywords: number;
}

export interface ImportDeps {
  confirmReplace: (summary: ImportSummary) => boolean;
  replaceWhitelist: (handles: string[]) => Promise<void>;
  saveLists: (customFilterList: string, protectedKeywords: string[]) => Promise<void>;
}

export type ImportOutcome =
  | { status: 'imported'; backup: FilterListBackup; summary: ImportSummary }
  | { status: 'cancelled' }
  | { status: 'invalid'; reason: 'too-large' | 'invalid-format' };

async function readBackupFile(file: File): Promise<FilterListBackup | null> {
  try {
    return parseFilterListBackup(JSON.parse(await file.text()) as unknown);
  } catch {
    return null;
  }
}

/** 백업 파일을 검증하고, 사용자 확인 후 현재 목록을 교체한다 */
export async function importFilterListFile(file: File, deps: ImportDeps): Promise<ImportOutcome> {
  if (file.size > MAX_BACKUP_FILE_BYTES) return { status: 'invalid', reason: 'too-large' };
  const backup = await readBackupFile(file);
  if (!backup) return { status: 'invalid', reason: 'invalid-format' };
  const summary: ImportSummary = {
    whitelist: backup.whitelist.length,
    customRules: parseFilterList(backup.customFilterList).length,
    protectedKeywords: backup.protectedKeywords.length,
  };
  if (!deps.confirmReplace(summary)) return { status: 'cancelled' };
  // 화이트리스트는 background 큐 경유 — 다른 탭의 동시 추가/삭제와 섞이지 않게 한다
  await deps.replaceWhitelist(backup.whitelist);
  await deps.saveLists(backup.customFilterList, backup.protectedKeywords);
  return { status: 'imported', backup, summary };
}

const importDeps: ImportDeps = {
  confirmReplace: (summary) => window.confirm(
    `현재 화이트리스트·커스텀 필터·보호 키워드를 백업 내용으로 바꿉니다.\n`
    + `(화이트리스트 ${summary.whitelist}개 · 커스텀 규칙 ${summary.customRules}개 · 보호 키워드 ${summary.protectedKeywords}개)\n계속할까요?`,
  ),
  replaceWhitelist,
  saveLists: async (customFilterList, protectedKeywords) => {
    await browser.storage.local.set({
      [STORAGE_KEYS.CUSTOM_FILTER_LIST]: customFilterList,
      [STORAGE_KEYS.PROTECTED_KEYWORDS]: protectedKeywords,
    });
  },
};

const INVALID_MESSAGES: Record<'too-large' | 'invalid-format', string> = {
  'too-large': '파일이 너무 큽니다 (최대 2MB)',
  'invalid-format': '올바른 백업 파일이 아닙니다',
};

function showTransferStatus(message: string, success: boolean): void {
  const status = document.getElementById('lists-transfer-status');
  if (!status) return;
  status.textContent = message;
  status.className = `save-status ${success ? 'success' : 'error'}`;
}

async function importFilterLists(
  input: HTMLInputElement,
  fields: { custom: HTMLTextAreaElement; protected: HTMLTextAreaElement },
  onImported: () => void,
): Promise<void> {
  const file = input.files?.[0];
  if (!file) return;
  try {
    const outcome = await importFilterListFile(file, importDeps);
    if (outcome.status === 'invalid') {
      showTransferStatus(INVALID_MESSAGES[outcome.reason], false);
      return;
    }
    if (outcome.status === 'cancelled') return;
    renderImportedFilterLists(outcome.backup, fields.custom, fields.protected);
    const { whitelist, customRules, protectedKeywords } = outcome.summary;
    showTransferStatus(`가져왔습니다 (화이트리스트 ${whitelist}개 · 규칙 ${customRules}개 · 보호 키워드 ${protectedKeywords}개)`, true);
    onImported();
  } catch (error) {
    logger.warn('Filter list backup import failed', { error: String(error) });
    showTransferStatus('가져오기에 실패했습니다', false);
  } finally {
    input.value = '';
  }
}

export function bindSettingsTransferEvents(customElement: HTMLTextAreaElement, onImported: () => void): void {
  document.getElementById('export-lists-btn')?.addEventListener('click', () => { void exportFilterLists(); });
  const fileInput = document.getElementById('import-lists-file') as HTMLInputElement | null;
  const protectedElement = document.getElementById('protected-keywords') as HTMLTextAreaElement | null;
  document.getElementById('import-lists-btn')?.addEventListener('click', () => fileInput?.click());
  if (fileInput && protectedElement) {
    fileInput.addEventListener('change', () => {
      void importFilterLists(fileInput, { custom: customElement, protected: protectedElement }, onImported);
    });
  }
}
