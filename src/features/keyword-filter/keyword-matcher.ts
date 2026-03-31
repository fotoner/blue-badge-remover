import type { FilterRule, KeywordMatchResult, ProfileInfo } from '@shared/types';

function textContains(text: string, keyword: string): boolean {
  return text.toLowerCase().includes(keyword.toLowerCase());
}

function profileMatchesRule(profile: ProfileInfo, rule: FilterRule, tweetText?: string): boolean {
  if (rule.type === 'keyword') {
    return (
      textContains(profile.handle, rule.value) ||
      textContains(profile.displayName, rule.value) ||
      textContains(profile.bio, rule.value) ||
      (tweetText !== undefined && textContains(tweetText, rule.value))
    );
  }
  if (rule.type === 'wildcard') {
    return (
      rule.pattern.test(profile.handle) ||
      rule.pattern.test(profile.displayName) ||
      rule.pattern.test(profile.bio) ||
      (tweetText !== undefined && rule.pattern.test(tweetText))
    );
  }
  return false;
}

export function matchesKeywordFilter(
  profile: ProfileInfo,
  rules: FilterRule[],
  tweetText?: string,
): KeywordMatchResult {
  // Exception rules take priority — checked first
  for (const rule of rules) {
    if (
      rule.type === 'exception' &&
      rule.handle.toLowerCase() === profile.handle.toLowerCase()
    ) {
      return { matched: false };
    }
  }

  for (const rule of rules) {
    if (rule.type === 'exception') continue;
    if (profileMatchesRule(profile, rule, tweetText)) {
      const matchedRule = rule.type === 'keyword' ? rule.value : rule.original;
      return { matched: true, matchedRule };
    }
  }

  return { matched: false };
}
