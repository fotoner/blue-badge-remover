import {
  DEFAULT_FILTER_LIST,
  getCustomFilterList,
  saveCustomFilterList,
  parseFilterList,
} from '@features/keyword-filter';

async function init(): Promise<void> {
  const builtinEl = document.getElementById('builtin-filters') as HTMLTextAreaElement;
  const customEl = document.getElementById('custom-filters') as HTMLTextAreaElement;
  const saveBtn = document.getElementById('save-btn') as HTMLButtonElement;
  const saveStatus = document.getElementById('save-status') as HTMLParagraphElement;
  const ruleStats = document.getElementById('rule-stats') as HTMLParagraphElement;

  builtinEl.value = DEFAULT_FILTER_LIST;

  const customText = await getCustomFilterList();
  customEl.value = customText;

  updateStats(DEFAULT_FILTER_LIST, customText, ruleStats);

  saveBtn.addEventListener('click', async () => {
    const text = customEl.value;
    try {
      await saveCustomFilterList(text);
      updateStats(DEFAULT_FILTER_LIST, text, ruleStats);
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
  builtin: string,
  custom: string,
  el: HTMLParagraphElement,
): void {
  const allRules = parseFilterList(builtin + '\n' + custom);
  const nonEmptyNonComment = (builtin + '\n' + custom)
    .split('\n')
    .filter((l) => {
      const t = l.trim();
      return t.length > 0 && !t.startsWith('!');
    }).length;
  const errorCount = Math.max(0, nonEmptyNonComment - allRules.length);
  el.textContent = `활성 규칙: ${allRules.length}개 | 파싱 에러: ${errorCount}개`;
}

init();
