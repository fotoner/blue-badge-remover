import { describe, it, expect } from 'vitest';
import { countTokens, topN } from '@features/keyword-collector';
import type { CollectedFadak } from '@shared/types';

// Helper that mimics renderKeywords text collection logic
function collectTexts(list: CollectedFadak[]): string[] {
  const texts: string[] = [];
  for (const fadak of list) {
    if (fadak.bio) texts.push(fadak.bio);
    for (const t of fadak.tweetTexts) texts.push(t);
  }
  return texts;
}

describe('keyword chart data pipeline', () => {
  const baseAccount: CollectedFadak = {
    userId: 'user123',
    handle: 'test',
    displayName: 'Test',
    bio: '',
    tweetTexts: [],
    firstSeenAt: 0,
    lastSeenAt: 0,
  };

  it('빈 목록에서 텍스트가 없으면 빈 배열을 반환한다', () => {
    expect(collectTexts([])).toEqual([]);
  });

  it('bio를 텍스트에 포함한다', () => {
    const list = [{ ...baseAccount, bio: '테스트 바이오' }];
    expect(collectTexts(list)).toContain('테스트 바이오');
  });

  it('bio 없는 경우 tweetTexts만 포함한다', () => {
    const list = [{ ...baseAccount, tweetTexts: ['트윗 내용'] }];
    expect(collectTexts(list)).toEqual(['트윗 내용']);
  });

  it('여러 계정의 텍스트를 모두 수집한다', () => {
    const list = [
      { ...baseAccount, bio: '바이오1', tweetTexts: ['트윗1'] },
      { ...baseAccount, handle: 'test2', bio: '', tweetTexts: ['트윗2', '트윗3'] },
    ];
    expect(collectTexts(list)).toEqual(['바이오1', '트윗1', '트윗2', '트윗3']);
  });

  it('topN(30)은 최대 30개만 반환한다', () => {
    const texts = Array.from({ length: 100 }, (_, i) => '가'.repeat(i + 1));
    const counts = countTokens(texts);
    expect(topN(counts, 30).length).toBeLessThanOrEqual(30);
  });

  it('최빈 토큰이 첫 번째로 온다', () => {
    // '비트코인'×2 → '비트'×2, '비트코'×2, '비트코인'×2
    // '비트'×1    → '비트'×1
    // 결과: '비트'=3, '비트코'=2, '비트코인'=2
    const texts = ['비트코인', '비트코인', '비트'];
    const counts = countTokens(texts);
    const top = topN(counts, 30);
    expect(top[0]!.token).toBe('비트');
    expect(top[0]!.count).toBe(3);
  });
});
