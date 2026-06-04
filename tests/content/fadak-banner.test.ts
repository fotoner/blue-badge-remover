import { afterEach, describe, it, expect, vi, beforeEach } from 'vitest';
import {
  showFadakDetailBanner,
  showFadakProfileBanner,
  DETAIL_BANNER_ID,
  FADAK_BANNER_ID,
  type FadakBannerDeps,
} from '../../src/content/fadak-banner';
import { DEFAULT_SETTINGS, TIMINGS } from '@shared/constants';

function setPath(path: string): void {
  Object.defineProperty(window, 'location', {
    value: { ...window.location, pathname: path },
    writable: true,
    configurable: true,
  });
}

function blueBadge(): string {
  return `<svg viewBox="0 0 22 22" data-testid="icon-verified">
    <g><path d="M20.396 11c-.018-.137-.065-.27-.148-.385Z"></path></g>
  </svg>`;
}

function goldBadge(): string {
  return `<svg viewBox="0 0 22 22" data-testid="icon-verified">
    <g>
      <linearGradient id="grad1"><stop offset="0" stop-color="#f4e72a"></stop></linearGradient>
      <path fill="url(#grad1)" d="M20.396 11Z"></path>
      <path fill="#d18800" d="M13 3Z"></path>
      <path fill="#d18800" d="M14 4Z"></path>
    </g>
  </svg>`;
}

function setupDOM(badge = blueBadge()): void {
  document.body.innerHTML = `
    <div data-testid="primaryColumn">
      <div>
        <div>
          ${badge}
        </div>
      </div>
    </div>
  `;
}

function setupDetailDOM(badge = blueBadge()): void {
  document.body.innerHTML = `
    <div data-testid="primaryColumn">
      <div><div></div></div>
      <article data-testid="tweet">
        <a href="/fadakuser/status/123"><time datetime="2026-01-01"></time></a>
        ${badge}
      </article>
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
    vi.useRealTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
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

  it('should not render profile banner for gold badge users', () => {
    setupDOM(goldBadge());
    showFadakProfileBanner(createDeps());
    expect(document.getElementById(FADAK_BANNER_ID)).toBeNull();
  });

  it('should render detail banner for main tweet blue badge', () => {
    setPath('/fadakuser/status/123');
    setupDetailDOM();
    showFadakDetailBanner(createDeps());

    const banner = document.getElementById(DETAIL_BANNER_ID);
    expect(banner).not.toBeNull();
    expect(banner?.textContent).toContain('이 트윗은 파딱 계정 @fadakuser의 게시물입니다');
  });

  it('should not render detail banner for gold badge users', () => {
    setPath('/fadakuser/status/123');
    setupDetailDOM(goldBadge());
    showFadakDetailBanner(createDeps());

    expect(document.getElementById(DETAIL_BANNER_ID)).toBeNull();
  });

  it('should stop observing after timeout when profile badge never appears', async () => {
    vi.useFakeTimers();
    document.body.innerHTML = '<div data-testid="primaryColumn"><div><div></div></div></div>';

    showFadakProfileBanner(createDeps());
    vi.advanceTimersByTime(TIMINGS.BANNER_OBSERVER_TIMEOUT);
    document.querySelector('[data-testid="primaryColumn"] > div > div')!.innerHTML = blueBadge();
    await Promise.resolve();

    expect(document.getElementById(FADAK_BANNER_ID)).toBeNull();
  });
});
