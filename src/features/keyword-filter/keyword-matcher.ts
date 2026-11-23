import type { FilterRule, KeywordMatchResult, ProfileInfo, WildcardMatcher } from '@shared/types';
import { includesNormalized, normalizeForMatch } from '@shared/text/normalize';
import type { NormalizedWildcardMatcher } from './filter-rule-parser';
import { preparedForRule } from './prepared-keyword';

function hasNormalizedTest(pattern: WildcardMatcher): pattern is NormalizedWildcardMatcher {
  return typeof (pattern as Partial<NormalizedWildcardMatcher>).testNormalized === 'function';
}

function ruleMatchesAny(rule: FilterRule, texts: string[]): boolean {
  if (rule.type === 'keyword') {
    const { text, wholeWord } = preparedForRule(rule, rule.value);
    return texts.some((target) => includesNormalized(target, text, wholeWord));
  }
  if (rule.type === 'wildcard') {
    const { pattern } = rule;
    return texts.some((target) => (hasNormalizedTest(pattern) ? pattern.testNormalized(target) : pattern.test(target)));
  }
  return false;
}

export function matchesKeywordFilter(
  profile: ProfileInfo,
  rules: FilterRule[],
  tweetText?: string,
): KeywordMatchResult {
  // 대상 텍스트는 판정 때 한 번만 정규화한다. 키워드·예외 규칙은 규칙 객체마다 처음 판정할 때
  // 정규화해 기억하고, 와일드카드는 파싱 때 패턴을 정규화한다 (#112)
  const handle = normalizeForMatch(profile.handle);
  const others = [profile.displayName, profile.bio];
  if (tweetText !== undefined) others.push(tweetText);
  const texts = [handle, ...others.map(normalizeForMatch)];

  // Exception rules take priority — checked first
  for (const rule of rules) {
    if (rule.type === 'exception' && preparedForRule(rule, rule.handle).text === handle) {
      return { matched: false };
    }
  }

  for (const rule of rules) {
    if (rule.type === 'exception') continue;
    if (ruleMatchesAny(rule, texts)) {
      const matchedRule = rule.type === 'keyword' ? rule.value : rule.original;
      return { matched: true, matchedRule, packId: rule.packId, category: rule.category };
    }
  }

  return { matched: false };
}
