// src/features/content-filter/hide-attrs.ts
// 숨김 상태를 DOM에 기록하는 data 속성 — tweet-hider / preserved-height 공용

export const ORIGINAL_CONTENT_KEY = 'data-bbr-original';
export const HIDE_REASON_ATTR = 'data-bbr-reason';
export const COLLAPSED_ATTR = 'data-bbr-collapsed';
export const EXPANDED_ATTR = 'data-bbr-expanded';
export const EXPANDED_ACTIONS_ATTR = 'data-bbr-expanded-actions';
export const HIDDEN_QUOTE_ATTR = 'data-bbr-hidden-quote';
/** 뒤로가기 스크롤 복원 창 동안 높이를 보존한 채 숨긴 트윗 — 창이 끝나면 해제한다 */
export const PRESERVED_HEIGHT_ATTR = 'data-bbr-preserved-height';
