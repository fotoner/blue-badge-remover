import type { FilterPack } from '@shared/types';

export function showExportModal(rules: string): void {
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

  overlay.addEventListener('click', (event) => {
    if (event.target === overlay) overlay.remove();
  });

  document.getElementById('export-cancel')?.addEventListener('click', () => overlay.remove());
  document.getElementById('export-confirm')?.addEventListener('click', () => {
    downloadPack(readPackForm(rules));
    overlay.remove();
  });

  (document.getElementById('export-name') as HTMLInputElement | null)?.focus();
}

function readPackForm(rules: string): FilterPack {
  const name = valueOf('export-name') || '내 키워드 필터';
  const description = valueOf('export-desc');
  const author = valueOf('export-author');
  const category = valueOf('export-category');
  const version = valueOf('export-version') || '1.0.0';

  return {
    id: `custom-${Date.now()}`,
    name,
    description,
    author,
    category: category || undefined,
    version,
    updatedAt: new Date().toISOString(),
    rules,
  };
}

function valueOf(id: string): string {
  const element = document.getElementById(id) as HTMLInputElement | HTMLTextAreaElement | null;
  return element?.value.trim() ?? '';
}

function downloadPack(pack: FilterPack): void {
  const blob = new Blob([JSON.stringify(pack, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `${pack.name.replace(/\s+/g, '-').toLowerCase()}.json`;
  link.click();
  URL.revokeObjectURL(url);
}
