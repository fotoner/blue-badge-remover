import type { ProfileInfo } from '@shared/types';

const MAX_KEYWORDS = 10_000;
const MAX_KEYWORD_LENGTH = 100;

export function normalizeProtectedKeywords(values: string[]): string[] {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const value of values.slice(0, MAX_KEYWORDS)) {
    const keyword = value.trim();
    const normalized = keyword.toLowerCase();
    if (!keyword || keyword.length > MAX_KEYWORD_LENGTH || seen.has(normalized)) continue;
    seen.add(normalized);
    result.push(keyword);
  }
  return result;
}

export function matchesProtectedKeyword(profile: ProfileInfo, keywords: string[]): boolean {
  const fields = [profile.handle, profile.displayName, profile.bio].map((value) => value.toLowerCase());
  for (const keyword of keywords) {
    const normalized = keyword.trim().toLowerCase();
    if (normalized && fields.some((field) => field.includes(normalized))) return true;
  }
  return false;
}
