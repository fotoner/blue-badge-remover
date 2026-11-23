import { XWEB_BADGE_SELECTOR } from '@shared/constants';

const VERIFIED_BADGE_SELECTOR = '[data-testid="icon-verified"]';
// 새 웹 앱(xweb, 2026-11-23 실측): 배지는 path 모양이 아니라 svg > use의 심볼 이름으로 종류를 가른다 (#142)
const XWEB_PREMIUM_BADGE_HREF = '#icon-verified-premium-color';

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
  const badge = tweetElement.querySelector(`${VERIFIED_BADGE_SELECTOR}, ${XWEB_BADGE_SELECTOR}`);
  return badge !== null && isBlueBadgeElement(badge);
}

/**
 * [data-testid="icon-verified"] 요소(xweb은 use[href^="#icon-verified-"] 또는 그 svg)를 직접 받아 파딱 여부 판정.
 * 호출자가 이미 뱃지를 스코프/탐색해 둔 경우 사용 (예: 작성자 영역 한정 판정).
 */
export function isBlueBadgeElement(badge: Element): boolean {
  const svg = badge.closest('svg') ?? badge;

  // xweb: 심볼 이름이 파딱(premium)일 때만 파딱. business·government 등 다른 심볼은 모두 아니다 (#142)
  const xwebUse = badge.matches(XWEB_BADGE_SELECTOR) ? badge : svg.querySelector(XWEB_BADGE_SELECTOR);
  if (xwebUse) return xwebUse.getAttribute('href') === XWEB_PREMIUM_BADGE_HREF;

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
