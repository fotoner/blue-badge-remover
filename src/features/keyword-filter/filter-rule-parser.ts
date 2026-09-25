import type { FilterRule, WildcardMatcher } from '@shared/types';

/**
 * `*`로 나뉜 조각을 순서대로 indexOf로 찾는 선형 시간 매처 (대소문자 무시).
 * 정규식 `.*` 변환은 가져온 필터 팩의 악성 패턴에서 백트래킹이 폭발했다 (ReDoS).
 * 패턴이 `*`로 시작/끝나지 않으면 텍스트의 시작/끝에 고정한다.
 */
function createWildcardMatcher(pattern: string): WildcardMatcher {
  const parts = pattern.toLowerCase().split('*');
  const head = parts[0] ?? '';
  const tail = parts.length > 1 ? (parts[parts.length - 1] ?? '') : '';
  const middle = parts.slice(1, -1).filter((part) => part.length > 0);

  return {
    test(text: string): boolean {
      const lower = text.toLowerCase();
      if (!lower.startsWith(head)) return false;
      let position = head.length;
      for (const part of middle) {
        const index = lower.indexOf(part, position);
        if (index === -1) return false;
        position = index + part.length;
      }
      return lower.length - tail.length >= position && lower.endsWith(tail);
    },
  };
}

export function parseFilterList(text: string): FilterRule[] {
  const rules: FilterRule[] = [];

  for (const rawLine of text.split('\n')) {
    const line = rawLine.trim();
    if (!line || line.startsWith('!')) continue;

    if (line.startsWith('@@')) {
      rules.push({ type: 'exception', handle: line.slice(2).trim() });
    } else if (line.includes('*')) {
      rules.push({ type: 'wildcard', pattern: createWildcardMatcher(line), original: line });
    } else {
      rules.push({ type: 'keyword', value: line });
    }
  }

  return rules;
}
