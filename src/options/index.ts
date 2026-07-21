import { browser } from 'wxt/browser';
import {
  DEFAULT_FILTER_LIST,
  getCustomFilterList,
  parseCategories,
  saveCustomFilterList,
} from '@features/keyword-filter';
import { getSettings, saveSettings } from '@features/settings';
import { STORAGE_KEYS } from '@shared/constants';
import { renderCategories, updateStats } from './categories';
import { bindPackEvents, renderFilterPacks } from './filter-packs';
import { bindSettingsTransferEvents } from './settings-transfer';
import { initProtectionSettings } from './protection-settings';

async function init(): Promise<void> {
  const customEl = document.getElementById('custom-filters') as HTMLTextAreaElement;
  const saveBtn = document.getElementById('save-btn') as HTMLButtonElement;
  const saveStatus = document.getElementById('save-status') as HTMLSpanElement;
  const defaultFilterToggle = document.getElementById('default-filter-enabled') as HTMLInputElement;
  const categoryListEl = document.getElementById('category-list') as HTMLDivElement;
  const categories = parseCategories(DEFAULT_FILTER_LIST);
  const [customText, settings, stored] = await Promise.all([
    getCustomFilterList(),
    getSettings(),
    browser.storage.local.get([STORAGE_KEYS.DISABLED_FILTER_CATEGORIES]),
  ]);
  const disabledCategories =
    (stored[STORAGE_KEYS.DISABLED_FILTER_CATEGORIES] as string[] | undefined) ?? [];

  customEl.value = customText;
  defaultFilterToggle.checked = settings.defaultFilterEnabled;
  renderCategories(categoryListEl, categories, disabledCategories, settings.defaultFilterEnabled);
  void updateStats(settings.defaultFilterEnabled, disabledCategories, customText);

  defaultFilterToggle.addEventListener('change', async () => {
    const current = await getSettings();
    await saveSettings({ ...current, defaultFilterEnabled: defaultFilterToggle.checked });
    renderCategories(categoryListEl, categories, disabledCategories, defaultFilterToggle.checked);
    void updateStats(defaultFilterToggle.checked, disabledCategories, customEl.value);
  });
  saveBtn.addEventListener('click', async () => {
    try {
      await saveCustomFilterList(customEl.value);
      void updateStats(defaultFilterToggle.checked, disabledCategories, customEl.value);
      showSaveStatus(saveStatus, true);
    } catch {
      showSaveStatus(saveStatus, false);
    }
  });
  await renderFilterPacks();
  bindPackEvents(customEl);
  bindSettingsTransferEvents(customEl);
  await initProtectionSettings();
}

function showSaveStatus(element: HTMLSpanElement, success: boolean): void {
  element.textContent = success ? '저장 완료' : '저장 실패';
  element.className = `save-status ${success ? 'success' : 'error'}`;
  setTimeout(() => { element.textContent = ''; }, 2000);
}

void init();
