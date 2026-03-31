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
      expect(rule.pattern).toBeInstanceOf(RegExp);
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

  it('should return empty array for empty string', () => {
    const rules = parseFilterList('');
    expect(rules).toHaveLength(0);
  });
});
