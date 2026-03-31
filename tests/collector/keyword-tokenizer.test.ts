import { describe, it, expect } from 'vitest';
import { tokenize, countTokens, topN } from '@features/keyword-collector/keyword-tokenizer';

describe('tokenize', () => {
  it('한글 run에서 길이 2 이상인 접두사를 생성한다', () => {
    expect(tokenize('비트코인')).toEqual(['비트', '비트코', '비트코인']);
  });

  it('한글 2글자 run은 접두사 1개만 생성한다', () => {
    expect(tokenize('파딱')).toEqual(['파딱']);
  });

  it('한글 3글자 run은 접두사 2개를 생성한다', () => {
    expect(tokenize('좋아요')).toEqual(['좋아', '좋아요']);
  });

  it('한글 1글자 run은 토큰을 생성하지 않는다', () => {
    expect(tokenize('이')).toEqual([]);
  });

  it('영어는 단어 단위로 분리한다', () => {
    expect(tokenize('hello world')).toEqual(['hello', 'world']);
  });

  it('한글과 영어가 섞인 텍스트를 처리한다', () => {
    // '파딱' → '파딱', 'coin', '이야기' → '이야', '이야기'
    expect(tokenize('파딱 coin 이야기')).toEqual(['파딱', 'coin', '이야', '이야기']);
  });

  it('영어 1글자 토큰은 제외한다', () => {
    expect(tokenize('I am here')).toEqual(['am', 'here']);
  });

  it('숫자는 제외한다', () => {
    expect(tokenize('123 테스트')).toEqual(['테스', '테스트']);
  });

  it('특수문자·이모지는 제외한다', () => {
    expect(tokenize('🚀 hello! @world')).toEqual(['hello', 'world']);
  });

  it('빈 문자열은 빈 배열을 반환한다', () => {
    expect(tokenize('')).toEqual([]);
  });

  it('https 등 URL 관련 영어 단어는 제외한다', () => {
    expect(tokenize('https://t.co/abc')).toEqual(['abc']);
  });

  it('http, www, com, co는 stopword로 제외한다', () => {
    expect(tokenize('http www com co net org kr')).toEqual([]);
  });
});

describe('countTokens', () => {
  it('여러 텍스트에서 토큰 빈도를 집계한다', () => {
    const counts = countTokens(['비트코인', '비트코인 투자']);
    // '비트코인' → 비트, 비트코, 비트코인 (each text)
    expect(counts.get('비트')).toBe(2);
    expect(counts.get('비트코')).toBe(2);
    expect(counts.get('비트코인')).toBe(2);
  });

  it('빈 배열은 빈 Map을 반환한다', () => {
    expect(countTokens([])).toEqual(new Map());
  });
});

describe('topN', () => {
  it('빈도 내림차순으로 상위 N개를 반환한다', () => {
    const counts = new Map([['비트', 10], ['코인', 5], ['테슬라', 8]]);
    const result = topN(counts, 2);
    expect(result).toEqual([
      { token: '비트', count: 10 },
      { token: '테슬라', count: 8 },
    ]);
  });

  it('N이 Map 크기보다 크면 전체를 반환한다', () => {
    const counts = new Map([['비트', 3], ['코인', 1]]);
    expect(topN(counts, 30)).toHaveLength(2);
  });
});
