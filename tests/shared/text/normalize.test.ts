import { describe, expect, it, vi } from 'vitest';
import {
  includesNormalized,
  isLatinKeyword,
  normalizeForMatch,
  normalizeText,
} from '@shared/text/normalize';

// #112: 키워드와 대상 텍스트를 같은 함수로 정규화해야 표기 변형이 같은 글자로 취급된다.
describe('normalizeText', () => {
  it('전각 영문·숫자를 반각 소문자로 바꾼다', () => {
    expect(normalizeText('ＢＴＣ １００')).toBe('btc 100');
  });

  it('반각 가타카나를 전각으로 합친다', () => {
    expect(normalizeText('ﾌﾟﾛﾌ')).toBe('プロフ');
  });

  it('제로폭 문자와 소프트 하이픈을 지운다', () => {
    for (const hidden of ['\u200B', '\u200C', '\u200D', '\u2060', '\uFEFF', '\u00AD']) {
      expect(normalizeText(`副${hidden}業`)).toBe('副業');
    }
  });

  it('히라가나는 그대로 둔다(토큰 분리에 쓰이기 때문이다)', () => {
    expect(normalizeText('ぷろふ')).toBe('ぷろふ');
  });

  // 제로폭 문자를 NFKC보다 먼저 지워야 사이에 끼어 있던 반각 반탁음·결합 기호가 앞 글자에 합쳐진다
  it('제로폭 문자 때문에 떨어져 있던 반각 가타카나와 반탁음을 합친다', () => {
    expect(normalizeText('ﾌ\u200Bﾟﾛﾌ')).toBe('プロフ');
  });

  it('제로폭 문자 때문에 떨어져 있던 결합 기호를 앞 글자에 합친다', () => {
    expect(normalizeText('cafe\u200B\u0301')).toBe('café');
    expect(normalizeText('か\u200B\u3099ち')).toBe('がち');
  });
});

describe('normalizeForMatch', () => {
  it('히라가나를 가타카나로 접는다', () => {
    expect(normalizeForMatch('ぷろふ')).toBe('プロフ');
    expect(normalizeForMatch('ねたばれ')).toBe(normalizeForMatch('ﾈﾀﾊﾞﾚ'));
    expect(normalizeForMatch('ネタバレ')).toBe(normalizeForMatch('ねたばれ'));
  });

  it('전각·제로폭·대소문자를 한꺼번에 처리한다', () => {
    expect(normalizeForMatch('Ｂ\u200BＴＣ')).toBe('btc');
  });

  it('한글은 바꾸지 않는다', () => {
    expect(normalizeForMatch('테슬라 투자')).toBe('테슬라 투자');
  });

  it('제로폭 문자가 끼어 쪼개진 표기도 원래 표기와 같아진다', () => {
    expect(normalizeForMatch('ﾌ\u200Bﾟﾛﾌ')).toBe(normalizeForMatch('プロフ'));
    expect(normalizeForMatch('か\u200B\u3099ち')).toBe(normalizeForMatch('ガチ'));
    expect(normalizeForMatch('cafe\u200B\u0301')).toBe(normalizeForMatch('café'));
  });

  it('두 번 적용해도 결과가 같다', () => {
    for (const text of ['ＢＴＣ', 'ﾌﾟﾛﾌ ぷろふ', '副\u200B業', 'ㅇㄱㄹㅇ ㅋㅋㅋ', 'İSTANBUL', '듯…']) {
      const once = normalizeForMatch(text);
      expect(normalizeForMatch(once)).toBe(once);
    }
  });
});

describe('isLatinKeyword', () => {
  it('라틴 문자로만 된 키워드를 가린다', () => {
    expect(isLatinKeyword('btc')).toBe(true);
    expect(isLatinKeyword('make money')).toBe(true);
    expect(isLatinKeyword('café')).toBe(true);
    expect(isLatinKeyword('web3')).toBe(true);
    expect(isLatinKeyword('$btc')).toBe(true);
  });

  it('한글·가나·한자가 섞이면 라틴 키워드가 아니다', () => {
    expect(isLatinKeyword('mac미니')).toBe(false);
    expect(isLatinKeyword('테슬라')).toBe(false);
    expect(isLatinKeyword('プロフ')).toBe(false);
    expect(isLatinKeyword('副業')).toBe(false);
  });

  it('글자가 없는 키워드(숫자·기호·이모지)는 라틴 키워드가 아니다', () => {
    expect(isLatinKeyword('')).toBe(false);
    expect(isLatinKeyword(';;')).toBe(false);
    expect(isLatinKeyword('2024')).toBe(false);
    expect(isLatinKeyword('🇰🇷')).toBe(false);
  });
});

describe('includesNormalized', () => {
  it('단어 경계를 요구하지 않으면 부분 문자열로 찾는다', () => {
    expect(includesNormalized('canada', 'ada', false)).toBe(true);
  });

  it('단어 경계를 요구하면 다른 단어 안의 일치를 버린다', () => {
    expect(includesNormalized('canada', 'ada', true)).toBe(false);
    expect(includesNormalized('adam', 'ada', true)).toBe(false);
    expect(includesNormalized('something', 'eth', true)).toBe(false);
    expect(includesNormalized('@seth', 'eth', true)).toBe(false);
  });

  it('공백·기호·줄바꿈·밑줄 옆은 경계다', () => {
    expect(includesNormalized('buy eth now', 'eth', true)).toBe(true);
    expect(includesNormalized('(eth)', 'eth', true)).toBe(true);
    expect(includesNormalized('a\neth', 'eth', true)).toBe(true);
    expect(includesNormalized('crypto_eth', 'eth', true)).toBe(true);
    expect(includesNormalized('@eth', 'eth', true)).toBe(true);
    expect(includesNormalized('eth', 'eth', true)).toBe(true);
  });

  it('악센트 있는 라틴 문자가 붙어 있으면 경계가 아니다', () => {
    expect(includesNormalized('éeth', 'eth', true)).toBe(false);
    expect(includesNormalized('ethé', 'eth', true)).toBe(false);
  });

  // 단어 글자는 라틴 문자뿐이다. 숫자·결합 기호·변형 선택자·에워싸기 기호는 경계다.
  it('숫자는 경계다', () => {
    expect(includesNormalized('eth2', 'eth', true)).toBe(true);
    expect(includesNormalized('2eth', 'eth', true)).toBe(true);
    expect(includesNormalized('10eth', 'eth', true)).toBe(true);
    expect(includesNormalized('1btc now', 'btc', true)).toBe(true);
    expect(includesNormalized('eth2.0', 'eth', true)).toBe(true);
  });

  it('이모지·변형 선택자·에워싸기 기호 옆은 경계다', () => {
    expect(includesNormalized('❤\uFE0Fbtc', 'btc', true)).toBe(true);
    expect(includesNormalized('⚡\uFE0Fbtc', 'btc', true)).toBe(true);
    expect(includesNormalized('1\uFE0F\u20E3btc', 'btc', true)).toBe(true);
    expect(includesNormalized('⚠\uFE0Feth', 'eth', true)).toBe(true);
    expect(includesNormalized('btc\uFE0F', 'btc', true)).toBe(true);
  });

  it('다른 라틴 단어 안의 일치는 여전히 버린다', () => {
    expect(includesNormalized('method', 'eth', true)).toBe(false);
    expect(includesNormalized('@seth', 'eth', true)).toBe(false);
    expect(includesNormalized('something', 'eth', true)).toBe(false);
    expect(includesNormalized('canada', 'ada', true)).toBe(false);
  });

  it('한글·가나·한자 조사가 바로 붙은 라틴 단어는 경계로 본다', () => {
    expect(includesNormalized('eth를 샀다', 'eth', true)).toBe(true);
    expect(includesNormalized('이더eth', 'eth', true)).toBe(true);
    expect(includesNormalized('ethを買う', 'eth', true)).toBe(true);
  });

  it('첫 일치가 단어 안이어도 뒤에 경계 일치가 있으면 찾는다', () => {
    expect(includesNormalized('method eth', 'eth', true)).toBe(true);
    expect(includesNormalized('method seth', 'eth', true)).toBe(false);
  });

  it('키워드 끝이 기호면 그쪽 경계는 따지지 않는다', () => {
    expect(includesNormalized('buy $btcx', '$btc', true)).toBe(false);
    expect(includesNormalized('buy $btc2', '$btc', true)).toBe(true);
    expect(includesNormalized('buy x$btc', '$btc', true)).toBe(true);
    expect(includesNormalized('c++20', 'c++', true)).toBe(true);
  });

  it('빈 키워드는 찾지 않는다', () => {
    expect(includesNormalized('abc', '', true)).toBe(false);
    expect(includesNormalized('abc', '', false)).toBe(false);
  });

  // 대부분의 트윗은 키워드를 포함하지 않는다. indexOf로 걸러지면 정규식을 한 번도 돌리지 않아야 한다.
  it('텍스트에 키워드가 없으면 정규식을 쓰지 않고 바로 false를 돌려준다', () => {
    const test = vi.spyOn(RegExp.prototype, 'test');
    try {
      expect(includesNormalized('hello world', 'eth', true)).toBe(false);
      expect(test).not.toHaveBeenCalled();
    } finally {
      test.mockRestore();
    }
  });
});

describe('includesNormalized: 라틴 글자에 붙은 결합 기호 (#112 컨실 r2)', () => {
  it('결합 기호가 붙은 라틴 글자 옆은 단어 안으로 본다', () => {
    expect(includesNormalized('s\u0332eth', 'eth', true)).toBe(false);
    expect(includesNormalized('eth\u0332er', 'eth', true)).toBe(false);
  });

  it('이모지 변형 선택자·키캡과 숫자 옆은 계속 경계다', () => {
    expect(includesNormalized('\u2764\uFE0Feth', 'eth', true)).toBe(true);
    expect(includesNormalized('1\uFE0F\u20E3eth', 'eth', true)).toBe(true);
    expect(includesNormalized('10eth', 'eth', true)).toBe(true);
  });
});

describe('normalizeForMatch: 한글 호환 자모 (#112 컨실 r2)', () => {
  // NFKC는 호환 자모(ㅋ·ㅠ)를 조합형으로 바꾸고 자음 뒤 모음을 음절로 합친다("ㅋㅋㅋㅠㅠ" → "ᄏᄏ큐ᅲ")
  it('자모로만 쓴 키워드가 모음 자모가 붙은 글에서도 걸린다', () => {
    expect(includesNormalized(normalizeForMatch('ㅋㅋㅋㅠㅠ 진짜'), normalizeForMatch('ㅋㅋㅋ'), false)).toBe(true);
    expect(includesNormalized(normalizeForMatch('ㅋㅠㅠ'), normalizeForMatch('ㅠㅠ'), false)).toBe(true);
    expect(includesNormalized(normalizeForMatch('ㅇㄱㄹㅇㅏ'), normalizeForMatch('ㅇㄱㄹㅇ'), false)).toBe(true);
  });

  it('호환 자모 밖은 계속 NFKC를 적용한다', () => {
    expect(normalizeForMatch('ｅ\u200Bｔｈ')).toBe('eth');
    expect(normalizeForMatch('ﾌﾟﾛﾌ')).toBe('プロフ');
  });
});

describe('includesNormalized: 결합 기호로 끝나는 키워드 (#112 컨실 r3)', () => {
  it('키워드 끝 글자에 결합 기호가 붙어도 뒤 경계를 본다', () => {
    expect(includesNormalized(normalizeForMatch('AİLE'), normalizeForMatch('Aİ'), true)).toBe(false);
    expect(includesNormalized('eth\u0332er', 'eth\u0332', true)).toBe(false);
    expect(includesNormalized('eth\u0332 up', 'eth\u0332', true)).toBe(true);
  });
});
