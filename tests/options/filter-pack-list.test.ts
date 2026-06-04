import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { FilterPack, FilterPackEntry } from '@shared/types';

const mockGetFilterPacks = vi.fn<() => Promise<FilterPackEntry[]>>();
const mockSaveFilterPack = vi.fn<(pack: FilterPack) => Promise<void>>();
const mockToggleFilterPack = vi.fn<(id: string, enabled: boolean) => Promise<void>>();
const mockRemoveFilterPack = vi.fn<(id: string) => Promise<void>>();
const mockShowExportModal = vi.fn();

vi.mock('@features/filter-pack', async () => {
  const actual = await vi.importActual<typeof import('@features/filter-pack')>('@features/filter-pack');
  return {
    ...actual,
    getFilterPacks: (...args: unknown[]) => mockGetFilterPacks(...(args as [])),
    saveFilterPack: (...args: unknown[]) => mockSaveFilterPack(...(args as [FilterPack])),
    toggleFilterPack: (...args: unknown[]) => mockToggleFilterPack(...(args as [string, boolean])),
    removeFilterPack: (...args: unknown[]) => mockRemoveFilterPack(...(args as [string])),
  };
});

vi.mock('../../src/options/export-modal', () => ({
  showExportModal: (...args: unknown[]) => mockShowExportModal(...args),
}));

const { bindPackEvents, renderFilterPacks } = await import('../../src/options/filter-pack-list');

const flushAsync = (): Promise<void> => new Promise((resolve) => setTimeout(resolve, 0));

function makePack(overrides: Partial<FilterPack> = {}): FilterPack {
  return {
    id: 'pack-a',
    name: 'Pack A',
    description: '',
    author: '',
    version: '1.0.0',
    updatedAt: '',
    rules: 'keyword-a\nkeyword-b',
    ...overrides,
  };
}

beforeEach(() => {
  document.body.innerHTML = `
    <textarea id="custom-filters"></textarea>
    <button id="export-pack-btn"></button>
    <button id="import-pack-btn"></button>
    <input id="import-pack-file" type="file">
    <div id="filter-pack-list"></div>
    <p id="packs-empty"></p>
  `;
  vi.clearAllMocks();
  mockGetFilterPacks.mockResolvedValue([]);
  mockSaveFilterPack.mockResolvedValue(undefined);
  mockToggleFilterPack.mockResolvedValue(undefined);
  mockRemoveFilterPack.mockResolvedValue(undefined);
});

describe('renderFilterPacks', () => {
  it('renders empty state when no packs exist', async () => {
    await renderFilterPacks(vi.fn());

    expect(document.getElementById('packs-empty')?.style.display).toBe('block');
    expect(document.querySelectorAll('.category-card')).toHaveLength(0);
  });

  it('renders pack list and handles enable/remove events', async () => {
    mockGetFilterPacks.mockResolvedValue([
      { pack: makePack(), enabled: false },
    ]);
    const onChange = vi.fn();

    await renderFilterPacks(onChange);

    expect(document.querySelector('.category-name')?.textContent).toBe('Pack A');
    expect(document.querySelector('.category-count')?.textContent).toBe('2');

    const toggle = document.querySelector('input[type="checkbox"]') as HTMLInputElement;
    toggle.checked = true;
    toggle.dispatchEvent(new Event('change'));
    await Promise.resolve();

    expect(mockToggleFilterPack).toHaveBeenCalledWith('pack-a', true);
    expect(onChange).toHaveBeenCalled();

    const remove = document.querySelector('.btn-remove') as HTMLButtonElement;
    remove.click();
    await Promise.resolve();
    await Promise.resolve();

    expect(mockRemoveFilterPack).toHaveBeenCalledWith('pack-a');
  });
});

describe('bindPackEvents', () => {
  it('opens export modal when custom rules exist', () => {
    const customEl = document.getElementById('custom-filters') as HTMLTextAreaElement;
    customEl.value = 'keyword';

    bindPackEvents({ customEl, onChange: vi.fn() });
    document.getElementById('export-pack-btn')?.click();

    expect(mockShowExportModal).toHaveBeenCalledWith('keyword');
  });

  it('imports a valid pack file and ignores invalid files', async () => {
    const onChange = vi.fn();
    const customEl = document.getElementById('custom-filters') as HTMLTextAreaElement;
    const fileInput = document.getElementById('import-pack-file') as HTMLInputElement;
    bindPackEvents({ customEl, onChange });

    Object.defineProperty(fileInput, 'files', {
      value: [{ text: () => Promise.resolve(JSON.stringify(makePack({ id: 'imported' }))) }],
      configurable: true,
    });
    fileInput.dispatchEvent(new Event('change'));
    await flushAsync();

    expect(mockSaveFilterPack).toHaveBeenCalledWith(expect.objectContaining({ id: 'imported' }));
    expect(onChange).toHaveBeenCalled();

    vi.clearAllMocks();
    Object.defineProperty(fileInput, 'files', {
      value: [{ text: () => Promise.resolve(JSON.stringify({ id: 'bad' })) }],
      configurable: true,
    });
    fileInput.dispatchEvent(new Event('change'));
    await flushAsync();

    expect(mockSaveFilterPack).not.toHaveBeenCalled();
  });
});
