import { describe, expect, it } from 'vitest';
import { DEFAULT_FILTER_LIST } from '@features/keyword-filter/default-filters';
import { parseFilterList } from '@features/keyword-filter/filter-rule-parser';
import { matchesKeywordFilter } from '@features/keyword-filter/keyword-matcher';
import type { ProfileInfo } from '@shared/types';

// #112: 라틴 키워드를 단어 단위로 맞추면서 기본 목록이 영어 글을 잘못 잡거나 원래 잡던 단어를 놓치지 않는지 본다.
const rules = parseFilterList(DEFAULT_FILTER_LIST);

function matches(bio: string): boolean {
  const profile: ProfileInfo = { handle: 'someone', displayName: 'Someone', bio };
  return matchesKeywordFilter(profile, rules).matched;
}

describe('기본 필터 목록 (#112)', () => {
  it('다른 영어 단어 안에서는 잡지 않는다', () => {
    for (const bio of ['Born in Canada', 'Adam from Ohio', 'something', 'a method', 'lunar eclipse', 'machine learning']) {
      expect(matches(bio), bio).toBe(false);
    }
  });

  it('단독 단어는 전과 같이 잡는다', () => {
    for (const bio of ['ETH holder', 'ADA to the moon', 'LUNA classic', 'Invest early', 'Mac mini setup', 'Tesla owner', 'FSD v12']) {
      expect(matches(bio), bio).toBe(true);
    }
  });

  it('4자 이하 키워드로는 못 잡는 긴 단어형은 목록에 따로 넣어 계속 잡는다', () => {
    for (const bio of ['Ethereum dev', 'Dogecoin fan', 'MacBook Pro M4']) {
      expect(matches(bio), bio).toBe(true);
    }
  });

  // Invest는 5자 이상이라 부분 일치다. 같은 뜻의 단어형을 목록에 또 넣지 않는다.
  it('Invest 부분 일치가 Investing·Investment·Investor를 잡으므로 따로 두지 않는다', () => {
    for (const bio of ['Investing tips', 'Investment advice', 'Investor relations']) {
      expect(matches(bio), bio).toBe(true);
    }
    const keywords = rules.flatMap((rule) => (rule.type === 'keyword' ? [rule.value] : []));
    for (const redundant of ['Investing', 'Investment', 'Investor']) {
      expect(keywords, redundant).not.toContain(redundant);
    }
  });

  it('한글 조사가 붙은 영문 키워드도 잡는다', () => {
    expect(matches('BTC를 샀다')).toBe(true);
    expect(matches('테슬라 FSD가 나왔다')).toBe(true);
  });

  it('너무 넓은 한글 기본 토큰은 더 이상 키워드가 아니다', () => {
    const keywords = rules.flatMap((rule) => (rule.type === 'keyword' ? [rule.value] : []));
    for (const removed of ['국민', '정부', '자유', '결국', '실제']) {
      expect(keywords, removed).not.toContain(removed);
    }
  });
});
