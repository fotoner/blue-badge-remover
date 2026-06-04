import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { showExportModal } from '../../src/options/export-modal';

beforeEach(() => {
  document.body.innerHTML = '';
  vi.restoreAllMocks();
  vi.useFakeTimers();
  vi.setSystemTime(new Date('2026-01-01T00:00:00.000Z'));
  Object.defineProperty(URL, 'createObjectURL', {
    value: vi.fn(() => 'blob:pack'),
    configurable: true,
  });
  Object.defineProperty(URL, 'revokeObjectURL', {
    value: vi.fn(),
    configurable: true,
  });
  vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => undefined);
});

afterEach(() => {
  vi.useRealTimers();
});

describe('showExportModal', () => {
  it('creates a JSON download with default metadata', async () => {
    showExportModal('keyword');

    document.getElementById('export-confirm')?.click();

    const blob = vi.mocked(URL.createObjectURL).mock.calls[0]?.[0] as Blob;
    const json = JSON.parse(await blob.text()) as Record<string, unknown>;

    expect(json).toMatchObject({
      id: 'custom-1767225600000',
      name: '내 키워드 필터',
      version: '1.0.0',
      updatedAt: '2026-01-01T00:00:00.000Z',
      rules: 'keyword',
    });
    expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:pack');
    expect(document.querySelector('.export-modal-overlay')).toBeNull();
  });

  it('closes on cancel and overlay click', () => {
    showExportModal('keyword');
    document.getElementById('export-cancel')?.click();
    expect(document.querySelector('.export-modal-overlay')).toBeNull();

    showExportModal('keyword');
    const overlay = document.querySelector('.export-modal-overlay') as HTMLElement;
    overlay.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    expect(document.querySelector('.export-modal-overlay')).toBeNull();
  });
});
