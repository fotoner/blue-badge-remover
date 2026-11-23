import type { ProfileInfo } from '@shared/types';
import { normalizeForMatch } from '@shared/text/normalize';

const MAX_KEYWORDS = 10_000;
const MAX_KEYWORD_LENGTH = 100;
// 보호 키워드는 문자열 배열이라 규칙처럼 파싱 단계가 없다. 트윗마다 최대 1만 개를 다시 정규화하지
// 않도록 키워드별로 기억한다. 설정을 바꿔 안 쓰게 된 키워드가 쌓이지 않게 상한에서 비운다 (#112).
const NORMALIZED_CACHE_LIMIT = 50_000;
const normalizedCache = new Map<string, string>();

function normalizedKeyword(keyword: string): string {
  const cached = normalizedCache.get(keyword);
  if (cached !== undefined) return cached;
  if (normalizedCache.size >= NORMALIZED_CACHE_LIMIT) normalizedCache.clear();
  const result = normalizeForMatch(keyword).trim();
  normalizedCache.set(keyword, result);
  return result;
}

export function normalizeProtectedKeywords(values: string[]): string[] {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const value of values.slice(0, MAX_KEYWORDS)) {
    const keyword = value.trim();
    // 길이 제한으로 버릴 줄은 정규화 캐시에 넣지 않는다
    if (!keyword || keyword.length > MAX_KEYWORD_LENGTH) continue;
    // 표기만 다른 키워드(ＢＴＣ·btc, ぷろふ·プロフ)는 하나로 본다. 저장하는 값은 사용자가 적은 원문이다.
    const normalized = normalizedKeyword(keyword);
    if (!normalized || seen.has(normalized)) continue;
    seen.add(normalized);
    result.push(keyword);
  }
  return result;
}

// 보호 키워드는 단어 경계를 쓰지 않고 정규화한 부분 일치를 유지한다. 사용자가 적은 `genshin`이
// 붙여 쓴 이름(GenshinImpact, VTubers)도 보호해야 하기 때문이다 (#112).
export function matchesProtectedKeyword(profile: ProfileInfo, keywords: string[]): boolean {
  if (keywords.length === 0) return false;
  const fields = [profile.handle, profile.displayName, profile.bio].map(normalizeForMatch);
  for (const keyword of keywords) {
    const text = normalizedKeyword(keyword);
    if (text && fields.some((field) => field.includes(text))) return true;
  }
  return false;
}
