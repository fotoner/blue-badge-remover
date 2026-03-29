import { describe, it, expect } from 'vitest';
import { matchesKeywordFilter } from '@features/keyword-filter/keyword-matcher';
import type { FilterRule, ProfileInfo } from '@shared/types';

const baseProfile: ProfileInfo = {
  handle: 'testuser',
  displayName: 'Test User',
  bio: '',
};

describe('matchesKeywordFilter', () => {
  it('should match keyword in displayName (case insensitive)', () => {
    const rules: FilterRule[] = [{ type: 'keyword', value: '테슬라' }];
    const profile: ProfileInfo = { ...baseProfile, displayName: '테슬라 팬' };
    const result = matchesKeywordFilter(profile, rules);
    expect(result.matched).toBe(true);
    expect(result.matchedRule).toBe('테슬라');
  });

  it('should match keyword in handle (case insensitive)', () => {
    const rules: FilterRule[] = [{ type: 'keyword', value: 'tesla' }];
    const profile: ProfileInfo = { ...baseProfile, handle: 'TeslaFan' };
    const result = matchesKeywordFilter(profile, rules);
    expect(result.matched).toBe(true);
  });

  it('should match keyword in bio', () => {
    const rules: FilterRule[] = [{ type: 'keyword', value: '년차' }];
    const profile: ProfileInfo = { ...baseProfile, bio: '5년차 개발자' };
    const result = matchesKeywordFilter(profile, rules);
    expect(result.matched).toBe(true);
  });

  it('should not match when keyword is not in any field', () => {
    const rules: FilterRule[] = [{ type: 'keyword', value: '테슬라' }];
    const result = matchesKeywordFilter(baseProfile, rules);
    expect(result.matched).toBe(false);
  });

  it('should return not matched for empty rules', () => {
    const result = matchesKeywordFilter(baseProfile, []);
    expect(result.matched).toBe(false);
  });

  it('should apply exception rule: exception handle blocks match', () => {
    const rules: FilterRule[] = [
      { type: 'keyword', value: 'tesla' },
      { type: 'exception', handle: 'testuser' },
    ];
    const profile: ProfileInfo = { ...baseProfile, handle: 'testuser', bio: 'I love tesla' };
    const result = matchesKeywordFilter(profile, rules);
    expect(result.matched).toBe(false);
  });

  it('should apply wildcard rule', () => {
    const rules: FilterRule[] = [
      { type: 'wildcard', pattern: /.*coin.*/i, original: '*coin*' },
    ];
    const profile: ProfileInfo = { ...baseProfile, displayName: 'Bitcoin Lover' };
    const result = matchesKeywordFilter(profile, rules);
    expect(result.matched).toBe(true);
    expect(result.matchedRule).toBe('*coin*');
  });

  it('should match keywords case-insensitively', () => {
    const rules: FilterRule[] = [{ type: 'keyword', value: 'TESLA' }];
    const profile: ProfileInfo = { ...baseProfile, bio: 'tesla is great' };
    const result = matchesKeywordFilter(profile, rules);
    expect(result.matched).toBe(true);
  });

  it('should match keyword in tweet text', () => {
    const rules: FilterRule[] = [{ type: 'keyword', value: '테슬라' }];
    const result = matchesKeywordFilter(baseProfile, rules, '테슬라 주가 올랐다');
    expect(result.matched).toBe(true);
  });

  it('should match wildcard in tweet text', () => {
    const rules: FilterRule[] = [{ type: 'wildcard', pattern: /.*coin.*/i, original: '*coin*' }];
    const result = matchesKeywordFilter(baseProfile, rules, 'Bitcoin is the future');
    expect(result.matched).toBe(true);
  });

  it('should not match tweet text when tweetText is not provided', () => {
    const rules: FilterRule[] = [{ type: 'keyword', value: '테슬라' }];
    const result = matchesKeywordFilter(baseProfile, rules);
    expect(result.matched).toBe(false);
  });
});
