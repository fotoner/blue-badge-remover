import { getSettings, saveSettings, getWhitelist, addToWhitelist, removeFromWhitelist } from '@features/settings';
import { STORAGE_KEYS } from '@shared/constants';
import type { Settings } from '@shared/types';

let settings: Settings;

async function init(): Promise<void> {
  settings = await getSettings();
  renderSettings();
  renderWhitelist();
  renderSyncStatus();
  bindEvents();
}

function renderSettings(): void {
  (document.getElementById('enabled') as HTMLInputElement).checked = settings.enabled;
  (document.getElementById('filter-timeline') as HTMLInputElement).checked = settings.filter.timeline;
  (document.getElementById('filter-replies') as HTMLInputElement).checked = settings.filter.replies;
  (document.getElementById('filter-search') as HTMLInputElement).checked = settings.filter.search;
  (document.getElementById('retweetFilter') as HTMLInputElement).checked = settings.retweetFilter;

  const hideModeRadio = document.querySelector(`input[name="hideMode"][value="${settings.hideMode}"]`) as HTMLInputElement | null;
  if (hideModeRadio) hideModeRadio.checked = true;

  const quoteModeRadio = document.querySelector(`input[name="quoteMode"][value="${settings.quoteMode}"]`) as HTMLInputElement | null;
  if (quoteModeRadio) quoteModeRadio.checked = true;
}

async function renderWhitelist(): Promise<void> {
  const container = document.getElementById('whitelist-container')!;
  const list = await getWhitelist();
  container.innerHTML = list
    .map((handle) => `<div class="whitelist-item"><span>${handle}</span><button data-handle="${handle}">✕</button></div>`)
    .join('');

  container.querySelectorAll('button[data-handle]').forEach((btn) => {
    btn.addEventListener('click', async () => {
      const handle = btn.getAttribute('data-handle')!;
      await removeFromWhitelist(handle);
      await renderWhitelist();
    });
  });
}

async function renderSyncStatus(): Promise<void> {
  const stored = await chrome.storage.local.get([STORAGE_KEYS.LAST_SYNC_AT, STORAGE_KEYS.FOLLOW_LIST]);
  const lastSync = stored[STORAGE_KEYS.LAST_SYNC_AT] as string | null;
  const followList = (stored[STORAGE_KEYS.FOLLOW_LIST] as string[] | undefined) ?? [];
  document.getElementById('sync-status')!.textContent =
    `마지막 동기화: ${lastSync ? new Date(lastSync).toLocaleString('ko-KR') : '-'}`;
  const countEl = document.getElementById('follow-count');
  if (countEl) {
    countEl.textContent = `수집된 팔로우: ${followList.length}명`;
  }
}

function bindEvents(): void {
  const save = async (): Promise<void> => {
    settings.enabled = (document.getElementById('enabled') as HTMLInputElement).checked;
    settings.filter.timeline = (document.getElementById('filter-timeline') as HTMLInputElement).checked;
    settings.filter.replies = (document.getElementById('filter-replies') as HTMLInputElement).checked;
    settings.filter.search = (document.getElementById('filter-search') as HTMLInputElement).checked;
    settings.retweetFilter = (document.getElementById('retweetFilter') as HTMLInputElement).checked;
    settings.hideMode = (document.querySelector('input[name="hideMode"]:checked') as HTMLInputElement).value as Settings['hideMode'];
    settings.quoteMode = (document.querySelector('input[name="quoteMode"]:checked') as HTMLInputElement).value as Settings['quoteMode'];
    await saveSettings(settings);
  };

  document.querySelectorAll('input').forEach((input) => {
    input.addEventListener('change', save);
  });

  document.getElementById('sync-btn')!.addEventListener('click', async () => {
    // 팔로우 목록은 사용자가 x.com/following 페이지를 방문하면 자동 수집됨
    // 버튼 클릭 시 해당 페이지를 새 탭으로 열어줌
    const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
    const currentTab = tabs[0];
    if (currentTab?.id) {
      await chrome.tabs.create({ url: 'https://x.com/following', active: true });
    }
    const btn = document.getElementById('sync-btn') as HTMLButtonElement;
    btn.textContent = '팔로잉 페이지에서 스크롤하세요';
    setTimeout(() => { btn.textContent = '팔로잉 페이지 열기'; }, 3000);
  });

  document.getElementById('whitelist-add')!.addEventListener('click', async () => {
    const input = document.getElementById('whitelist-input') as HTMLInputElement;
    const handle = input.value.trim();
    if (!handle) return;
    const normalized = handle.startsWith('@') ? handle : `@${handle}`;
    await addToWhitelist(normalized);
    input.value = '';
    await renderWhitelist();
  });
}

init();
