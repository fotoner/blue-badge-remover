const VERIFIED_BADGE_SELECTOR = '[data-testid="icon-verified"]';

/**
 * SVG 폴백: 트윗 요소 내 뱃지를 확인하여 파딱(파란 뱃지) 여부를 반환.
 *
 * X 뱃지 SVG 구조 (2026-04 기준):
 * - 파딱(블루): path 1개, fill 속성 없음 (CSS currentColor 사용)
 * - 금딱(골드): path 3개, linearGradient 있음, fill="url(#gradient)"
 * - 회딱(그레이): path 3개, linearGradient 있음
 *
 * 판별: linearGradient 없음 + path 1개 + fill 속성 없음 = 파딱.
 * getComputedStyle 호출하지 않음 (reflow 방지).
 */
export function detectBadgeSvg(tweetElement: Element): boolean {
  const badge = tweetElement.querySelector(VERIFIED_BADGE_SELECTOR);
  if (!badge) return false;

  const svg = badge.closest('svg') ?? badge;

  // 금딱/회딱: linearGradient 있으면 즉시 false
  if (svg.querySelector('linearGradient')) return false;

  // 파딱: path 정확히 1개 (금딱/회딱은 3개)
  if (svg.querySelectorAll('path').length !== 1) return false;

  // 파딱: path에 fill 속성이 없음 (CSS currentColor 사용)
  // 금딱/회딱: fill="url(#gradient)" 또는 fill="#d18800" 등
  const path = svg.querySelector('path');
  if (!path) return false;
  const fill = path.getAttribute('fill');
  if (fill) return false; // fill 속성이 있으면 파딱 아님

  return true;
}
