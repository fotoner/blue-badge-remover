// src/shared/i18n/index.ts
import { en } from './en';
import { ja } from './ja';
import { ko } from './ko';
import type { Language, TranslationKey, Translations } from './types';

export type { Language, TranslationKey, Translations } from './types';
export { translateCategoryName } from './categories';

export const DEFAULT_LANGUAGE: Language = 'ko';

const translations: Record<Language, Translations> = { ko, en, ja };

export function getTranslations(lang: Language): Translations {
  return translations[lang];
}

export function t(key: TranslationKey, lang: Language = DEFAULT_LANGUAGE, params?: Record<string, string>): string {
  const message = translations[lang]?.[key] ?? translations[DEFAULT_LANGUAGE][key] ?? key;
  if (!params) return message;
  return Object.entries(params).reduce<string>(
    (result, [paramKey, value]) => result.replace(`{${paramKey}}`, value),
    message,
  );
}

/** 브라우저 UI 언어(BCP 47) → 지원 언어. 한국어/일본어가 아니면 영어 */
export function detectLanguage(uiLanguage: string | undefined): Language {
  const primary = (uiLanguage ?? '').toLowerCase().split(/[-_]/)[0];
  if (primary === 'ko' || primary === 'ja') return primary;
  return 'en';
}

/** data-i18n(텍스트), data-i18n-placeholder(입력란 안내)를 선택 언어로 바꾼다 */
export function applyTranslations(lang: Language, root: Document = document): void {
  root.documentElement.lang = lang;
  root.querySelectorAll('[data-i18n]').forEach((el) => {
    const key = el.getAttribute('data-i18n');
    if (key) el.textContent = t(key as TranslationKey, lang);
  });
  root.querySelectorAll('[data-i18n-placeholder]').forEach((el) => {
    const key = el.getAttribute('data-i18n-placeholder');
    if (key && (el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement)) {
      el.placeholder = t(key as TranslationKey, lang);
    }
  });
}

// 확장 페이지(옵션·수집기)는 각자 별도 문서라, 페이지 언어를 한 번 정하고 하위 모듈이 tp로 번역한다
let pageLanguage: Language = DEFAULT_LANGUAGE;

export function setPageLanguage(lang: Language): void {
  pageLanguage = lang;
}

export function getPageLanguage(): Language {
  return pageLanguage;
}

export function tp(key: TranslationKey, params?: Record<string, string>): string {
  return t(key, pageLanguage, params);
}
