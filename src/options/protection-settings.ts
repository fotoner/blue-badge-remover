import { getProtectedKeywords, saveProtectedKeywords } from '@features/keyword-filter';

export async function initProtectionSettings(): Promise<void> {
  const textarea = document.getElementById('protected-keywords') as HTMLTextAreaElement | null;
  const button = document.getElementById('save-protected-keywords') as HTMLButtonElement | null;
  const status = document.getElementById('protected-keywords-status');
  if (!textarea || !button) return;
  textarea.value = (await getProtectedKeywords()).join('\n');
  button.addEventListener('click', async () => {
    await saveProtectedKeywords(textarea.value.split('\n'));
    if (status) status.textContent = '저장 완료';
    setTimeout(() => { if (status) status.textContent = ''; }, 2000);
  });
}
