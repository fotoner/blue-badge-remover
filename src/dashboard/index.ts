import { browser } from 'wxt/browser';
import { getSettings, updateSettings, type SettingsPatch } from '@features/settings';
import { t, type Language } from '@shared/i18n';
import type { Settings } from '@shared/types';
import { renderStats, bindStatsEvents } from './stats-section';
import {
  renderSettingsToDOM,
  bindSettingsEvents,
  renderSyncStatus,
  watchSyncStatus,
} from './settings-section';

let settings: Settings;

async function init(): Promise<void> {
  settings = await getSettings();

  renderVersion();
  renderSettingsToDOM(settings);
  applyTranslations(settings.language);
  await renderSyncStatus(settings.language);
  await renderStats(settings.keywordFilterEnabled);
  bindAllEvents();
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

function readDashboardSettings(): SettingsPatch {
  return {
    filter: {
      timeline: checked('filter-timeline'),
      replies: checked('filter-replies'),
      search: checked('filter-search'),
      bookmarks: checked('filter-bookmarks'),
      lists: checked('filter-lists'),
    },
    retweetFilter: checked('retweetFilter'),
    debugMode: checked('debugMode'),
    milestoneBannerEnabled: checked('milestoneBannerEnabled'),
    keywordFilterEnabled: checked('keywordFilterEnabled'),
    aggressorFilterEnabled: checked('aggressorFilterEnabled'),
    keywordCollectorEnabled: checked('keywordCollectorEnabled'),
    language: (document.getElementById('language') as HTMLSelectElement).value as Settings['language'],
    hideMode: (document.querySelector('input[name="hideMode"]:checked') as HTMLInputElement).value as Settings['hideMode'],
    quoteMode: (document.querySelector('input[name="quoteMode"]:checked') as HTMLInputElement).value as Settings['quoteMode'],
  };
}

function bindAllEvents(): void {
  // 이 화면이 관리하는 필드만 병합 저장 — enabled(popup), defaultFilterEnabled(options)는 건드리지 않음
  const save = async (): Promise<void> => {
    settings = await updateSettings(readDashboardSettings());
  };

  document.querySelectorAll('input[type="checkbox"], input[type="radio"]').forEach((input) => {
    input.addEventListener('change', save);
  });

  const languageSelect = document.getElementById('language') as HTMLSelectElement;
  languageSelect.addEventListener('change', async () => {
    await save();
    applyTranslations(settings.language);
    await renderSyncStatus(settings.language);
  });

  bindSettingsEvents(() => settings.language);
  watchSyncStatus(() => settings.language);
  bindStatsEvents(settings.keywordFilterEnabled);

  // 고급 필터 설정 → options 페이지
  document.getElementById('open-options-btn')?.addEventListener('click', () => {
    void browser.tabs.create({ url: browser.runtime.getURL('/options.html') });
  });

  // Share button
  document.getElementById('share-btn')?.addEventListener('click', () => {
    const count = document.getElementById('hero-count')?.textContent ?? '0';
    const num = String(parseInt(count, 10) || 0);
    const text = t('shareText', settings.language, { count: num });
    const landingUrl = 'https://blue-badge.fotone.moe/';
    window.open(
      `https://x.com/intent/tweet?text=${encodeURIComponent(text)}&url=${encodeURIComponent(landingUrl)}`,
      '_blank',
    );
  });
}

function checked(id: string): boolean {
  const el = document.getElementById(id) as HTMLInputElement | null;
  return el?.checked ?? false;
}

init();
