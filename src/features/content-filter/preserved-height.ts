// src/features/content-filter/preserved-height.ts
// 뒤로가기/모달 닫기(popstate) 직후 짧은 창 동안에는 숨긴 트윗의 높이를 보존해
// X의 스크롤 위치 복원이 어긋나지 않게 한다. 창이 끝나면 반드시 해제해야
// 숨긴 트윗 크기의 빈 공간이 타임라인에 남지 않는다 (#43).
import { COLLAPSED_ATTR, ORIGINAL_CONTENT_KEY, PRESERVED_HEIGHT_ATTR } from './hide-attrs';

/** remove 모드: 내용만 가리고 레이아웃 높이는 유지 */
export function hideKeepingHeight(element: HTMLElement, height: number): void {
  element.style.visibility = 'hidden';
  element.style.pointerEvents = 'none';
  element.style.minHeight = `${height}px`;
  element.setAttribute(PRESERVED_HEIGHT_ATTR, String(height));
}

/** collapse 모드: 플레이스홀더가 원래 높이를 차지하도록 표시 */
export function markPreservedPlaceholder(element: HTMLElement, placeholder: HTMLElement, height: number): void {
  placeholder.style.minHeight = `${height}px`;
  element.setAttribute(PRESERVED_HEIGHT_ATTR, String(height));
}

function releaseOne(element: HTMLElement): void {
  element.removeAttribute(PRESERVED_HEIGHT_ATTR);
  if (element.getAttribute(ORIGINAL_CONTENT_KEY) === 'hidden') {
    element.style.visibility = '';
    element.style.pointerEvents = '';
    element.style.minHeight = '';
    element.style.display = 'none';
    return;
  }
  for (const child of Array.from(element.children)) {
    if (child instanceof HTMLElement && child.hasAttribute(COLLAPSED_ATTR)) child.style.minHeight = '';
  }
}

/**
 * 보존한 높이를 모두 해제하고 원래 숨김 방식으로 되돌린다.
 * 스크롤은 직접 보정하지 않는다 — X 타임라인이 셀 크기 변화에 맞춰 스스로 스크롤을 조정하므로,
 * 여기서 scrollBy로 한 번 더 보정하면 이중 보정으로 화면이 맨 위까지 튄다(실브라우저 확인).
 */
export function releasePreservedHeights(): void {
  const targets = document.querySelectorAll<HTMLElement>(`[${PRESERVED_HEIGHT_ATTR}]`);
  if (targets.length === 0) return;
  targets.forEach(releaseOne);
}
