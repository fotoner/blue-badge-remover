import { describe, expect, it } from 'vitest';
import { tokenize } from '@features/keyword-collector/keyword-tokenizer';

// #112: 일본어(한자·가타카나)와 악센트 라틴 문자도 토큰으로 본다.
// 기존 한글·ASCII 동작은 tests/collector/keyword-tokenizer.test.ts가 지킨다.
describe('tokenize: 일본어 (#112)', () => {
  it('한자 run을 토큰으로 만들고 히라가나는 구분자로 본다', () => {
    expect(tokenize('副業で稼ぐ方法')).toEqual(['副業', '方法']);
  });

  it('가타카나 run을 토큰으로 만든다', () => {
    expect(tokenize('プロフ見てね')).toEqual(['プロフ']);
  });

  it('반각 가타카나는 전각으로 합쳐 센다', () => {
    expect(tokenize('ﾌﾟﾛﾌ')).toEqual(['プロフ']);
  });

  it('긴 한자 run은 전체와 2글자 조각을 함께 만든다', () => {
    expect(tokenize('副業収入')).toEqual(['副業収入', '副業', '業収', '収入']);
  });

  it('한자와 가타카나가 이어져도 문자 종류별로 나눈다', () => {
    expect(tokenize('株式会社ＡＢＣ')).toEqual(['株式会社', '株式', '式会', '会社', 'abc']);
  });

  it('히라가나만 있는 글은 토큰이 없다', () => {
    expect(tokenize('ぷろふです')).toEqual([]);
  });

  it('제로폭 문자가 끼어 있어도 한 토큰이다', () => {
    expect(tokenize('副\u200B業')).toEqual(['副業']);
  });

  it('한 글자 한자는 토큰이 아니다', () => {
    expect(tokenize('金')).toEqual([]);
  });

  it('한글·일본어·영어가 섞인 글에서 각각 토큰을 만든다', () => {
    expect(tokenize('코인 副業 coin')).toEqual(['코인', '副業', 'coin']);
  });
});

describe('tokenize: 라틴 외 글자 (#112)', () => {
  it('악센트 있는 라틴 단어를 자르지 않는다', () => {
    expect(tokenize('café naïve')).toEqual(['café', 'naïve']);
  });

  it('전각 영문은 반각 소문자 토큰이 된다', () => {
    expect(tokenize('ＢＴＣ')).toEqual(['btc']);
  });

  it('키릴 문자 같은 다른 문자 체계의 단어도 토큰으로 본다', () => {
    expect(tokenize('Привет мир')).toEqual(['привет', 'мир']);
  });

  it('한글 자모만 있는 글(ㅋㅋㅋ)은 이전처럼 토큰이 없다', () => {
    expect(tokenize('ㅋㅋㅋ ㅇㄱㄹㅇ')).toEqual([]);
  });

  it('숫자는 단어를 끊는 구분자다', () => {
    expect(tokenize('abc123def')).toEqual(['abc', 'def']);
  });
});

// 이모지 키캡·변형 선택자·결합 기호가 토큰에 섞이면 같은 단어가 서로 다른 토큰으로 집계된다.
describe('tokenize: 이모지·결합 기호 (#112)', () => {
  it('이모지 바로 뒤의 영문 단어를 변형 선택자 없이 토큰으로 만든다', () => {
    expect(tokenize('❤\uFE0FBTC')).toEqual(['btc']);
    expect(tokenize('⚡\uFE0FBTC')).toEqual(['btc']);
  });

  it('숫자 키캡(1️⃣2️⃣)은 토큰이 없다', () => {
    expect(tokenize('1\uFE0F\u20E32\uFE0F\u20E3')).toEqual([]);
  });

  it('변형 선택자가 붙은 한 글자는 토큰이 아니고, 토큰에는 변형 선택자가 없다', () => {
    expect(tokenize('⚠\uFE0Fa')).toEqual([]);
    for (const token of tokenize('⚠\uFE0Fab \u{E0100}cd')) {
      expect(token).not.toMatch(/[\uFE00-\uFE0F]|\u{E0100}/u);
    }
    expect(tokenize('⚠\uFE0Fab')).toEqual(['ab']);
  });

  it('에워싸기 기호와 평면 14 변형 선택자는 토큰에 넣지 않는다', () => {
    expect(tokenize('ab\u20E3cd')).toEqual(['ab', 'cd']);
    expect(tokenize('ab\u{E0100}cd')).toEqual(['ab', 'cd']);
  });

  it('결합 기호는 앞 글자가 단어일 때만 이어 붙인다', () => {
    expect(tokenize('\u0301ab')).toEqual(['ab']);
    expect(tokenize('1\u0301ab')).toEqual(['ab']);
    expect(tokenize('x\u0301x\u0301')).toEqual(['x\u0301x\u0301']);
  });

  it('길이는 결합 기호를 빼고 기저 글자 수로 센다', () => {
    expect(tokenize('x\u0301')).toEqual([]);
    expect(tokenize('x\u0301 x\u0301')).toEqual([]);
  });

  it('제로폭 문자를 사이에 둔 결합 기호도 앞 글자에 합쳐진다', () => {
    expect(tokenize('cafe\u200B\u0301')).toEqual(['café']);
  });
});
