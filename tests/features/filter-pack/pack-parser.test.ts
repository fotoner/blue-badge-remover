import { describe, expect, it } from 'vitest';
import { parseFilterPack, parseFilterPackJson } from '@features/filter-pack/pack-parser';

describe('parseFilterPack', () => {
  it('normalizes a valid pack', () => {
    const pack = parseFilterPack({
      id: 'pack-a',
      name: 'Pack A',
      rules: 'keyword',
      homepage: 'https://example.com/pack.json',
    }, () => '2026-01-01T00:00:00.000Z');

    expect(pack).toEqual({
      id: 'pack-a',
      name: 'Pack A',
      description: '',
      author: '',
      version: '1.0.0',
      updatedAt: '2026-01-01T00:00:00.000Z',
      rules: 'keyword',
      category: undefined,
      homepage: 'https://example.com/pack.json',
    });
  });

  it('rejects missing required fields', () => {
    expect(() => parseFilterPack({ name: 'Missing ID', rules: 'keyword' })).toThrow('Invalid pack format');
    expect(() => parseFilterPack({ id: 'missing-name', rules: 'keyword' })).toThrow('Invalid pack format');
    expect(() => parseFilterPack({ id: 'missing-rules', name: 'Missing Rules' })).toThrow('Invalid pack format');
  });

  it('limits string fields and drops non-https homepage', () => {
    const pack = parseFilterPack({
      id: 'pack-a',
      name: 'x'.repeat(120),
      description: 'd'.repeat(600),
      author: 'a'.repeat(120),
      version: 'v'.repeat(30),
      category: 'c'.repeat(80),
      homepage: 'http://example.com/pack.json',
      rules: 'keyword',
    });

    expect(pack.name).toHaveLength(100);
    expect(pack.description).toHaveLength(500);
    expect(pack.author).toHaveLength(100);
    expect(pack.version).toHaveLength(20);
    expect(pack.category).toHaveLength(50);
    expect(pack.homepage).toBeUndefined();
  });
});

describe('parseFilterPackJson', () => {
  it('parses JSON through the same sanitizer', () => {
    const pack = parseFilterPackJson(JSON.stringify({
      id: 'pack-json',
      name: 'Pack JSON',
      rules: 'keyword',
    }), () => '2026-01-02T00:00:00.000Z');

    expect(pack.id).toBe('pack-json');
    expect(pack.updatedAt).toBe('2026-01-02T00:00:00.000Z');
  });
});
