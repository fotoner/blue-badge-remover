import { beforeEach, describe, expect, it, vi } from 'vitest';

const mockSaveDisabledFilterCategories = vi.fn();

vi.mock('@features/keyword-filter', () => ({
  saveDisabledFilterCategories: (...args: unknown[]) => mockSaveDisabledFilterCategories(...args),
}));

const { renderCategories } = await import('../../src/options/categories');

const categories = [
  { name: 'Category A', keywords: ['keyword-a', 'keyword-b'] },
  { name: 'Category B', keywords: ['keyword-c'] },
];

beforeEach(() => {
  document.body.innerHTML = '';
  vi.clearAllMocks();
  mockSaveDisabledFilterCategories.mockResolvedValue(undefined);
});

describe('renderCategories', () => {
  it('renders categories and keyword chips when master filter is enabled', () => {
    const container = document.createElement('div') as HTMLDivElement;

    renderCategories({
      container,
      categories,
      disabledCategories: [],
      masterEnabled: true,
      onChange: vi.fn(),
    });

    expect(container.querySelectorAll('.category-card')).toHaveLength(2);
    expect(container.textContent).toContain('Category A');
    expect(container.textContent).toContain('keyword-b');
  });

  it('renders disabled notice when master filter is disabled', () => {
    const container = document.createElement('div') as HTMLDivElement;

    renderCategories({
      container,
      categories,
      disabledCategories: [],
      masterEnabled: false,
      onChange: vi.fn(),
    });

    expect(container.querySelector('.categories-disabled')?.textContent).toContain('비활성화');
  });

  it('persists disabled category when toggled off', async () => {
    const container = document.createElement('div') as HTMLDivElement;
    const onChange = vi.fn();

    renderCategories({
      container,
      categories,
      disabledCategories: [],
      masterEnabled: true,
      onChange,
    });

    const toggle = container.querySelector('input[type="checkbox"]') as HTMLInputElement;
    toggle.checked = false;
    toggle.dispatchEvent(new Event('change'));
    await Promise.resolve();

    expect(mockSaveDisabledFilterCategories).toHaveBeenCalledWith(['Category A']);
    expect(onChange).toHaveBeenCalledWith(['Category A']);
    expect(container.querySelector('.category-card')?.classList.contains('is-disabled')).toBe(true);
  });
});
