import { describe, it, expect, vi, beforeEach } from 'vitest';
import { showFadakProfileBanner, FADAK_BANNER_ID, type FadakBannerDeps } from '../../src/content/fadak-banner';
import { DEFAULT_SETTINGS } from '@shared/constants';

function setPath(path: string): void {
  Object.defineProperty(window, 'location', {
    value: { ...window.location, pathname: path },
    writable: true,
    configurable: true,
  });
}

function setupDOM(): void {
  document.body.innerHTML = `
    <div data-testid="primaryColumn">
      <div>
        <div>
          <span data-testid="icon-verified"></span>
        </div>
      </div>
    </div>
  `;
}

function createDeps(overrides?: Partial<FadakBannerDeps>): FadakBannerDeps {
  return {
    isProfilePage: () => true,
    isHandleFollowed: () => false,
    isHandleWhitelisted: () => false,
    getCurrentSettings: () => DEFAULT_SETTINGS,
    addToWhitelist: vi.fn().mockResolvedValue(undefined),
    ...overrides,
  };
}

describe('fadak-banner whitelist button', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
    setPath('/fadakuser');
  });

  it('should render whitelist add button in banner', () => {
    setupDOM();
    showFadakProfileBanner(createDeps());
    const banner = document.getElementById(FADAK_BANNER_ID);
    expect(banner).not.toBeNull();
    const btn = banner?.querySelector('button');
    expect(btn).not.toBeNull();
    expect(btn?.textContent).toBe('화이트리스트에 추가');
  });

  it('should call addToWhitelist with @ prefix on button click', async () => {
    setupDOM();
    const addToWhitelist = vi.fn().mockResolvedValue(undefined);
    showFadakProfileBanner(createDeps({ addToWhitelist }));
    const btn = document.getElementById(FADAK_BANNER_ID)?.querySelector('button');
    btn?.click();
    await vi.waitFor(() => {
      expect(addToWhitelist).toHaveBeenCalledWith('@fadakuser');
    });
  });

  it('should change banner text and class after whitelist add', async () => {
    setupDOM();
    const addToWhitelist = vi.fn().mockResolvedValue(undefined);
    showFadakProfileBanner(createDeps({ addToWhitelist }));
    const banner = document.getElementById(FADAK_BANNER_ID)!;
    const btn = banner.querySelector('button')!;
    btn.click();
    await vi.waitFor(() => {
      expect(banner.className).toContain('bbr-banner-success');
      const span = banner.querySelector('span');
      expect(span?.textContent).toBe('화이트리스트에 추가됨');
    });
  });

  it('should not render banner for followed users', () => {
    setupDOM();
    showFadakProfileBanner(createDeps({ isHandleFollowed: () => true }));
    expect(document.getElementById(FADAK_BANNER_ID)).toBeNull();
  });

  it('should not render banner for whitelisted users', () => {
    setupDOM();
    showFadakProfileBanner(createDeps({ isHandleWhitelisted: () => true }));
    expect(document.getElementById(FADAK_BANNER_ID)).toBeNull();
  });
});
