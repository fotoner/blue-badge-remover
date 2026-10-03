import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { t, type Language, type TranslationKey } from '@shared/i18n';

// 영어/일본어 브라우저에서 고급 필터·화이트리스트·수집기 화면이 한국어로만 보이던 문제
const PAGES = ['popup', 'options', 'whitelist', 'collector'] as const;
const HANGUL = /[ㄱ-ㆎ가-힣]/;
const LANGUAGES: Language[] = ['ko', 'en', 'ja'];

function loadPage(page: string): Document {
  const html = readFileSync(resolve(process.cwd(), `entrypoints/${page}/index.html`), 'utf8');
  return new DOMParser().parseFromString(html, 'text/html');
}

function ownText(el: Element): string {
  return Array.from(el.childNodes)
    .filter((node) => node.nodeType === Node.TEXT_NODE)
    .map((node) => node.textContent ?? '')
    .join('')
    .trim();
}

function untranslated(doc: Document): string[] {
  const found: string[] = [];
  doc.querySelectorAll('title, body *').forEach((el) => {
    if (el.closest('[data-i18n]')) return;
    const text = ownText(el);
    if (text && HANGUL.test(text)) found.push(`<${el.tagName.toLowerCase()}> ${text}`);
  });
  doc.querySelectorAll('[placeholder]').forEach((el) => {
    if (el.hasAttribute('data-i18n-placeholder')) return;
    const placeholder = el.getAttribute('placeholder') ?? '';
    if (HANGUL.test(placeholder)) found.push(`placeholder ${placeholder}`);
  });
  return found;
}

function translationKeys(doc: Document): string[] {
  const keys = Array.from(doc.querySelectorAll('[data-i18n]')).map((el) => el.getAttribute('data-i18n')!);
  const placeholders = Array.from(doc.querySelectorAll('[data-i18n-placeholder]'))
    .map((el) => el.getAttribute('data-i18n-placeholder')!);
  return [...keys, ...placeholders];
}

describe.each(PAGES)('%s 화면 i18n', (page) => {
  const doc = loadPage(page);

  it('한국어 텍스트와 placeholder는 모두 data-i18n으로 번역된다', () => {
    expect(untranslated(doc)).toEqual([]);
  });

  it('data-i18n 키는 모든 언어에 번역이 있고, 영어/일본어에 한글이 없다', () => {
    for (const lang of LANGUAGES) {
      for (const key of translationKeys(doc)) {
        const text = t(key as TranslationKey, lang);
        expect(text, `${lang}:${key}`).toBeTruthy();
        expect(text, `${lang}:${key}`).not.toBe(key);
        if (lang !== 'ko') expect(HANGUL.test(text), `${lang}:${key} = ${text}`).toBe(false);
      }
    }
  });
});
