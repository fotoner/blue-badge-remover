import type { FilterPack } from '@shared/types';

const PACK_ID_PATTERN = /^[a-zA-Z0-9._-]{1,100}$/;
const MAX_RULES_LENGTH = 200_000;

export function parseImportedFilterPack(input: unknown): FilterPack | null {
  if (!input || typeof input !== 'object' || Array.isArray(input)) return null;
  const value = input as Record<string, unknown>;
  if (typeof value['id'] !== 'string' || !PACK_ID_PATTERN.test(value['id'])) return null;
  if (typeof value['name'] !== 'string' || !value['name'].trim()) return null;
  if (typeof value['rules'] !== 'string' || !value['rules'].trim()) return null;
  if (value['rules'].length > MAX_RULES_LENGTH) return null;
  return {
    id: value['id'],
    name: value['name'].trim().slice(0, 100),
    description: stringField(value['description'], 500),
    author: stringField(value['author'], 100),
    version: stringField(value['version'], 20) || '1.0.0',
    updatedAt: validDate(value['updatedAt']) ?? new Date().toISOString(),
    rules: value['rules'],
    category: optionalStringField(value['category'], 50),
    homepage: validHomepage(value['homepage']),
  };
}

function stringField(value: unknown, maxLength: number): string {
  return typeof value === 'string' ? value.trim().slice(0, maxLength) : '';
}

function optionalStringField(value: unknown, maxLength: number): string | undefined {
  return stringField(value, maxLength) || undefined;
}

function validDate(value: unknown): string | null {
  return typeof value === 'string' && !Number.isNaN(Date.parse(value)) ? value : null;
}

function validHomepage(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined;
  try {
    const url = new URL(value);
    return url.protocol === 'https:' ? url.href : undefined;
  } catch {
    return undefined;
  }
}

export function showExportModal(rules: string): void {
  const overlay = document.createElement('div');
  overlay.className = 'export-modal-overlay';
  overlay.appendChild(createExportModal());
  document.body.appendChild(overlay);
  overlay.addEventListener('click', (event) => {
    if (event.target === overlay) overlay.remove();
  });
  document.getElementById('export-cancel')?.addEventListener('click', () => overlay.remove());
  document.getElementById('export-confirm')?.addEventListener('click', () => {
    downloadFilterPack(buildExportPack(rules));
    overlay.remove();
  });
  (document.getElementById('export-name') as HTMLInputElement)?.focus();
}

function createExportModal(): HTMLElement {
  const modal = document.createElement('div');
  modal.className = 'export-modal';
  modal.innerHTML = `
    <h3>필터 팩 내보내기</h3>
    <label>팩 이름 *</label>
    <input type="text" id="export-name" value="내 키워드 필터" placeholder="필터 팩 이름">
    <label>설명</label><textarea id="export-desc" placeholder="이 필터 팩에 대한 설명"></textarea>
    <label>작성자</label><input type="text" id="export-author" placeholder="@handle 또는 이름">
    <label>카테고리</label><input type="text" id="export-category" placeholder="예: 정치, 금융, 어그로">
    <label>버전</label><input type="text" id="export-version" value="1.0.0" placeholder="1.0.0">
    <div class="btn-row"><button class="btn-secondary" id="export-cancel">취소</button>
      <button class="btn-primary" id="export-confirm">내보내기</button></div>`;
  return modal;
}

function inputValue(id: string, fallback = ''): string {
  return (document.getElementById(id) as HTMLInputElement | HTMLTextAreaElement).value.trim() || fallback;
}

function buildExportPack(rules: string): FilterPack {
  return {
    id: `custom-${Date.now()}`,
    name: inputValue('export-name', '내 키워드 필터'),
    description: inputValue('export-desc'),
    author: inputValue('export-author'),
    category: inputValue('export-category') || undefined,
    version: inputValue('export-version', '1.0.0'),
    updatedAt: new Date().toISOString(),
    rules,
  };
}

function downloadFilterPack(pack: FilterPack): void {
  const blob = new Blob([JSON.stringify(pack, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = `${pack.name.replace(/\s+/g, '-').toLowerCase()}.json`;
  anchor.click();
  URL.revokeObjectURL(url);
}
