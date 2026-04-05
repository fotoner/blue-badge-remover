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

  // stop-color로 금딱 감지 (linearGradient가 아닌 다른 방식으로 렌더링될 때)
  const stops = svg.querySelectorAll('stop');
  for (const stop of stops) {
    const stopColor = (stop.getAttribute('stop-color') ?? '').toLowerCase();
    if (isNonBlueColor(stopColor)) return false;
  }

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

  // aria-label로 추가 감지 — 금딱은 "인증된 계정" 라벨 사용
  // (파딱도 동일 라벨 사용하므로 이것만으로 판단 불가, 위 체크와 함께 사용)

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
