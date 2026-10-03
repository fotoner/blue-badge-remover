// src/shared/i18n/types.ts
import type { ko } from './ko';

export type Language = 'ko' | 'en' | 'ja';

export type TranslationKey = keyof typeof ko;

export type Translations = Record<TranslationKey, string>;
