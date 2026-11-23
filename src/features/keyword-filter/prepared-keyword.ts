import { isLatinKeyword, normalizeForMatch } from '@shared/text/normalize';

/**
 * 정규화 뒤 길이가 이 값 이하인 라틴 키워드만 단어 단위로 맞춘다 (#112).
 * ADA·ETH 같은 짧은 토큰은 Canada·something 안에서 오탐이 나지만, 5자 이상은 다른 단어 안에
 * 우연히 들어갈 일이 드물다. 단어 단위로 맞추면 Investing·TeslaFan처럼 원래 잡던 글을 놓친다.
 */
export const WHOLE_WORD_MAX_LENGTH = 4;

/** 규칙 쪽을 미리 정규화한 값. 트윗마다 다시 정규화하지 않으려고 한 번만 만든다 (#112). */
export interface PreparedKeyword {
  text: string;
  /** 길이 4자 이하의 라틴 문자 키워드는 단어 단위로 맞춘다 */
  wholeWord: boolean;
}

export function prepareKeyword(value: string): PreparedKeyword {
  const text = normalizeForMatch(value).trim();
  return { text, wholeWord: [...text].length <= WHOLE_WORD_MAX_LENGTH && isLatinKeyword(text) };
}

// 규칙 객체는 파싱 뒤 바뀌지 않는다. FilterRule 타입(공용)에 필드를 더하지 않으려고 WeakMap에 둔다.
// 규칙 객체마다 처음 판정할 때 채운다. filter-pipeline의 tagRules는 규칙을 새 객체로 복사하므로
// 파싱 단계에서 미리 채워도 내장·팩 규칙에는 쓰이지 않는다. 규칙 배열이 유지되는 동안 재사용된다.
const ruleCache = new WeakMap<object, PreparedKeyword>();

export function preparedForRule(rule: object, value: string): PreparedKeyword {
  const cached = ruleCache.get(rule);
  if (cached) return cached;
  const prepared = prepareKeyword(value);
  ruleCache.set(rule, prepared);
  return prepared;
}
