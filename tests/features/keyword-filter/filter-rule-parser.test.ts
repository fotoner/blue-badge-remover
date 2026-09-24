import { describe, it, expect } from 'vitest';
import { parseFilterList } from '@features/keyword-filter/filter-rule-parser';

describe('parseFilterList', () => {
  it('should parse a simple keyword rule', () => {
    const rules = parseFilterList('테슬라');
    expect(rules).toHaveLength(1);
    expect(rules[0]).toEqual({ type: 'keyword', value: '테슬라' });
  });

  it('should parse an exception rule starting with @@', () => {
    const rules = parseFilterList('@@elonmusk');
    expect(rules).toHaveLength(1);
    expect(rules[0]).toEqual({ type: 'exception', handle: 'elonmusk' });
  });

  it('should parse a wildcard rule containing *', () => {
    const rules = parseFilterList('*coin*');
    expect(rules).toHaveLength(1);
    const rule = rules[0];
    expect(rule?.type).toBe('wildcard');
    if (rule?.type === 'wildcard') {
      expect(rule.original).toBe('*coin*');
      expect(rule.pattern.test('bitcoin')).toBe(true);
      expect(rule.pattern.test('coinbase')).toBe(true);
      expect(rule.pattern.test('hello')).toBe(false);
    }
  });

  it('should handle wildcard at start only: coin*', () => {
    const rules = parseFilterList('coin*');
    const rule = rules[0];
    expect(rule?.type).toBe('wildcard');
    if (rule?.type === 'wildcard') {
      expect(rule.pattern.test('coinbase')).toBe(true);
      expect(rule.pattern.test('bitcoin')).toBe(false);
    }
  });

  it('should ignore lines starting with !', () => {
    const rules = parseFilterList('! this is a comment\n테슬라');
    expect(rules).toHaveLength(1);
    expect(rules[0]).toEqual({ type: 'keyword', value: '테슬라' });
  });

  it('should ignore empty lines', () => {
    const rules = parseFilterList('테슬라\n\n년차\n');
    expect(rules).toHaveLength(2);
  });

  it('should parse multiple rules from multiline text', () => {
    const text = '! comment\n테슬라\n년차\n@@gooduser\n*crypto*';
    const rules = parseFilterList(text);
    expect(rules).toHaveLength(4);
    expect(rules[0]).toEqual({ type: 'keyword', value: '테슬라' });
    expect(rules[1]).toEqual({ type: 'keyword', value: '년차' });
    expect(rules[2]).toEqual({ type: 'exception', handle: 'gooduser' });
    const rule4 = rules[3];
    expect(rule4?.type).toBe('wildcard');
  });

  it('패턴 양 끝에 *가 없으면 시작/끝에 고정해 매칭한다', () => {
    const [rule] = parseFilterList('a*b');
    if (rule?.type !== 'wildcard') throw new Error('expected wildcard');
    expect(rule.pattern.test('AxxB')).toBe(true);
    expect(rule.pattern.test('axxbc')).toBe(false);
    expect(rule.pattern.test('caxxb')).toBe(false);
    expect(rule.pattern.test('ab')).toBe(true);
    expect(rule.pattern.test('aba')).toBe(false);
  });

  it('앞뒤 고정 부분이 겹치면 매칭하지 않는다', () => {
    const [rule] = parseFilterList('ab*ba');
    if (rule?.type !== 'wildcard') throw new Error('expected wildcard');
    expect(rule.pattern.test('aba')).toBe(false);
    expect(rule.pattern.test('abba')).toBe(true);
  });

  it('와일드카드가 많아도 순서대로 매칭한다', () => {
    const [rule] = parseFilterList('a*b*c*d*e*f*g');
    if (rule?.type !== 'wildcard') throw new Error('expected wildcard');
    expect(rule.pattern.test('a1b2c3d4e5f6g')).toBe(true);
    expect(rule.pattern.test('a1c2b3d4e5f6g')).toBe(false);
  });

  it('여러 줄 텍스트에서도 줄을 넘어 매칭한다', () => {
    const [rule] = parseFilterList('*코인*무료*');
    if (rule?.type !== 'wildcard') throw new Error('expected wildcard');
    expect(rule.pattern.test('비트코인 소개\n무료 에어드랍')).toBe(true);
  });

  // 가져온 필터 팩의 악성 패턴이 백트래킹 폭발로 탭을 멈추게 하던 문제 (ReDoS)
  it('매칭되지 않는 긴 텍스트에서도 선형 시간에 끝난다', () => {
    const [rule] = parseFilterList('aa*aa*aa*aa*aa*ab');
    if (rule?.type !== 'wildcard') throw new Error('expected wildcard');
    const start = performance.now();
    expect(rule.pattern.test('a'.repeat(100))).toBe(false);
    expect(performance.now() - start).toBeLessThan(100);
  });

  it('should return empty array for empty string', () => {
    const rules = parseFilterList('');
    expect(rules).toHaveLength(0);
  });
});
