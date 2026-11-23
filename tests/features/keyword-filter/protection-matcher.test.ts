import { describe, expect, it, vi } from 'vitest';
import { matchesProtectedKeyword, normalizeProtectedKeywords } from '@features/keyword-filter/protection-matcher';
import type { ProfileInfo } from '@shared/types';

const profile: ProfileInfo = {
  handle: 'game_fan',
  displayName: '별의 커비 팬',
  bio: '닌텐도와 JRPG를 좋아합니다',
};

describe('matchesProtectedKeyword', () => {
  it('핸들, 표시 이름, 바이오를 대소문자 구분 없이 보호한다', () => {
    expect(matchesProtectedKeyword(profile, ['GAME'])).toBe(true);
    expect(matchesProtectedKeyword(profile, ['커비'])).toBe(true);
    expect(matchesProtectedKeyword(profile, ['jrpg'])).toBe(true);
  });

  it('빈 키워드와 매칭되지 않는 키워드는 보호하지 않는다', () => {
    expect(matchesProtectedKeyword(profile, ['', '   ', '축구'])).toBe(false);
  });

  it('트윗 본문만 일치하는 경우 계정 전체를 보호하지 않는다', () => {
    expect(matchesProtectedKeyword(profile, ['축구'])).toBe(false);
  });
});

// #112: 보호 키워드도 키워드 필터와 같은 정규화를 쓴다. 단어 경계는 쓰지 않고 부분 일치를 유지한다.
describe('matchesProtectedKeyword: 정규화 (#112)', () => {
  it('전각·반각·히라가나·가타카나·제로폭 변형을 같은 글자로 본다', () => {
    expect(matchesProtectedKeyword(profile, ['ＧＡＭＥ'])).toBe(true);
    const jp: ProfileInfo = { handle: 'vt', displayName: 'ブイチューバー', bio: 'プロフ見てね' };
    expect(matchesProtectedKeyword(jp, ['ぷろふ'])).toBe(true);
    expect(matchesProtectedKeyword(jp, ['ﾌﾟﾛﾌ'])).toBe(true);
    expect(matchesProtectedKeyword(jp, ['ブイ\u200bチューバー'])).toBe(true);
  });

  // 보호 키워드는 사용자가 지키려는 계정을 넓게 잡는 쪽이 안전하다. 붙여 쓴 이름(GenshinImpact)도 보호한다.
  it('라틴 키워드는 다른 단어 안에서도 보호한다', () => {
    const impact: ProfileInfo = { handle: 'GenshinImpact', displayName: 'Paimon', bio: '' };
    expect(matchesProtectedKeyword(impact, ['genshin'])).toBe(true);
    const vtubers: ProfileInfo = { handle: 'x', displayName: 'VTubers', bio: '' };
    expect(matchesProtectedKeyword(vtubers, ['vtuber'])).toBe(true);
    const other: ProfileInfo = { handle: 'hailey', displayName: 'Hailey', bio: 'maintainer' };
    expect(matchesProtectedKeyword(other, ['ai'])).toBe(true);
  });

  it('전각 라틴 키워드도 붙여 쓴 이름을 보호한다', () => {
    const impact: ProfileInfo = { handle: 'GenshinImpact', displayName: 'Paimon', bio: '' };
    expect(matchesProtectedKeyword(impact, ['ＧＥＮＳＨＩＮ'])).toBe(true);
  });

  it('키워드가 없으면 정규화하지 않고 바로 보호하지 않는다', () => {
    const normalize = vi.spyOn(String.prototype, 'normalize');
    try {
      expect(matchesProtectedKeyword(profile, [])).toBe(false);
      expect(normalize).not.toHaveBeenCalled();
    } finally {
      normalize.mockRestore();
    }
  });

  it('한글이 바로 붙은 라틴 단어와 한글 키워드의 부분 일치는 유지한다', () => {
    expect(matchesProtectedKeyword(profile, ['커비'])).toBe(true);
    expect(matchesProtectedKeyword(profile, ['닌텐'])).toBe(true);
  });

  it('같은 목록을 여러 번 써도 결과가 같다', () => {
    const keywords = ['ぷろふ', 'ETH'];
    const jp: ProfileInfo = { handle: 'x', displayName: 'プロフ', bio: '' };
    expect(matchesProtectedKeyword(jp, keywords)).toBe(true);
    expect(matchesProtectedKeyword(jp, keywords)).toBe(true);
  });
});

describe('normalizeProtectedKeywords: 정규화 (#112)', () => {
  it('표기만 다른 키워드는 하나로 합치고 먼저 적은 원문을 남긴다', () => {
    expect(normalizeProtectedKeywords(['BTC', 'ＢＴＣ', 'btc'])).toEqual(['BTC']);
    expect(normalizeProtectedKeywords(['ぷろふ', 'プロフ', 'ﾌﾟﾛﾌ'])).toEqual(['ぷろふ']);
  });

  it('원문은 정규화하지 않고 그대로 저장한다', () => {
    expect(normalizeProtectedKeywords(['  ＧＡＭＥ  '])).toEqual(['ＧＡＭＥ']);
  });
});

describe('normalizeProtectedKeywords: 제로폭 문자로 감싼 공백 (#112 컨실 r2)', () => {
  it('정규화 뒤 공백만 남거나 같은 키워드가 되면 저장하지 않는다', () => {
    expect(normalizeProtectedKeywords(['BTC', '\u200B BTC \u200B'])).toEqual(['BTC']);
    expect(normalizeProtectedKeywords(['\u200B   \u200B'])).toEqual([]);
  });
});
