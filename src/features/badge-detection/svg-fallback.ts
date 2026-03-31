const VERIFIED_BADGE_SELECTOR = '[data-testid="icon-verified"]';

// 금딱 gradient에 사용되는 stop-color 값들
const GOLD_STOP_COLORS = [
  '#f4e72a', '#cd8105', '#cb7b00', '#f4ec26', '#e2b719', '#f9e87f', '#d18800',
  '#E8B829', '#F4D03F', '#D4A72C', '#CFB53B',
];
const GREY_COLORS = ['#829AAB', '#829aab'];

export function detectBadgeSvg(tweetElement: Element): boolean {
  const badge = tweetElement.querySelector(VERIFIED_BADGE_SELECTOR);
  if (!badge) return false;

  const svg = badge.closest('svg') ?? badge;

  // 금딱은 linearGradient를 사용함 — 파란 뱃지는 단색
  if (svg.querySelector('linearGradient')) return false;

  // 직접 fill 색상 확인 (회색딱 등)
  const fill = (svg.getAttribute('fill') ?? '').toLowerCase();
  const style = (svg.getAttribute('style') ?? '').toLowerCase();

  if (isNonBlueColor(fill) || isNonBlueColor(style)) return false;

  // 자식 요소 fill 확인
  const children = svg.querySelectorAll('path, circle, g');
  for (const child of children) {
    const childFill = (child.getAttribute('fill') ?? '').toLowerCase();
    if (isNonBlueColor(childFill)) return false;
  }

  return true;
}

function isNonBlueColor(colorStr: string): boolean {
  if (!colorStr) return false;
  for (const gold of GOLD_STOP_COLORS) {
    if (colorStr.includes(gold.toLowerCase())) return true;
  }
  for (const grey of GREY_COLORS) {
    if (colorStr.includes(grey.toLowerCase())) return true;
  }
  if (colorStr.includes('gold') || colorStr.includes('grey') || colorStr.includes('gray')) return true;
  return false;
}
