import { describe, expect, it } from 'vitest';
import { splitProfileBatches } from '../../src/injected/profile-batches';

describe('splitProfileBatches', () => {
  it('큰 프로필 목록을 메시지 경계 제한에 맞춰 나눈다', () => {
    const profiles = Array.from({ length: 2001 }, (_, index) => index);

    const batches = splitProfileBatches(profiles);

    expect(batches.map((batch) => batch.length)).toEqual([1000, 1000, 1]);
  });
});
