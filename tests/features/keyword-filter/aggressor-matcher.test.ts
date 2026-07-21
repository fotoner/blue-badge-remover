import { describe, expect, it } from 'vitest';
import { isAggressorProfile } from '@features/keyword-filter/aggressor-matcher';
import type { ProfileInfo } from '@shared/types';

const now = Date.parse('2026-07-22T00:00:00Z');
const candidate: ProfileInfo = {
  handle: 'candidate',
  displayName: 'Candidate',
  bio: '',
  createdAt: '2026-04-01T00:00:00Z',
  followersCount: 2_000,
  followingCount: 100,
};

describe('isAggressorProfile', () => {
  it('6개월 이내, 팔로워 1천 이상, 팔로잉/팔로워 10% 이하를 모두 만족하면 true', () => {
    expect(isAggressorProfile(candidate, now)).toBe(true);
  });

  it('오래된 계정, 낮은 팔로워, 높은 비율은 각각 false', () => {
    expect(isAggressorProfile({ ...candidate, createdAt: '2025-01-01T00:00:00Z' }, now)).toBe(false);
    expect(isAggressorProfile({ ...candidate, followersCount: 999 }, now)).toBe(false);
    expect(isAggressorProfile({ ...candidate, followingCount: 201 }, now)).toBe(false);
  });

  it('메타데이터가 없거나 미래 생성일이면 보수적으로 false', () => {
    expect(isAggressorProfile({ handle: 'x', displayName: 'x', bio: '' }, now)).toBe(false);
    expect(isAggressorProfile({ ...candidate, createdAt: '2027-01-01T00:00:00Z' }, now)).toBe(false);
  });
});
