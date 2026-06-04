import {
  DEFAULT_FILTER_LIST,
  getCustomFilterList,
  getDisabledFilterCategories,
  parseCategories,
  saveCustomFilterList,
} from '@features/keyword-filter';
import { getSettings, saveSettings } from '@features/settings';
import { renderCategories } from './categories';
import { bindPackEvents, renderFilterPacks } from './filter-pack-list';
import { updateStats } from './rule-stats';

async function init(): Promise<void> {
  const customEl = document.getElementById('custom-filters') as HTMLTextAreaElement;
  const saveBtn = document.getElementById('save-btn') as HTMLButtonElement;
  const saveStatus = document.getElementById('save-status') as HTMLSpanElement;
  const defaultFilterToggle = document.getElementById('default-filter-enabled') as HTMLInputElement;
  const categoryListEl = document.getElementById('category-list') as HTMLDivElement;

  const categories = parseCategories(DEFAULT_FILTER_LIST);
  let [customText, settings, disabledCategories] = await Promise.all([
    getCustomFilterList(),
    getSettings(),
    getDisabledFilterCategories(),
  ]);

  const refreshStats = (): void => {
    void updateStats({
      defaultFilterEnabled: defaultFilterToggle.checked,
      disabledCategories,
      custom: customEl.value,
      categories,
    });
  };

  const renderCategoryList = (): void => {
    renderCategories({
      container: categoryListEl,
      categories,
      disabledCategories,
      masterEnabled: defaultFilterToggle.checked,
      onChange: (next) => {
        disabledCategories = next;
        refreshStats();
      },
    });
  };

  customEl.value = customText;
  defaultFilterToggle.checked = settings.defaultFilterEnabled;

  renderCategoryList();
  refreshStats();

  defaultFilterToggle.addEventListener('change', async () => {
    settings = { ...await getSettings(), defaultFilterEnabled: defaultFilterToggle.checked };
    await saveSettings(settings);
    renderCategoryList();
    refreshStats();
  });

  saveBtn.addEventListener('click', async () => {
    customText = customEl.value;
    try {
      await saveCustomFilterList(customText);
      refreshStats();
      saveStatus.textContent = '저장 완료';
      saveStatus.className = 'save-status success';
    } catch {
      saveStatus.textContent = '저장 실패';
      saveStatus.className = 'save-status error';
    }
    setTimeout(() => { saveStatus.textContent = ''; }, 2000);
  });

  await renderFilterPacks(refreshStats);
  bindPackEvents({ customEl, onChange: refreshStats });
}

init();
