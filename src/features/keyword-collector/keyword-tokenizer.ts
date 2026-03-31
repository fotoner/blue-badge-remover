// URL 토큰 필터 (트윗의 https://t.co/... 링크 잔재 제거)
const STOPWORDS = new Set(['http', 'https', 'www', 'com', 'co', 'net', 'org', 'kr']);

function isKorean(char: string): boolean {
  const code = char.charCodeAt(0);
  // U+AC00–U+D7A3: 한글 완성형 음절
  return code >= 0xac00 && code <= 0xd7a3;
}

function isAlpha(char: string): boolean {
  const code = char.charCodeAt(0);
  return (code >= 0x41 && code <= 0x5a) || (code >= 0x61 && code <= 0x7a);
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

export function tokenize(text: string): string[] {
  const tokens: string[] = [];
  let word = '';
  let koreanRun = '';

  function flushWord(): void {
    if (word) {
      const w = word.toLowerCase();
      if (w.length >= 2 && !STOPWORDS.has(w)) tokens.push(w);
      word = '';
    }
  }

  function flushKorean(): void {
    if (koreanRun) {
      tokens.push(...koreanPrefixes(koreanRun));
      koreanRun = '';
    }
  }

  for (const char of text) {
    if (isKorean(char)) {
      flushWord();
      koreanRun += char;
    } else if (isAlpha(char)) {
      flushKorean();
      word += char;
    } else {
      flushKorean();
      flushWord();
    }
  }

  flushKorean();
  flushWord();

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
