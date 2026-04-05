const VERIFIED_BADGE_SELECTOR = '[data-testid="icon-verified"]';

/**
 * SVG 폴백: 트윗 요소 내 뱃지를 확인하여 파딱(파란 뱃지) 여부를 반환.
 *
 * X의 뱃지 렌더링 구조:
 * - 파딱(블루): fill 속성 없음, CSS currentColor로 파란색 적용 (computedColor = rgb(29,155,240))
 * - 금딱(골드): linearGradient + fill="url(#gradient)" + #d18800
 * - 회딱(그레이): fill에 회색 계열
 *
 * 접근법: 금딱/회딱의 명확한 시그널(linearGradient, gradient stops, gold/grey fills)이
 *         있으면 false. 그 외에 computedColor가 파란색이면 true.
 */
export function detectBadgeSvg(tweetElement: Element): boolean {
  const badge = tweetElement.querySelector(VERIFIED_BADGE_SELECTOR);
  if (!badge) return false;

  const svg = badge.closest('svg') ?? badge;

  // 금딱: linearGradient가 있으면 확실히 파딱 아님
  if (svg.querySelector('linearGradient')) return false;

  // 금딱: stop 요소가 있으면 그래디언트 뱃지
  if (svg.querySelectorAll('stop').length > 0) return false;

  // 금딱/회딱: fill 속성에 gold/grey 색상이 있으면 파딱 아님
  const children = svg.querySelectorAll('path, circle, g');
  for (const child of children) {
    const fill = (child.getAttribute('fill') ?? '').toLowerCase();
    if (fill && !fill.startsWith('url(') && fill !== 'none' && fill !== 'white' && fill !== '#fff' && fill !== '#ffffff') {
      // 파딱은 fill 속성을 사용하지 않음. fill이 있으면 금딱/회딱.
      return false;
    }
  }

  // 파딱: CSS currentColor로 파란색이 적용됨
  const computed = getComputedStyle(svg as Element).color;
  if (computed === 'rgb(29, 155, 240)') return true;

  return false;
}
