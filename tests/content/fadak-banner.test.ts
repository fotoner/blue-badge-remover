import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  showFadakProfileBanner,
  showFadakDetailBanner,
  removeFadakBanner,
  FADAK_BANNER_ID,
  DETAIL_BANNER_ID,
  type FadakBannerDeps,
} from '../../src/content/fadak-banner';
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
          <svg viewBox="0 0 22 22" data-testid="icon-verified">
            <g><path d="M20.396 11c-.018-.137-.065-.27-.148-.385Z"></path></g>
          </svg>
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
    isCurrentUser: () => false,
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

  // #88: 파딱 사용자가 본인 프로필에서 경고를 보지 않게
  it('본인 프로필에는 배너를 표시하지 않는다', () => {
    setupDOM();
    showFadakProfileBanner(createDeps({ isCurrentUser: (handle) => handle === 'fadakuser' }));
    expect(document.getElementById(FADAK_BANNER_ID)).toBeNull();
  });

  // #88 리뷰: 본인 계정이 배너 대기 중에 늦게 확인되는 경우
  it('배지를 기다리는 동안 본인으로 확인되면 배너를 붙이지 않는다', async () => {
    document.body.innerHTML = '<div data-testid="primaryColumn"><div><div></div></div></div>';
    let isMe = false;
    showFadakProfileBanner(createDeps({ isCurrentUser: () => isMe }));
    isMe = true;
    document.querySelector('[data-testid="primaryColumn"] > div > div')!.innerHTML =
      '<svg data-testid="icon-verified"><g><path d="M0 0"></path></g></svg>';
    await new Promise((r) => setTimeout(r, 0));
    expect(document.getElementById(FADAK_BANNER_ID)).toBeNull();
  });

  it('본인 확인 전에 붙은 배너는 다시 불렀을 때 지운다', () => {
    setupDOM();
    let isMe = false;
    const deps = createDeps({ isCurrentUser: () => isMe });
    showFadakProfileBanner(deps);
    expect(document.getElementById(FADAK_BANNER_ID)).not.toBeNull();
    isMe = true;
    showFadakProfileBanner(deps);
    expect(document.getElementById(FADAK_BANNER_ID)).toBeNull();
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

// ── 트윗 상세 페이지 배너 (작성자 영역 스코프, #35) ─────────────────

const BLUE_BADGE_SVG = `<svg viewBox="0 0 22 22" data-testid="icon-verified">
  <g><path d="M20.396 11c-.018-.137-.065-.27-.148-.385Z"></path></g>
</svg>`;

const GOLD_BADGE_SVG = `<svg viewBox="0 0 22 22" data-testid="icon-verified">
  <g>
    <linearGradient id="grad1"><stop offset="0" stop-color="#f4e72a"></stop></linearGradient>
    <linearGradient id="grad2"><stop offset="0" stop-color="#f9e87f"></stop></linearGradient>
    <path fill="url(#grad1)" d="M20.396 11Z"></path>
    <path fill="url(#grad2)" d="M11 1Z"></path>
    <path fill="#d18800" d="M13 3Z"></path>
  </g>
</svg>`;

function setupDetailDOM(opts?: { authorBadge?: string; quoteBadge?: boolean }): void {
  const quoteHtml = opts?.quoteBadge
    ? `<div>
        <span>인용</span>
        <div>
          <div data-testid="User-Name"><span>quoted</span>${BLUE_BADGE_SVG}</div>
          <a href="/quoted_user">@quoted_user</a>
        </div>
      </div>`
    : '';
  document.body.innerHTML = `
    <div data-testid="primaryColumn">
      <div>
        <div></div>
      </div>
      <article data-testid="tweet">
        <div data-testid="User-Name"><span>quoter</span>${opts?.authorBadge ?? ''}</div>
        <a href="/quoter/status/123"><time></time></a>
        ${quoteHtml}
      </article>
    </div>
  `;
}

describe('showFadakDetailBanner', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
    setPath('/quoter/status/123');
  });

  afterEach(() => {
    // tryInsertBanner가 false를 반환한 케이스의 MutationObserver 해제
    removeFadakBanner();
  });

  it('인용 카드에만 파딱 뱃지가 있으면 배너를 표시하지 않는다', () => {
    setupDetailDOM({ quoteBadge: true }); // 외부 User-Name에는 뱃지 없음
    showFadakDetailBanner(createDeps());
    expect(document.getElementById(DETAIL_BANNER_ID)).toBeNull();
  });

  it('외부 User-Name에 파딱 뱃지가 있으면 배너를 표시한다', () => {
    setupDetailDOM({ authorBadge: BLUE_BADGE_SVG });
    showFadakDetailBanner(createDeps());
    const banner = document.getElementById(DETAIL_BANNER_ID);
    expect(banner).not.toBeNull();
    expect(banner?.className).toContain('bbr-banner-warning');
    expect(banner?.querySelector('button')?.textContent).toBe('화이트리스트에 추가');
  });

  it('금딱이면 배너를 표시하지 않는다', () => {
    setupDetailDOM({ authorBadge: GOLD_BADGE_SVG });
    showFadakDetailBanner(createDeps());
    expect(document.getElementById(DETAIL_BANNER_ID)).toBeNull();
  });

  it('팔로우 중인 유저면 배너를 표시하지 않는다', () => {
    setupDetailDOM({ authorBadge: BLUE_BADGE_SVG });
    showFadakDetailBanner(createDeps({ isHandleFollowed: () => true }));
    expect(document.getElementById(DETAIL_BANNER_ID)).toBeNull();
  });

  it('화이트리스트 유저면 배너를 표시하지 않는다', () => {
    setupDetailDOM({ authorBadge: BLUE_BADGE_SVG });
    showFadakDetailBanner(createDeps({ isHandleWhitelisted: () => true }));
    expect(document.getElementById(DETAIL_BANNER_ID)).toBeNull();
  });

  it('본인 확인 전에 붙은 상세 배너는 다시 불렀을 때 지운다 (#88)', () => {
    setupDetailDOM({ authorBadge: BLUE_BADGE_SVG });
    let isMe = false;
    const deps = createDeps({ isCurrentUser: () => isMe });
    showFadakDetailBanner(deps);
    expect(document.getElementById(DETAIL_BANNER_ID)).not.toBeNull();
    isMe = true;
    showFadakDetailBanner(deps);
    expect(document.getElementById(DETAIL_BANNER_ID)).toBeNull();
  });

  it('본인 트윗 상세에는 배너를 표시하지 않는다 (#88)', () => {
    setupDetailDOM({ authorBadge: BLUE_BADGE_SVG });
    showFadakDetailBanner(createDeps({ isCurrentUser: (handle) => handle === 'quoter' }));
    expect(document.getElementById(DETAIL_BANNER_ID)).toBeNull();
  });
});
