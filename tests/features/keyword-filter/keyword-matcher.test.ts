import { describe, it, expect } from 'vitest';
import { matchesKeywordFilter } from '@features/keyword-filter/keyword-matcher';
import { parseFilterList } from '@features/keyword-filter/filter-rule-parser';
import type { FilterRule, ProfileInfo } from '@shared/types';

const baseProfile: ProfileInfo = {
  handle: 'testuser',
  displayName: 'Test User',
  bio: '',
};

describe('matchesKeywordFilter', () => {
  it('should match keyword in displayName (case insensitive)', () => {
    const rules: FilterRule[] = [{ type: 'keyword', value: '테슬라' }];
    const profile: ProfileInfo = { ...baseProfile, displayName: '테슬라 팬' };
    const result = matchesKeywordFilter(profile, rules);
    expect(result.matched).toBe(true);
    expect(result.matchedRule).toBe('테슬라');
  });

  it('should match keyword in handle (case insensitive)', () => {
    const rules: FilterRule[] = [{ type: 'keyword', value: 'tesla' }];
    const profile: ProfileInfo = { ...baseProfile, handle: 'TeslaFan' };
    const result = matchesKeywordFilter(profile, rules);
    expect(result.matched).toBe(true);
  });

  it('should match keyword in bio', () => {
    const rules: FilterRule[] = [{ type: 'keyword', value: '년차' }];
    const profile: ProfileInfo = { ...baseProfile, bio: '5년차 개발자' };
    const result = matchesKeywordFilter(profile, rules);
    expect(result.matched).toBe(true);
  });

  it('should not match when keyword is not in any field', () => {
    const rules: FilterRule[] = [{ type: 'keyword', value: '테슬라' }];
    const result = matchesKeywordFilter(baseProfile, rules);
    expect(result.matched).toBe(false);
  });

  it('should return not matched for empty rules', () => {
    const result = matchesKeywordFilter(baseProfile, []);
    expect(result.matched).toBe(false);
  });

  it('should apply exception rule: exception handle blocks match', () => {
    const rules: FilterRule[] = [
      { type: 'keyword', value: 'tesla' },
      { type: 'exception', handle: 'testuser' },
    ];
    const profile: ProfileInfo = { ...baseProfile, handle: 'testuser', bio: 'I love tesla' };
    const result = matchesKeywordFilter(profile, rules);
    expect(result.matched).toBe(false);
  });

  it('should apply wildcard rule', () => {
    const rules: FilterRule[] = [
      { type: 'wildcard', pattern: /.*coin.*/i, original: '*coin*' },
    ];
    const profile: ProfileInfo = { ...baseProfile, displayName: 'Bitcoin Lover' };
    const result = matchesKeywordFilter(profile, rules);
    expect(result.matched).toBe(true);
    expect(result.matchedRule).toBe('*coin*');
  });

  it('should match keywords case-insensitively', () => {
    const rules: FilterRule[] = [{ type: 'keyword', value: 'TESLA' }];
    const profile: ProfileInfo = { ...baseProfile, bio: 'tesla is great' };
    const result = matchesKeywordFilter(profile, rules);
    expect(result.matched).toBe(true);
  });

  it('should match keyword in tweet text', () => {
    const rules: FilterRule[] = [{ type: 'keyword', value: '테슬라' }];
    const result = matchesKeywordFilter(baseProfile, rules, '테슬라 주가 올랐다');
    expect(result.matched).toBe(true);
  });

  it('should match wildcard in tweet text', () => {
    const rules: FilterRule[] = [{ type: 'wildcard', pattern: /.*coin.*/i, original: '*coin*' }];
    const result = matchesKeywordFilter(baseProfile, rules, 'Bitcoin is the future');
    expect(result.matched).toBe(true);
  });

  it('should not match tweet text when tweetText is not provided', () => {
    const rules: FilterRule[] = [{ type: 'keyword', value: '테슬라' }];
    const result = matchesKeywordFilter(baseProfile, rules);
    expect(result.matched).toBe(false);
  });
});

// #112: 표기 변형을 같은 글자로 보고, 라틴 키워드는 다른 단어 안에서 잡지 않는다.
// 규칙은 실제 경로처럼 parseFilterList로 만든다.
function matches(filter: string, profile: Partial<ProfileInfo>, tweetText?: string): boolean {
  return matchesKeywordFilter({ ...baseProfile, ...profile }, parseFilterList(filter), tweetText).matched;
}

describe('matchesKeywordFilter: 정규화 (#112)', () => {
  it('전각 영문 키워드와 반각 텍스트를 서로 같은 글자로 본다', () => {
    expect(matches('ＢＴＣ', { bio: 'BTC 홀더' })).toBe(true);
    expect(matches('BTC', { bio: 'ＢＴＣ 홀더' })).toBe(true);
  });

  it('반각 가타카나와 전각 가타카나를 같은 글자로 본다', () => {
    expect(matches('ﾌﾟﾛﾌ', { bio: 'プロフ見てね' })).toBe(true);
    expect(matches('プロフ', { bio: 'ﾌﾟﾛﾌ見てね' })).toBe(true);
  });

  it('히라가나와 가타카나를 같은 글자로 본다', () => {
    expect(matches('ぷろふ', { bio: 'プロフ見てね' })).toBe(true);
    expect(matches('プロフ', { displayName: 'ぷろふ' })).toBe(true);
    expect(matches('ネタバレ', {}, 'ねたばれ注意')).toBe(true);
  });

  it('제로폭 문자를 끼워 넣어도 찾는다', () => {
    expect(matches('副業', { bio: '副\u200b業で稼ぐ' })).toBe(true);
    expect(matches('副\u200b業', { bio: '副業で稼ぐ' })).toBe(true);
    expect(matches('副業', {}, '副\ufeff業')).toBe(true);
  });

  it('와일드카드도 같은 정규화를 거친다', () => {
    expect(matches('*ＢＴＣ*', { bio: 'btc holder' })).toBe(true);
    expect(matches('*ぷろふ*', {}, 'ﾌﾟﾛﾌ')).toBe(true);
    expect(matches('副*業', {}, '副\u200b収入\u200b業')).toBe(true);
  });

  it('와일드카드는 여전히 텍스트 전체에 고정되고 *word*는 부분 일치다', () => {
    expect(matches('*crypto*', { bio: 'mycryptoworld' })).toBe(true);
    expect(matches('crypto*', { bio: 'mycryptoworld' })).toBe(false);
    expect(matches('crypto*', { bio: 'cryptoworld' })).toBe(true);
    expect(matches('*tesla', { handle: 'TeslaFan' })).toBe(false);
    expect(matches('*tesla*', { handle: 'TeslaFan' })).toBe(true);
  });

  it('전각 ＠＠ 예외 줄도 예외로 동작한다', () => {
    const filter = 'tesla\n＠＠testuser';
    expect(matches(filter, { handle: 'TestUser', bio: 'tesla' })).toBe(false);
    expect(matches(filter, { handle: 'other', bio: 'tesla' })).toBe(true);
  });

  it('matchedRule에는 사용자가 적은 원문을 돌려준다', () => {
    const result = matchesKeywordFilter(
      { ...baseProfile, bio: 'btc' },
      parseFilterList('ＢＴＣ'),
    );
    expect(result.matchedRule).toBe('ＢＴＣ');
  });
});

describe('matchesKeywordFilter: 라틴 키워드 단어 경계 (#112)', () => {
  it('ADA는 Canada·Adam 안에서 잡지 않는다', () => {
    expect(matches('ADA', { bio: 'Born in Canada' })).toBe(false);
    expect(matches('ADA', { displayName: 'Adam' })).toBe(false);
    expect(matches('ADA', { bio: 'ADA 홀더' })).toBe(true);
    expect(matches('ADA', {}, 'buy ada.')).toBe(true);
  });

  it('ETH는 something·method·@seth 안에서 잡지 않는다', () => {
    expect(matches('ETH', { bio: 'something' })).toBe(false);
    expect(matches('ETH', { bio: 'method' })).toBe(false);
    expect(matches('ETH', { handle: 'seth' })).toBe(false);
    expect(matches('ETH', {}, 'thanks @seth')).toBe(false);
    expect(matches('ETH', { bio: 'ETH' })).toBe(true);
    expect(matches('ETH', {}, '(ETH) 상승')).toBe(true);
  });

  // 4자 이하만 단어 단위로 맞춘다. 5자 이상은 우연히 다른 단어 안에 들어갈 일이 드물고,
  // 단어 단위로 맞추면 Investing·Investor·TeslaFan처럼 원래 잡던 글을 놓친다.
  it('정규화 뒤 4자 이하인 라틴 키워드만 단어 안에서 잡지 않는다', () => {
    expect(matches('Mac', { bio: 'machine learning' })).toBe(false);
    expect(matches('LUNA', { bio: 'lunar eclipse' })).toBe(false);
    expect(matches('bitc', { bio: 'bitcoin' })).toBe(false);
    expect(matches('bitco', { bio: 'bitcoin' })).toBe(true);
  });

  it('5자 이상 라틴 키워드는 다른 단어 안에서도 잡는다', () => {
    expect(matches('Invest', { bio: 'investigation team' })).toBe(true);
    expect(matches('Invest', { bio: 'Investing tips' })).toBe(true);
    expect(matches('tesla', { handle: 'TeslaFan' })).toBe(true);
    expect(matches('Invest', { bio: 'Invest in yourself' })).toBe(true);
  });

  it('길이는 정규화한 뒤에 센다', () => {
    // 전각 4자 'ＬＵＮＡ'는 정규화하면 4자라 단어 단위다
    expect(matches('ＬＵＮＡ', { bio: 'lunar eclipse' })).toBe(false);
    // 제로폭 문자를 지우면 4자가 되는 키워드도 단어 단위다
    expect(matches('l\u200Buna', { bio: 'lunar eclipse' })).toBe(false);
  });

  it('한글·일본어가 바로 붙은 라틴 단어는 잡는다', () => {
    expect(matches('ETH', {}, '이더리움 ETH를 샀다')).toBe(true);
    expect(matches('FSD', {}, 'FSD가 출시됐다')).toBe(true);
    expect(matches('BTC', {}, 'BTCを買った')).toBe(true);
  });

  it('밑줄로 이어진 핸들 조각은 단어 경계로 본다', () => {
    expect(matches('btc', { handle: 'crypto_btc' })).toBe(true);
  });

  it('숫자·이모지·변형 선택자 옆의 라틴 키워드는 잡는다', () => {
    expect(matches('ETH', { bio: '10ETH' })).toBe(true);
    expect(matches('BTC', { bio: '1BTC now' })).toBe(true);
    expect(matches('ETH', { bio: 'ETH2.0' })).toBe(true);
    expect(matches('BTC', { handle: 'btc2024' })).toBe(true);
    expect(matches('BTC', { bio: '❤️BTC' })).toBe(true);
    expect(matches('BTC', { bio: '⚡️BTC' })).toBe(true);
    expect(matches('BTC', { bio: '1️⃣BTC' })).toBe(true);
    expect(matches('ETH', { bio: '⚠️ETH' })).toBe(true);
  });

  it('숫자를 경계로 봐도 다른 라틴 단어 안의 일치는 잡지 않는다', () => {
    expect(matches('ETH', { bio: 'method' })).toBe(false);
    expect(matches('ETH', { handle: 'seth' })).toBe(false);
    expect(matches('ETH', {}, '@seth')).toBe(false);
    expect(matches('ETH', { bio: 'something' })).toBe(false);
    expect(matches('ADA', { bio: 'Canada' })).toBe(false);
  });

  it('제로폭 문자로 쪼갠 가나·악센트 표기도 원래 표기와 같다', () => {
    expect(matches('ﾌ\u200Bﾟﾛﾌ', { bio: 'プロフ' })).toBe(true);
    expect(matches('プロフ', { bio: 'ﾌ\u200Bﾟﾛﾌ' })).toBe(true);
    expect(matches('か\u200B\u3099ち', { bio: 'ガチ勢' })).toBe(true);
    expect(matches('ガチ', { bio: 'か\u200B\u3099ち勢' })).toBe(true);
    expect(matches('cafe\u200B\u0301', { bio: 'Best café' })).toBe(true);
    expect(matches('café', { bio: 'cafe\u200B\u0301 owner' })).toBe(true);
  });

  it('한글·가나·한자가 들어간 키워드는 부분 일치를 유지한다', () => {
    expect(matches('코인', { bio: '비트코인 투자' })).toBe(true);
    expect(matches('テスラ', {}, 'テスラモーターズ')).toBe(true);
    expect(matches('Mac미니', { bio: 'Mac미니M4' })).toBe(true);
  });

  it('글자 없는 키워드(국기·기호)는 부분 일치를 유지한다', () => {
    expect(matches('🇰🇷', { displayName: '🇰🇷김철수' })).toBe(true);
    expect(matches(';;', {}, '이거;;진짜')).toBe(true);
  });
});
