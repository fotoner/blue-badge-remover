import type { FilterRule, WildcardMatcher } from '@shared/types';
import { normalizeForMatch, removeInvisible } from '@shared/text/normalize';

/** 이미 normalizeForMatch를 거친 텍스트를 받는 와일드카드 매처. 판정마다 텍스트를 한 번만 정규화하려고 둔다 (#112) */
export interface NormalizedWildcardMatcher extends WildcardMatcher {
  testNormalized(normalizedText: string): boolean;
}

/**
 * `*`로 나뉜 조각을 순서대로 indexOf로 찾는 선형 시간 매처 (대소문자 무시).
 * 정규식 `.*` 변환은 가져온 필터 팩의 악성 패턴에서 백트래킹이 폭발했다 (ReDoS).
 * 패턴이 `*`로 시작/끝나지 않으면 텍스트의 시작/끝에 고정한다.
 * 패턴은 만들 때, 텍스트는 판정할 때 같은 normalizeForMatch를 거친다 (#112).
 */
function createWildcardMatcher(pattern: string): NormalizedWildcardMatcher {
  // ASCII `*`가 있으면 그것만 와일드카드로 보고, 조각은 나눈 뒤 정규화한다. 조각 안의 전각 ＊는 리터럴로 남는다(#112 이전과 같다).
  // ASCII `*`가 없으면 줄 맨 앞·맨 끝의 전각 ＊만 와일드카드다(얼굴 문자 안의 ＊는 리터럴) (#112 컨실 r2)
  const parts = pattern.includes('*')
    ? pattern.split('*').map((part) => normalizeForMatch(part))
    : edgeStarParts(pattern);
  const head = parts[0] ?? '';
  const tail = parts.length > 1 ? (parts[parts.length - 1] ?? '') : '';
  const middle = parts.slice(1, -1).filter((part) => part.length > 0);

  function testNormalized(text: string): boolean {
    if (!text.startsWith(head)) return false;
    let position = head.length;
    for (const part of middle) {
      const index = text.indexOf(part, position);
      if (index === -1) return false;
      position = index + part.length;
    }
    return text.length - tail.length >= position && text.endsWith(tail);
  }

  return { test: (text) => testNormalized(normalizeForMatch(text)), testNormalized };
}

/**
 * 줄 맨 앞이 문법 기호인지 본다. 일본어 IME로 친 전각 「！」「＠＠」「＊」도 같은 기호로 인정한다 (#112).
 * 줄 전체가 아니라 앞 글자 하나씩 NFKC를 적용한다. 「‼」(→ `!!`)처럼 기호로 시작하는
 * 키워드가 주석으로 바뀌는 일을 막기 위해서다.
 */
function leadsWith(line: string, symbol: string): boolean {
  const chars = [...line].slice(0, symbol.length);
  return chars.length === symbol.length && chars.every((char, i) => char.normalize('NFKC') === symbol[i]);
}

const STARS_ONLY = /^\*+$/;

/** ASCII `*`가 아닌 별표 변형(전각 ＊ 등) */
function isStarVariant(char: string | undefined): boolean {
  return char !== undefined && char !== '*' && char.normalize('NFKC') === '*';
}

/** 맨 앞·맨 끝의 별표 변형만 와일드카드로 나눈 조각. 가운데 별표 변형은 리터럴로 정규화한다 */
function edgeStarParts(pattern: string): string[] {
  const chars = [...pattern];
  let start = 0;
  while (start < chars.length && isStarVariant(chars[start])) start += 1;
  let end = chars.length;
  while (end > start && isStarVariant(chars[end - 1])) end -= 1;
  const core = normalizeForMatch(chars.slice(start, end).join(''));
  return [...(start > 0 ? [''] : []), core, ...(end < chars.length ? [''] : [])];
}

/** ASCII `*`가 있거나, 맨 앞·맨 끝이 별표 변형이면서 별표뿐인 줄이 아니면 와일드카드 줄이다 */
function isWildcardLine(line: string): boolean {
  if (line.includes('*')) return true;
  const chars = [...line];
  return (isStarVariant(chars[0]) || isStarVariant(chars[chars.length - 1])) && !isOnlyStarVariants(line);
}

/**
 * ASCII `*` 없이 전각 ＊ 같은 별표 변형만 있는 줄(`＊`, `＊＊`)은 정규화하면 `*`뿐이라 와일드카드로 읽으면
 * 모든 프로필에 걸린다. 이전에는 리터럴 키워드였으므로 그대로 키워드로 둔다 (#112).
 * ASCII `*`가 있는 줄은 ASCII `*`만 와일드카드로 보므로 여기에 해당하지 않는다.
 */
function isOnlyStarVariants(line: string): boolean {
  return !line.includes('*') && STARS_ONLY.test(normalizeForMatch(line));
}

export function parseFilterList(text: string): FilterRule[] {
  const rules: FilterRule[] = [];

  for (const rawLine of text.split('\n')) {
    const line = rawLine.trim();
    if (!line || leadsWith(line, '!')) continue;

    if (leadsWith(line, '@@')) {
      const handle = normalizeForMatch([...line].slice(2).join('')).trim();
      rules.push({ type: 'exception', handle });
    } else if (isWildcardLine(removeInvisible(line))) {
      // 별표 위치는 제로폭 문자를 지운 줄로 본다. 복사한 규칙에 붙은 제로폭 문자가 해석을 바꾸지 않게 한다 (#112 컨실 r3)
      rules.push({ type: 'wildcard', pattern: createWildcardMatcher(removeInvisible(line)), original: line });
    } else {
      rules.push({ type: 'keyword', value: line });
    }
  }

  return rules;
}
