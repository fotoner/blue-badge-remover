const VERIFIED_BADGE_SELECTOR = '[data-testid="icon-verified"]';

// X 파란 뱃지의 고유 fill 색상
const BLUE_BADGE_COLOR = '#1d9bf0';

/**
 * SVG 폴백: 트윗 요소 내 뱃지를 확인하여 파딱(파란 뱃지) 여부를 반환.
 *
 * 접근법: "금딱/회딱이 아니면 파딱"이 아니라,
 *         "파란색 단색 뱃지가 확인되면 파딱, 아니면 false".
 *
 * 이렇게 하면 새로운 뱃지 유형이 추가되어도 안전하게 동작.
 */
export function detectBadgeSvg(tweetElement: Element): boolean {
  const badge = tweetElement.querySelector(VERIFIED_BADGE_SELECTOR);
  if (!badge) return false;

  const svg = badge.closest('svg') ?? badge;

  // linearGradient가 있으면 금딱 — 확실히 파딱 아님
  if (svg.querySelector('linearGradient')) return false;

  // stop 요소가 있으면 그래디언트 뱃지 — 파딱 아님
  if (svg.querySelectorAll('stop').length > 0) return false;

  // 파란색 단색 fill을 명시적으로 확인
  const allFills: string[] = [];

  const svgFill = svg.getAttribute('fill');
  if (svgFill) allFills.push(svgFill.toLowerCase());

  const children = svg.querySelectorAll('path, circle, g');
  for (const child of children) {
    const childFill = child.getAttribute('fill');
    if (childFill && !childFill.startsWith('url(')) {
      allFills.push(childFill.toLowerCase());
    }
  }

  // fill이 하나도 없으면 판단 불가 — 안전하게 false
  if (allFills.length === 0) return false;

  // 파란색(#1d9bf0)이 포함되어 있으면 파딱
  return allFills.some((f) => f.includes(BLUE_BADGE_COLOR));
}
