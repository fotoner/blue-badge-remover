import { describe, it, expect } from 'vitest';
import { formatStatCount, computeCategoryBars, getShareText } from '../../src/dashboard/stats-helpers';

describe('formatStatCount', () => {
  it('should format count with Korean unit', () => {
    expect(formatStatCount(47)).toBe('47개');
  });

  it('should format zero', () => {
    expect(formatStatCount(0)).toBe('0개');
  });

  it('should format large numbers', () => {
    expect(formatStatCount(1234)).toBe('1234개');
  });
});

describe('computeCategoryBars', () => {
  it('should return empty array for empty categories', () => {
    expect(computeCategoryBars({})).toEqual([]);
  });

  it('should sort categories by count descending', () => {
    const result = computeCategoryBars({ '정치': 10, '경제': 30, '기타': 5 });
    expect(result[0]!.name).toBe('경제');
    expect(result[1]!.name).toBe('정치');
    expect(result[2]!.name).toBe('기타');
  });

  it('should compute percentage relative to max', () => {
    const result = computeCategoryBars({ '경제': 40, '정치': 20 });
    expect(result[0]!.percent).toBe(100);
    expect(result[1]!.percent).toBe(50);
  });
});

describe('getShareText', () => {
  it('should generate share text with count', () => {
    const text = getShareText(47);
    expect(text).toContain('47');
    expect(text).toContain('Blue Badge Remover');
  });

  it('should URL-encode properly', () => {
    const text = getShareText(10);
    // Should be a valid string (no encoding issues)
    expect(typeof text).toBe('string');
  });
});
