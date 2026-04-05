import { describe, it, expect, vi, beforeEach } from 'vitest';

const store = new Map<string, unknown>();

vi.mock('wxt/browser', () => ({
  browser: {
    storage: {
      local: {
        get: vi.fn(async (keys: string[] | null) => {
          if (keys === null) {
            const result: Record<string, unknown> = {};
            for (const [k, v] of store) result[k] = v;
            return result;
          }
          const result: Record<string, unknown> = {};
          for (const k of keys) {
            if (store.has(k)) result[k] = store.get(k);
          }
          return result;
        }),
        set: vi.fn(async (items: Record<string, unknown>) => {
          for (const [k, v] of Object.entries(items)) store.set(k, v);
        }),
        remove: vi.fn(async (keys: string[]) => {
          for (const k of keys) store.delete(k);
        }),
      },
    },
  },
}));

// Mock ./state to provide settings with language
vi.mock('../../src/content/state', () => ({
  getSettings: () => ({ language: 'ko' }),
}));

// Mock @shared/i18n — t() returns a formatted string
vi.mock('@shared/i18n', () => ({
  t: (key: string, _lang: string, params?: Record<string, string>) =>
    `${key}:${params?.count ?? ''}`,
}));

const { checkMilestone } = await import('../../src/content/milestone-banner');

beforeEach(() => {
  store.clear();
  // Clean up any banner DOM elements
  const banner = document.getElementById('bbr-milestone-banner');
  if (banner) banner.remove();
});

function setupDOM(): void {
  // Create the main > primaryColumn structure that showMilestoneBanner looks for
  const existing = document.querySelector('main');
  if (existing) existing.remove();

  const main = document.createElement('main');
  const col = document.createElement('div');
  col.setAttribute('data-testid', 'primaryColumn');
  main.appendChild(col);
  document.body.appendChild(main);
}

describe('checkMilestone', () => {
  it('does nothing when totalHidden is 0', async () => {
    setupDOM();
    await checkMilestone(0);
    expect(document.getElementById('bbr-milestone-banner')).toBeNull();
    expect(store.has('bbr-milestone-last')).toBe(false);
  });

  it('shows banner at 100 when lastCelebrated=0', async () => {
    setupDOM();
    await checkMilestone(100);

    expect(store.get('bbr-milestone-last')).toBe(100);
    expect(document.getElementById('bbr-milestone-banner')).not.toBeNull();
  });

  it('does nothing at 50 (not a milestone)', async () => {
    setupDOM();
    await checkMilestone(50);

    expect(store.has('bbr-milestone-last')).toBe(false);
    expect(document.getElementById('bbr-milestone-banner')).toBeNull();
  });

  it('shows banner at 500 when lastCelebrated=100', async () => {
    setupDOM();
    store.set('bbr-milestone-last', 100);

    await checkMilestone(500);

    expect(store.get('bbr-milestone-last')).toBe(500);
    expect(document.getElementById('bbr-milestone-banner')).not.toBeNull();
  });

  it('does nothing at 100 when lastCelebrated=100 (already celebrated)', async () => {
    setupDOM();
    store.set('bbr-milestone-last', 100);

    await checkMilestone(100);

    // lastCelebrated unchanged
    expect(store.get('bbr-milestone-last')).toBe(100);
    expect(document.getElementById('bbr-milestone-banner')).toBeNull();
  });
});
