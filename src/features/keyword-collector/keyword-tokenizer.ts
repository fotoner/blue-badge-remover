import { normalizeText } from '@shared/text/normalize';

// URL 토큰 필터 (트윗의 https://t.co/... 링크 잔재 제거)
const STOPWORDS = new Set(['http', 'https', 'www', 'com', 'co', 'net', 'org', 'kr']);

type CharKind = 'hangul' | 'han' | 'katakana' | 'word' | 'mark' | 'other';

// U+AC00–U+D7A3: 한글 완성형 음절
const HANGUL_SYLLABLE = /[\uAC00-\uD7A3]/;
// 한글 자모(ㅋㅋㅋ 등)는 \p{L}에 걸리므로 한글 문자 체계 전체로 판별해 이전처럼 토큰에서 뺀다.
const HANGUL_ANY = /\p{Script=Hangul}/u;
const HAN = /\p{Script=Han}/u;
// 가타카나·장음 기호(ー)·반복 기호·확장. 가운뎃점(U+30FB)은 단어 사이 구분이라 뺐다.
const KATAKANA = /[\u30A1-\u30FA\u30FC-\u30FF\u31F0-\u31FF]/;
// word run는 글자로 시작한다. 결합 기호는 직전 글자가 word일 때만 이어 붙인다(tokenize).
const WORD_LETTER = /\p{L}/u;
const COMBINING_MARK = /[\p{Mn}\p{Mc}]/u;
// 변형 선택자(U+FE00–FE0F, U+E0100–E01EF)는 Mn이지만 이모지·키캡(❤️, 1️⃣)에 붙는 표시일 뿐이다.
// 에워싸기 기호(\p{Me}, 키캡 U+20E3)도 같다. 둘 다 토큰에 넣지 않고 run을 끊는다.
const ENCLOSING_MARK = /\p{Me}/u;
const MARKS_IN_RUN = /\p{M}/gu;

function isVariationSelector(code: number): boolean {
  return (code >= 0xfe00 && code <= 0xfe0f) || (code >= 0xe0100 && code <= 0xe01ef);
}

function kindOf(char: string): CharKind {
  const code = char.codePointAt(0) ?? 0;
  if (code < 0x80) return code >= 0x61 && code <= 0x7a ? 'word' : 'other';
  if (isVariationSelector(code) || ENCLOSING_MARK.test(char)) return 'other';
  if (HANGUL_SYLLABLE.test(char)) return 'hangul';
  if (HANGUL_ANY.test(char)) return 'other';
  if (HAN.test(char)) return 'han';
  if (KATAKANA.test(char)) return 'katakana';
  // 히라가나만 이어진 글은 조사·활용어미(です, から)가 대부분이라 빈도 집계에 쓸모가 없다.
  // 한자·가타카나 run 사이의 구분자로만 본다. 매칭은 히라가나를 가타카나로 접으므로
  // 키워드로 추가한 뒤에는 ぷろふ·プロフ 모두 잡힌다.
  if (code >= 0x3041 && code <= 0x309f) return 'other';
  if (COMBINING_MARK.test(char)) return 'mark';
  return WORD_LETTER.test(char) ? 'word' : 'other';
}

// 연속된 한글 자모 run에서 길이 2 이상인 모든 접두사를 생성한다.
// ex) "비트코인" → ["비트", "비트코", "비트코인"]
function koreanPrefixes(run: string): string[] {
  const result: string[] = [];
  for (let len = 2; len <= run.length; len++) {
    result.push(run.slice(0, len));
  }
  return result;
}

// 한자는 띄어쓰기 없이 이어지고 단어 대부분이 2글자라, run 전체와 2글자 조각을 함께 만든다.
// ex) "副業収入" → ["副業収入", "副業", "業収", "収入"]
function hanTokens(run: string): string[] {
  const chars = [...run];
  if (chars.length < 2) return [];
  const result = [run];
  if (chars.length > 2) {
    for (let i = 0; i + 2 <= chars.length; i++) result.push(chars[i]! + chars[i + 1]!);
  }
  return result;
}

function runTokens(kind: CharKind, run: string): string[] {
  switch (kind) {
    case 'hangul':
      return koreanPrefixes(run);
    case 'han':
      return hanTokens(run);
    case 'katakana':
      return [...run].length >= 2 ? [run] : [];
    case 'word':
      // 길이는 결합 기호를 뺀 기저 글자 수로 센다
      return [...run.replace(MARKS_IN_RUN, '')].length >= 2 && !STOPWORDS.has(run) ? [run] : [];
    default:
      return [];
  }
}

export function tokenize(text: string): string[] {
  const tokens: string[] = [];
  let kind: CharKind = 'other';
  let run = '';

  function flush(): void {
    if (run) tokens.push(...runTokens(kind, run));
    run = '';
  }

  // 매칭과 같은 NFKC·제로폭 제거·소문자를 먼저 거쳐, 전각·반각 표기가 한 토큰으로 모이게 한다 (#112)
  for (const char of normalizeText(text)) {
    let next = kindOf(char);
    if (next === 'mark') next = kind === 'word' ? 'word' : 'other';
    if (next !== kind) {
      flush();
      kind = next;
    }
    if (next !== 'other') run += char;
  }
  flush();

  return tokens;
}

export function countTokens(texts: string[]): Map<string, number> {
  const counts = new Map<string, number>();
  for (const text of texts) {
    for (const token of tokenize(text)) {
      counts.set(token, (counts.get(token) ?? 0) + 1);
    }
  }
  return counts;
}

export function topN(
  counts: Map<string, number>,
  n: number,
): Array<{ token: string; count: number }> {
  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, n)
    .map(([token, count]) => ({ token, count }));
}
