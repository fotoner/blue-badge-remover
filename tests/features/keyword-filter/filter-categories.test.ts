import { describe, it, expect } from 'vitest';
import { parseCategories, buildFilterTextFromCategories } from '@features/keyword-filter/filter-categories';

const SAMPLE_FILTER = `! Blue Badge Remover - 기본 필터 리스트 (Beta)
! 악성 파딱 키워드 필터
! 업데이트 날짜 2026년 3월 30일 19:36

! 정치 및 테슬라
트럼
멸공
우파

! 경제
BTC
ETH
코인

! 욕설
시발
병신`;

describe('parseCategories', () => {
  it('should parse categories from filter text', () => {
    const categories = parseCategories(SAMPLE_FILTER);
    expect(categories).toHaveLength(3);
    expect(categories[0]!.name).toBe('정치 및 테슬라');
    expect(categories[1]!.name).toBe('경제');
    expect(categories[2]!.name).toBe('욕설');
  });

  it('should include keywords for each category', () => {
    const categories = parseCategories(SAMPLE_FILTER);
    expect(categories[0]!.keywords).toEqual(['트럼', '멸공', '우파']);
    expect(categories[1]!.keywords).toEqual(['BTC', 'ETH', '코인']);
    expect(categories[2]!.keywords).toEqual(['시발', '병신']);
  });

  it('should handle empty filter text', () => {
    expect(parseCategories('')).toEqual([]);
  });

  it('should handle filter with only metadata comments', () => {
    const text = `! Metadata line 1\n! Metadata line 2`;
    expect(parseCategories(text)).toEqual([]);
  });
});

describe('buildFilterTextFromCategories', () => {
  it('should include all categories when none disabled', () => {
    const categories = parseCategories(SAMPLE_FILTER);
    const text = buildFilterTextFromCategories(categories, []);
    expect(text).toContain('트럼');
    expect(text).toContain('BTC');
    expect(text).toContain('시발');
  });

  it('should exclude disabled categories', () => {
    const categories = parseCategories(SAMPLE_FILTER);
    const text = buildFilterTextFromCategories(categories, ['경제']);
    expect(text).toContain('트럼');
    expect(text).not.toContain('BTC');
    expect(text).not.toContain('ETH');
    expect(text).toContain('시발');
  });

  it('should exclude multiple disabled categories', () => {
    const categories = parseCategories(SAMPLE_FILTER);
    const text = buildFilterTextFromCategories(categories, ['정치 및 테슬라', '욕설']);
    expect(text).not.toContain('트럼');
    expect(text).toContain('BTC');
    expect(text).not.toContain('시발');
  });

  it('should return empty string when all disabled', () => {
    const categories = parseCategories(SAMPLE_FILTER);
    const text = buildFilterTextFromCategories(categories, ['정치 및 테슬라', '경제', '욕설']);
    expect(text.trim()).toBe('');
  });
});
