import { browser } from 'wxt/browser';
import { getSettings, saveSettings } from '@features/settings';
import { getTodayStats, getAllTimeTotal } from '@features/stats';
import { t } from '@shared/i18n';
import { STORAGE_KEYS } from '@shared/constants';
import type { Settings } from '@shared/types';

const UPDATE_FLAG_KEY = 'bbr-update-available';

let settings: Settings;

function isFirefoxAndroid(): boolean {
  return navigator.userAgent.includes('Firefox') && navigator.userAgent.includes('Android');
}

function openPage(url: string): void {
  if (isFirefoxAndroid()) {
    window.location.href = url;
  } else {
    void browser.tabs.create({ url });
  }
}

async function init(): Promise<void> {
  if (isFirefoxAndroid()) {
    document.body.style.width = '100vw';
  }
  settings = await getSettings();
  renderVersion();
  renderToggle();
  applyTranslations();
  await renderStats();
  await renderInfo();
  await renderUpdateBanner();
  bindEvents();
}

function renderVersion(): void {
  const versionEl = document.getElementById('version');
  if (versionEl) {
    versionEl.textContent = `v${browser.runtime.getManifest().version}`;
  }
}

function renderToggle(): void {
  (document.getElementById('enabled') as HTMLInputElement).checked = settings.enabled;
}

function applyTranslations(): void {
  const lang = settings.language;

  document.querySelectorAll('[data-i18n]').forEach((el) => {
    const key = el.getAttribute('data-i18n');
    if (!key) return;
    // Skip todayHidden — rendered dynamically with count param
    if (key === 'todayHidden') return;
    el.textContent = t(key as Parameters<typeof t>[0], lang);
  });
}

async function renderStats(): Promise<void> {
  const lang = settings.language;
  const statsEl = document.getElementById('today-stats');
  if (!statsEl) return;

  try {
    const todayStats = await getTodayStats();
    const count = todayStats.totalHidden;
    statsEl.textContent = t('todayHidden', lang, { count: String(count) });
  } catch {
    statsEl.textContent = t('todayHidden', lang, { count: '0' });
  }
}

async function renderInfo(): Promise<void> {
  // 총 숨김
  const totalEl = document.getElementById('total-hidden');
  if (totalEl) {
    const total = await getAllTimeTotal();
    totalEl.textContent = `${total}개`;
  }

  // 키워드 필터 상태
  const kwEl = document.getElementById('keyword-filter-status');
  if (kwEl) {
    kwEl.textContent = settings.keywordFilterEnabled ? 'ON' : 'OFF';
    kwEl.style.color = settings.keywordFilterEnabled ? '#00ba7c' : '#536471';
  }

  // 팔로우 동기화 상태
  const followEl = document.getElementById('follow-sync-status');
  if (followEl) {
    try {
      const stored = await browser.storage.local.get([STORAGE_KEYS.FOLLOW_LIST]);
      const followList = (stored[STORAGE_KEYS.FOLLOW_LIST] as string[] | undefined) ?? [];
      followEl.textContent = followList.length > 0 ? `${followList.length}명` : '미동기화';
      followEl.style.color = followList.length > 0 ? '#e7e9ea' : '#536471';
    } catch {
      followEl.textContent = '-';
    }
  }
}

async function renderUpdateBanner(): Promise<void> {
  const banner = document.getElementById('update-banner');
  if (!banner) return;

  try {
    const result = await browser.storage.local.get([UPDATE_FLAG_KEY]);
    const showBanner = (result[UPDATE_FLAG_KEY] as boolean | undefined) ?? false;
    banner.style.display = showBanner ? 'flex' : 'none';
    if (showBanner) {
      const version = browser.runtime.getManifest().version;
      const textEl = document.getElementById('update-text');
      if (textEl) textEl.textContent = t('updateBannerVersion', settings.language, { version });
    }
  } catch {
    banner.style.display = 'none';
  }
}

function getShareUrl(): string {
  const statsEl = document.getElementById('today-stats');
  const countMatch = statsEl?.textContent?.match(/\d+/);
  const count = countMatch ? countMatch[0] : '0';
  const lang = settings.language;
  const text = t('shareText', lang, { count });
  const landingUrl = 'https://blue-badge.fotone.moe/';
  return `https://x.com/intent/tweet?text=${encodeURIComponent(text)}&url=${encodeURIComponent(landingUrl)}`;
}

function bindEvents(): void {
  document.getElementById('enabled')!.addEventListener('change', async () => {
    settings.enabled = (document.getElementById('enabled') as HTMLInputElement).checked;
    await saveSettings(settings);
  });

  document.getElementById('share-btn')!.addEventListener('click', () => {
    openPage(getShareUrl());
  });

  document.getElementById('open-settings-btn')!.addEventListener('click', () => {
    openPage((browser.runtime.getURL as (path: string) => string)('/dashboard.html'));
  });

  document.getElementById('update-dismiss')?.addEventListener('click', async () => {
    await browser.storage.local.set({ [UPDATE_FLAG_KEY]: false });
    const banner = document.getElementById('update-banner');
    if (banner) banner.style.display = 'none';
  });
}

init();
