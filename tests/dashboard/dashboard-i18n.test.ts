import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { t, type Language } from '@shared/i18n';

const html = readFileSync(resolve(process.cwd(), 'entrypoints/dashboard/index.html'), 'utf8');
const doc = new DOMParser().parseFromString(html, 'text/html');
const HANGUL = /[ㄱ-ㆎ가-힣]/;

function untranslatedTexts(): string[] {
  const found: string[] = [];
  doc.body.querySelectorAll('*').forEach((el) => {
    if (el.closest('[data-i18n]')) return;
    // 언어 선택지는 각 언어를 자기 언어 이름으로 보여주는 것이 의도 (한국어 / English / 日本語)
    if (el.closest('#language')) return;
    // 이 요소에 직접 속한 텍스트만 본다 (자식 요소 텍스트는 자식에서 검사)
    const ownText = Array.from(el.childNodes)
      .filter((node) => node.nodeType === Node.TEXT_NODE)
      .map((node) => node.textContent ?? '')
      .join('')
      .trim();
    if (ownText && HANGUL.test(ownText)) found.push(`<${el.tagName.toLowerCase()}${el.id ? `#${el.id}` : ''}> ${ownText}`);
  });
  return found;
}

// 언어를 English/日本語로 바꿔도 일부 제목/버튼이 한국어로 남던 문제
describe('dashboard i18n', () => {
  it('한국어 텍스트를 가진 요소는 모두 data-i18n으로 번역된다', () => {
    expect(untranslatedTexts()).toEqual([]);
  });

  it('data-i18n 키는 모든 언어에 번역이 있다', () => {
    const keys = Array.from(doc.querySelectorAll('[data-i18n]')).map((el) => el.getAttribute('data-i18n')!);
    for (const lang of ['ko', 'en', 'ja'] as Language[]) {
      for (const key of keys) {
        const text = t(key as Parameters<typeof t>[0], lang);
        expect(text, `${lang}:${key}`).toBeTruthy();
        expect(text, `${lang}:${key}`).not.toBe(key);
        if (lang !== 'ko') expect(HANGUL.test(text), `${lang}:${key} = ${text}`).toBe(false);
      }
    }
  });
});
