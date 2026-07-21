import { describe, expect, it, vi } from 'vitest';
import { parseImportedFilterPack } from '../../src/options/pack-transfer';

describe('parseImportedFilterPack', () => {
  it('필수 필드가 올바른 JSON 객체만 FilterPack으로 변환한다', () => {
    const pack = parseImportedFilterPack({
      id: 'safe-pack',
      name: 'Safe Pack',
      rules: 'keyword\n*wildcard*',
    });

    expect(pack).toEqual(expect.objectContaining({
      id: 'safe-pack',
      name: 'Safe Pack',
      rules: 'keyword\n*wildcard*',
      version: '1.0.0',
    }));
  });

  it.each([
    null,
    [],
    { id: 123, name: 'Pack', rules: 'rule' },
    { id: 'pack', name: '', rules: 'rule' },
    { id: 'pack', name: 'Pack', rules: 123 },
    { id: '../escape', name: 'Pack', rules: 'rule' },
  ])('잘못된 외부 shape를 거부한다: %j', (input) => {
    expect(parseImportedFilterPack(input)).toBeNull();
  });

  it('허용 필드 길이를 제한하고 https homepage만 보존한다', () => {
    const pack = parseImportedFilterPack({
      id: 'pack',
      name: 'n'.repeat(150),
      description: 'd'.repeat(600),
      author: 'a'.repeat(150),
      category: 'c'.repeat(80),
      version: 'v'.repeat(30),
      homepage: 'javascript:alert(1)',
      rules: 'rule',
      unexpected: 'ignored',
    });

    expect(pack?.name).toHaveLength(100);
    expect(pack?.description).toHaveLength(500);
    expect(pack?.author).toHaveLength(100);
    expect(pack?.category).toHaveLength(50);
    expect(pack?.version).toHaveLength(20);
    expect(pack?.homepage).toBeUndefined();
    expect(pack).not.toHaveProperty('unexpected');
  });

  it('updatedAt이 유효하지 않으면 현재 시각으로 교체한다', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-07-22T00:00:00.000Z'));

    const pack = parseImportedFilterPack({
      id: 'pack', name: 'Pack', rules: 'rule', updatedAt: 'not-a-date',
    });

    expect(pack?.updatedAt).toBe('2026-07-22T00:00:00.000Z');
    vi.useRealTimers();
  });
});
