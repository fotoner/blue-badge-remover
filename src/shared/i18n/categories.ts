// src/shared/i18n/categories.ts
// 내장 필터 카테고리 이름은 비활성 목록의 저장 키로도 쓰인다 — 원문은 그대로 두고 화면 표시만 번역한다
import type { Language } from './types';

const CATEGORY_NAMES: Record<string, Record<Exclude<Language, 'ko'>, string>> = {
  '정치 및 테슬라': { en: 'Politics & Tesla', ja: '政治・テスラ' },
  '경제': { en: 'Economy', ja: '経済' },
  '성적 저급 어그로': { en: 'Sexual engagement bait', ja: '性的な釣り投稿' },
  '호들갑': { en: 'Hype & overreaction', ja: '大げさな煽り' },
  'IT / AI - 로컬 모델 어그로': { en: 'IT / AI - local model hype', ja: 'IT / AI - ローカルモデルの煽り' },
  '욕설': { en: 'Profanity', ja: '暴言' },
  '기타': { en: 'Other', ja: 'その他' },
};

export function translateCategoryName(name: string, lang: Language): string {
  if (lang === 'ko') return name;
  return CATEGORY_NAMES[name]?.[lang] ?? name;
}
