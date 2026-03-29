import {
  DEFAULT_FILTER_LIST,
  getCustomFilterList,
  saveCustomFilterList,
  parseFilterList,
  buildActiveRules,
} from '@features/keyword-filter';
import { getSettings, saveSettings } from '@features/settings';

async function init(): Promise<void> {
  const builtinEl = document.getElementById('builtin-filters') as HTMLTextAreaElement;
  const customEl = document.getElementById('custom-filters') as HTMLTextAreaElement;
  const saveBtn = document.getElementById('save-btn') as HTMLButtonElement;
  const saveStatus = document.getElementById('save-status') as HTMLParagraphElement;
  const ruleStats = document.getElementById('rule-stats') as HTMLParagraphElement;
  const defaultFilterToggle = document.getElementById('default-filter-enabled') as HTMLInputElement;

  builtinEl.value = DEFAULT_FILTER_LIST;

  const [customText, settings] = await Promise.all([
    getCustomFilterList(),
    getSettings(),
  ]);

  customEl.value = customText;
  defaultFilterToggle.checked = settings.defaultFilterEnabled;

  updateStats(settings.defaultFilterEnabled, DEFAULT_FILTER_LIST, customText, ruleStats);

  defaultFilterToggle.addEventListener('change', async () => {
    const current = await getSettings();
    const updated = { ...current, defaultFilterEnabled: defaultFilterToggle.checked };
    await saveSettings(updated);
    updateStats(defaultFilterToggle.checked, DEFAULT_FILTER_LIST, customEl.value, ruleStats);
  });

  saveBtn.addEventListener('click', async () => {
    const text = customEl.value;
    try {
      await saveCustomFilterList(text);
      updateStats(defaultFilterToggle.checked, DEFAULT_FILTER_LIST, text, ruleStats);
      saveStatus.textContent = '저장되었습니다.';
      saveStatus.className = 'save-status success';
    } catch {
      saveStatus.textContent = '저장에 실패했습니다.';
      saveStatus.className = 'save-status error';
    }
    setTimeout(() => {
      saveStatus.textContent = '';
    }, 2000);
  });
}

function updateStats(
  defaultFilterEnabled: boolean,
  builtin: string,
  custom: string,
  el: HTMLParagraphElement,
): void {
  const combined = (defaultFilterEnabled ? builtin + '\n' : '') + custom;
  const allRules = buildActiveRules(defaultFilterEnabled, builtin, custom);
  const nonEmptyNonComment = combined
    .split('\n')
    .filter((l) => {
      const t = l.trim();
      return t.length > 0 && !t.startsWith('!');
    }).length;
  const errorCount = Math.max(0, nonEmptyNonComment - allRules.length);
  el.textContent = `활성 규칙: ${allRules.length}개 | 파싱 에러: ${errorCount}개`;
}

init();
