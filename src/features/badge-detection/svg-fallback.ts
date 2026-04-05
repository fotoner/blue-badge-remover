const VERIFIED_BADGE_SELECTOR = '[data-testid="icon-verified"]';

/**
 * SVG 폴백: 트윗 요소 내 뱃지를 확인하여 파딱(파란 뱃지) 여부를 반환.
 *
 * X 뱃지 SVG 구조 (2026-04 기준):
 * - 파딱(블루): path 1개, fill 없음 (CSS currentColor), computedColor rgb(29,155,240)
 * - 금딱(골드): path 3개, linearGradient 2개, fill="url(#gradient)" + "#d18800"
 * - 회딱(그레이): path 3개, linearGradient 2개, fill="url(#gradient)" + grey 계열
 *
 * 판별: path 1개 + computedColor 파란색 = 파딱. 그 외 전부 false.
 */
export function detectBadgeSvg(tweetElement: Element): boolean {
  const badge = tweetElement.querySelector(VERIFIED_BADGE_SELECTOR);
  if (!badge) return false;

  const svg = badge.closest('svg') ?? badge;

  // 금딱/회딱은 linearGradient를 사용 — 즉시 false
  if (svg.querySelector('linearGradient')) return false;

  // 파딱 SVG는 path가 정확히 1개
  const paths = svg.querySelectorAll('path');
  if (paths.length !== 1) return false;

  // 파딱은 CSS currentColor로 파란색 적용
  const computed = getComputedStyle(svg as Element).color;
  if (computed === 'rgb(29, 155, 240)') return true;

  return false;
}
