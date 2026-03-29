import { describe, it, expect } from 'vitest';
import { buildActiveRules } from '@features/keyword-filter/rule-builder';

describe('buildActiveRules', () => {
  it('기본 필터 활성화 시 기본 키워드와 커스텀 키워드 모두 포함', () => {
    const rules = buildActiveRules(true, '투자', '커스텀키워드');
    expect(rules.some((r) => r.type === 'keyword' && r.value === '투자')).toBe(true);
    expect(rules.some((r) => r.type === 'keyword' && r.value === '커스텀키워드')).toBe(true);
  });

  it('기본 필터 비활성화 시 기본 키워드 미포함, 커스텀 키워드는 포함', () => {
    const rules = buildActiveRules(false, '투자', '커스텀키워드');
    expect(rules.some((r) => r.type === 'keyword' && r.value === '투자')).toBe(false);
    expect(rules.some((r) => r.type === 'keyword' && r.value === '커스텀키워드')).toBe(true);
  });

  it('기본 필터 비활성화 + 커스텀 필터 없을 때 빈 배열 반환', () => {
    const rules = buildActiveRules(false, '투자', '');
    expect(rules).toHaveLength(0);
  });

  it('기본 필터 활성화 + 커스텀 필터 없을 때 기본 키워드만 포함', () => {
    const rules = buildActiveRules(true, '투자', '');
    expect(rules.some((r) => r.type === 'keyword' && r.value === '투자')).toBe(true);
  });
});
