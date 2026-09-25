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

/** 화면에 걸쳐 있는 첫 트윗 — 해제 전후 위치를 비교해 스크롤을 보정하는 기준 */
function findViewportAnchor(): HTMLElement | null {
  const tweets = document.querySelectorAll<HTMLElement>(`article[data-testid="tweet"]:not([${PRESERVED_HEIGHT_ATTR}])`);
  for (const tweet of Array.from(tweets)) {
    if (tweet.style.display === 'none') continue;
    if (tweet.getBoundingClientRect().bottom > 0) return tweet;
  }
  return null;
}

/**
 * 보존한 높이를 모두 해제하고 원래 숨김 방식으로 되돌린다.
 * 화면 위쪽 트윗이 줄어들면 보이는 내용이 당겨지므로, 기준 트윗 위치 변화만큼 스크롤을 보정한다
 * (브라우저 스크롤 앵커링이 이미 보정했다면 변화가 0이라 아무것도 하지 않는다).
 */
export function releasePreservedHeights(): void {
  const targets = document.querySelectorAll<HTMLElement>(`[${PRESERVED_HEIGHT_ATTR}]`);
  if (targets.length === 0) return;
  const anchor = findViewportAnchor();
  const before = anchor?.getBoundingClientRect().top;
  targets.forEach(releaseOne);
  if (!anchor || before === undefined) return;
  const shift = anchor.getBoundingClientRect().top - before;
  if (shift !== 0) window.scrollBy(0, shift);
}
