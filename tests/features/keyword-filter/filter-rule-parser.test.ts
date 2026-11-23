import { describe, it, expect } from 'vitest';
import { matchesKeywordFilter } from '@features/keyword-filter/keyword-matcher';
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

  // 와일드카드도 키워드 규칙(textContains)과 같은 toLowerCase 기준으로 대소문자를 무시한다.
  // 정규식 /i와는 일부 비ASCII 문자(그리스어 어말 시그마, 터키어 İ 등)에서 결과가 다를 수 있으나
  // 같은 필터 목록 안에서 키워드/와일드카드 규칙의 판정 기준을 일치시키는 쪽을 택했다.
  it('대소문자 무시 기준이 키워드 규칙과 같다', () => {
    const [wildcard] = parseFilterList('*İ*');
    const [keyword] = parseFilterList('İ');
    if (wildcard?.type !== 'wildcard' || keyword?.type !== 'keyword') throw new Error('unexpected rules');
    for (const text of ['istanbul', 'İSTANBUL', 'σιγμα', 'Crème', 'BITCOIN 코인']) {
      const keywordMatched = text.toLowerCase().includes(keyword.value.toLowerCase());
      expect(wildcard.pattern.test(text)).toBe(keywordMatched);
    }
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

  // #112: 일본어 IME로 친 전각 기호도 문법으로 인식한다
  it('전각 ！로 시작하는 줄도 주석으로 무시한다', () => {
    const rules = parseFilterList('！ 전각 주석\n테슬라');
    expect(rules).toHaveLength(1);
    expect(rules[0]).toEqual({ type: 'keyword', value: '테슬라' });
  });

  it('전각 ＠＠로 시작하는 줄은 예외 규칙이다', () => {
    expect(parseFilterList('＠＠ＧｏｏｄＵｓｅｒ')).toEqual([{ type: 'exception', handle: 'gooduser' }]);
  });

  it('전각 ＊가 들어간 줄은 와일드카드다', () => {
    const [rule] = parseFilterList('＊ｃｏｉｎ＊');
    if (rule?.type !== 'wildcard') throw new Error('expected wildcard');
    expect(rule.original).toBe('＊ｃｏｉｎ＊');
    expect(rule.pattern.test('Bitcoin')).toBe(true);
  });

  // 전각 ＊만 있는 줄이 정규화로 `*`뿐인 와일드카드가 되면 모든 프로필에 걸린다. 이전에는 리터럴 키워드였다.
  it('ASCII 별표 없이 전각 별표만 있는 줄은 와일드카드가 아니라 키워드다', () => {
    for (const line of ['＊', '＊＊', '＊\u200B']) {
      expect(parseFilterList(line), line).toEqual([{ type: 'keyword', value: line }]);
    }
  });

  it('전각 별표만 있는 규칙은 평범한 프로필에 걸리지 않는다', () => {
    const profile = { handle: 'someone', displayName: 'Someone', bio: '평범한 프로필' };
    for (const line of ['＊', '*＊*']) {
      expect(matchesKeywordFilter(profile, parseFilterList(line), '평범한 트윗').matched, line).toBe(false);
    }
  });

  // ASCII `*`가 있으면 그것만 와일드카드다. 조각 안의 전각 ＊는 리터럴로 남아 #112 이전처럼 ＊가 든 글에 걸린다 (컨실 r2)
  it('ASCII 별표로 감싼 전각 별표는 별표가 든 글에 걸리는 와일드카드다', () => {
    const [rule] = parseFilterList('*＊*');
    expect(rule?.type).toBe('wildcard');
    const starred = { handle: 'someone', displayName: 'Someone', bio: 'promo ＊ limited' };
    expect(matchesKeywordFilter(starred, parseFilterList('*＊*')).matched).toBe(true);
  });

  it('리터럴이 있는 전각 별표 줄은 계속 와일드카드다', () => {
    const [rule] = parseFilterList('＊ＥＴＨ＊');
    expect(rule?.type).toBe('wildcard');
    const profile = { handle: 'someone', displayName: 'Someone', bio: 'holding eth long' };
    expect(matchesKeywordFilter(profile, parseFilterList('＊ＥＴＨ＊')).matched).toBe(true);
  });

  // ASCII `*`가 없으면 전각 ＊는 줄 맨 앞·맨 끝에 있을 때만 와일드카드다. 얼굴 문자 안의 ＊는 리터럴이다 (#112 컨실 r2)
  it('전각 별표가 줄 가운데에만 있는 얼굴 문자는 키워드다', () => {
    for (const line of ['(＊´ω｀＊)', '(＊^▽^＊)']) {
      expect(parseFilterList(line), line).toEqual([{ type: 'keyword', value: line }]);
      const profile = { handle: 'someone', displayName: 'Someone', bio: `안녕 ${line} 하세요` };
      expect(matchesKeywordFilter(profile, parseFilterList(line)).matched, line).toBe(true);
    }
  });

  it('전각 별표가 줄 끝에만 있어도 와일드카드다', () => {
    expect(parseFilterList('ETH＊')[0]?.type).toBe('wildcard');
    expect(parseFilterList('＊固ツイ＊')[0]?.type).toBe('wildcard');
  });

  // 복사한 규칙 앞뒤에 제로폭 문자가 붙어도 전각 별표의 위치 해석이 달라지지 않아야 한다 (#112 컨실 r3)
  it('제로폭 문자가 붙은 전각 별표 규칙도 같은 와일드카드다', () => {
    const profile = { handle: 'someone', displayName: 'Someone', bio: 'holding eth long' };
    for (const line of ['＊ＥＴＨ＊\u200B', '\u200B＊ＥＴＨ＊\u200B']) {
      const [rule] = parseFilterList(line);
      expect(rule?.type, line).toBe('wildcard');
      expect(matchesKeywordFilter(profile, parseFilterList(line)).matched, line).toBe(true);
    }
  });

  it('ASCII 별표만 있는 줄은 이전처럼 와일드카드다', () => {
    expect(parseFilterList('**')[0]?.type).toBe('wildcard');
  });

  it('와일드카드 패턴과 텍스트를 같은 방식으로 정규화해 비교한다', () => {
    const [rule] = parseFilterList('*ぷろふ*');
    if (rule?.type !== 'wildcard') throw new Error('expected wildcard');
    expect(rule.pattern.test('ﾌﾟﾛﾌ見て')).toBe(true);
    expect(rule.pattern.test('プロフ')).toBe(true);
    expect(rule.pattern.test('副業')).toBe(false);
  });

  it('와일드카드 조각 사이에 제로폭 문자가 있어도 매칭한다', () => {
    const [rule] = parseFilterList('*副業*');
    if (rule?.type !== 'wildcard') throw new Error('expected wildcard');
    expect(rule.pattern.test('副\u200b業')).toBe(true);
  });
});
