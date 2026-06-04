import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { FilterPackEntry } from '@shared/types';

const mockGetFilterPacks = vi.fn<() => Promise<FilterPackEntry[]>>();

vi.mock('@features/filter-pack', () => ({
  getFilterPacks: (...args: unknown[]) => mockGetFilterPacks(...(args as [])),
}));

const { countRules, updateStats } = await import('../../src/options/rule-stats');

const categories = [
  { name: 'Category A', keywords: ['builtin-a', 'builtin-b'] },
  { name: 'Category B', keywords: ['builtin-c'] },
];

beforeEach(() => {
  document.body.innerHTML = `
    <span id="active-rule-count"></span>
    <span id="builtin-rule-count"></span>
    <span id="custom-rule-count"></span>
    <span id="pack-rule-count"></span>
  `;
  vi.clearAllMocks();
  mockGetFilterPacks.mockResolvedValue([]);
});

describe('countRules', () => {
  it('counts non-empty non-comment lines', () => {
    expect(countRules('keyword\n! comment\n\nother')).toBe(2);
  });
});

describe('updateStats', () => {
  it('updates builtin, custom, and pack counts', async () => {
    mockGetFilterPacks.mockResolvedValue([
      {
        enabled: true,
        pack: {
          id: 'pack-a',
          name: 'Pack A',
          description: '',
          author: '',
          version: '1.0.0',
          updatedAt: '',
          rules: 'pack-a\n! comment\npack-b',
        },
      },
    ]);

    await updateStats({
      defaultFilterEnabled: true,
      disabledCategories: ['Category B'],
      custom: 'custom-a\ncustom-b',
      categories,
    });

    expect(document.getElementById('builtin-rule-count')?.textContent).toBe('2');
    expect(document.getElementById('custom-rule-count')?.textContent).toBe('2');
    expect(document.getElementById('pack-rule-count')?.textContent).toBe('2');
    expect(document.getElementById('active-rule-count')?.textContent).toBe('6');
  });

  it('falls back to zero pack rules when pack storage fails', async () => {
    mockGetFilterPacks.mockRejectedValue(new Error('storage failure'));

    await updateStats({
      defaultFilterEnabled: true,
      disabledCategories: [],
      custom: '',
      categories,
    });

    expect(document.getElementById('pack-rule-count')?.textContent).toBe('0');
    expect(document.getElementById('active-rule-count')?.textContent).toBe('3');
  });
});
