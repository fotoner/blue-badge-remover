import { describe, expect, it } from 'vitest';
import { matchesProtectedKeyword } from '@features/keyword-filter/protection-matcher';
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
