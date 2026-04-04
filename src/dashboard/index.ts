import { browser } from 'wxt/browser';
import { getSettings, saveSettings } from '@features/settings';
import { t, type Language } from '@shared/i18n';
import type { Settings } from '@shared/types';
import { renderStats } from './stats-section';
import { renderFilters, bindFilterEvents } from './filter-section';
import {
  renderSettingsToDOM,
  bindSettingsEvents,
  renderSyncStatus,
} from './settings-section';

let settings: Settings;

async function init(): Promise<void> {
  settings = await getSettings();

  renderVersion();
  renderSettingsToDOM(settings);
  applyTranslations(settings.language);
  await renderSyncStatus(settings.language);
  await renderStats();
  await renderFilters(settings);
  bindAllEvents();
  await checkUpdateBanner();
}

function renderVersion(): void {
  const manifest = browser.runtime.getManifest();
  const el = document.getElementById('ext-version');
  if (el) el.textContent = manifest.version;
  const tag = document.getElementById('version-display');
  if (tag) tag.textContent = `v${manifest.version}`;
}

function applyTranslations(lang: Language): void {
  document.querySelectorAll('[data-i18n]').forEach((el) => {
    const key = el.getAttribute('data-i18n');
    if (key) {
      el.textContent = t(key as Parameters<typeof t>[0], lang);
    }
  });

  document.querySelectorAll('[data-i18n-placeholder]').forEach((el) => {
    const key = el.getAttribute('data-i18n-placeholder');
    if (key && el instanceof HTMLInputElement) {
      el.placeholder = t(key as Parameters<typeof t>[0], lang);
    }
  });
}

async function checkUpdateBanner(): Promise<void> {
  const result = await browser.storage.local.get(['bbr-update-available']);
  const available = result['bbr-update-available'] as boolean | undefined;
  const banner = document.getElementById('update-banner');
  if (banner) {
    banner.style.display = available ? 'flex' : 'none';
  }
}

function bindAllEvents(): void {
  const save = async (): Promise<void> => {
    settings.filter.timeline = checked('filter-timeline');
    settings.filter.replies = checked('filter-replies');
    settings.filter.search = checked('filter-search');
    settings.filter.bookmarks = checked('filter-bookmarks');
    settings.retweetFilter = checked('retweetFilter');
    settings.debugMode = checked('debugMode');
    settings.keywordCollectorEnabled = checked('keywordCollectorEnabled');
    settings.language = (
      document.getElementById('language') as HTMLSelectElement
    ).value as Settings['language'];
    settings.hideMode = (
      document.querySelector('input[name="hideMode"]:checked') as HTMLInputElement
    ).value as Settings['hideMode'];
    settings.quoteMode = (
      document.querySelector('input[name="quoteMode"]:checked') as HTMLInputElement
    ).value as Settings['quoteMode'];
    settings.defaultFilterEnabled = checked('defaultFilterEnabled');
    await saveSettings(settings);
  };

  document.querySelectorAll('input').forEach((input) => {
    input.addEventListener('change', save);
  });

  const languageSelect = document.getElementById('language') as HTMLSelectElement;
  languageSelect.addEventListener('change', async () => {
    await save();
    applyTranslations(settings.language);
    await renderSyncStatus(settings.language);
  });

  bindSettingsEvents(settings);
  bindFilterEvents(settings);

  // Update banner dismiss
  document.getElementById('update-dismiss')?.addEventListener('click', async () => {
    await browser.storage.local.set({ 'bbr-update-available': false });
    const banner = document.getElementById('update-banner');
    if (banner) banner.style.display = 'none';
  });

  // Share button
  document.getElementById('share-btn')?.addEventListener('click', () => {
    const count = document.getElementById('hero-count')?.textContent ?? '0개';
    const num = parseInt(count, 10) || 0;
    const text = `오늘 Blue Badge Remover로 파딱 트윗 ${num}개를 숨겼습니다!`;
    const url = 'https://chromewebstore.google.com/detail/blue-badge-remover/gpoiflbcmmpihejhgnomdkaofdgjlbhm';
    window.open(
      `https://x.com/intent/tweet?text=${encodeURIComponent(text)}&url=${encodeURIComponent(url)}`,
      '_blank',
    );
  });
}

function checked(id: string): boolean {
  return (document.getElementById(id) as HTMLInputElement).checked;
}

init();
