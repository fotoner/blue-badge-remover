// src/content/fadak-banner.ts
import { t } from '@shared/i18n';
import { TIMINGS } from '@shared/constants';
import type { Settings } from '@shared/types';
import { isBlueBadgeElement } from '@features/badge-detection/svg-fallback';
import { extractTweetStatusPath, findAuthorBadge } from './tweet-processing';

export const FADAK_BANNER_ID = 'bbr-fadak-profile-banner';
const BANNER_STYLE_ATTR = 'data-bbr-banner-styles';
let fadakBannerObserver: MutationObserver | null = null;

export interface FadakBannerDeps {
  isProfilePage: () => boolean;
  isHandleFollowed: (handle: string) => boolean;
  isHandleWhitelisted: (handle: string) => boolean;
  getCurrentSettings: () => Settings;
  addToWhitelist: (handle: string) => Promise<void>;
}

function injectBannerStyles(): void {
  if (document.querySelector(`[${BANNER_STYLE_ATTR}]`)) return;
  const style = document.createElement('style');
  style.setAttribute(BANNER_STYLE_ATTR, 'true');
  style.textContent = `
    .bbr-fadak-banner {
      display: flex;
      align-items: center;
      justify-content: center;
      gap: 12px;
      padding: 8px 20px;
      font-size: 13px;
      font-weight: 500;
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      transition: background 0.3s, opacity 0.3s;
    }
    .bbr-fadak-banner.bbr-banner-warning {
      background: #F4212E;
      color: white;
    }
    .bbr-fadak-banner.bbr-banner-success {
      background: #00ba7c;
      color: white;
    }
    .bbr-fadak-banner .bbr-banner-btn {
      background: white;
      color: #F4212E;
      border: none;
      border-radius: 16px;
      padding: 6px 18px;
      font-size: 13px;
      font-weight: 600;
      cursor: pointer;
      white-space: nowrap;
      font-family: inherit;
      transition: opacity 0.15s;
    }
    .bbr-fadak-banner .bbr-banner-btn:hover {
      opacity: 0.85;
    }
  `;
  document.head.appendChild(style);
}

export function showFadakProfileBanner(deps: FadakBannerDeps): void {
  const settings = deps.getCurrentSettings();
  if (!deps.isProfilePage() || !settings.enabled) return;
  if (document.getElementById(FADAK_BANNER_ID)) return;

  const pathHandle = window.location.pathname.split('/')[1]?.toLowerCase();
  if (!pathHandle) return;
  if (deps.isHandleFollowed(pathHandle)) return;
  if (deps.isHandleWhitelisted(pathHandle)) return;

  function tryInsertBanner(): boolean {
    const stickyHeader = document.querySelector('[data-testid="primaryColumn"] > div > div:first-child');
    if (!stickyHeader) return false;
    const verifiedBadge = stickyHeader.querySelector('[data-testid="icon-verified"]');
    if (!verifiedBadge) return false;
    if (document.getElementById(FADAK_BANNER_ID)) return true;

    // 금딱이면 배너 표시하지 않음
    if (!isBlueBadgeElement(verifiedBadge)) return true;

    injectBannerStyles();
    const lang = settings.language;

    const banner = document.createElement('div');
    banner.id = FADAK_BANNER_ID;
    banner.className = 'bbr-fadak-banner bbr-banner-warning';

    const text = document.createElement('span');
    text.textContent = t('fadakProfileBanner', lang, { handle: pathHandle ?? '' });
    banner.appendChild(text);

    const btn = document.createElement('button');
    btn.className = 'bbr-banner-btn';
    btn.textContent = t('addToWhitelist', lang);
    btn.addEventListener('click', async () => {
      await deps.addToWhitelist('@' + pathHandle);
      text.textContent = t('addedToWhitelist', lang);
      banner.className = 'bbr-fadak-banner bbr-banner-success';
      btn.remove();
      setTimeout(() => banner.remove(), TIMINGS.BANNER_SUCCESS_DISMISS);
    });
    banner.appendChild(btn);

    stickyHeader.appendChild(banner);
    return true;
  }

  if (tryInsertBanner()) return;

  // Wait for badge to render via MutationObserver
  if (fadakBannerObserver) fadakBannerObserver.disconnect();
  const target = document.querySelector('[data-testid="primaryColumn"]') ?? document.body;
  fadakBannerObserver = new MutationObserver(() => {
    if (tryInsertBanner()) {
      fadakBannerObserver?.disconnect();
      fadakBannerObserver = null;
    }
  });
  fadakBannerObserver.observe(target, { childList: true, subtree: true });
  setTimeout(() => { fadakBannerObserver?.disconnect(); fadakBannerObserver = null; }, TIMINGS.BANNER_OBSERVER_TIMEOUT);
}

export function removeFadakBanner(): void {
  document.getElementById(FADAK_BANNER_ID)?.remove();
  document.getElementById(DETAIL_BANNER_ID)?.remove();
  if (fadakBannerObserver) {
    fadakBannerObserver.disconnect();
    fadakBannerObserver = null;
  }
  if (detailBannerObserver) {
    detailBannerObserver.disconnect();
    detailBannerObserver = null;
  }
}

// ── 트윗 상세 페이지 파딱 배너 ────────────────────────────────────

export const DETAIL_BANNER_ID = 'bbr-fadak-detail-banner';
let detailBannerObserver: MutationObserver | null = null;

export function showFadakDetailBanner(deps: FadakBannerDeps): void {
  const settings = deps.getCurrentSettings();
  if (!window.location.pathname.includes('/status/') || !settings.enabled) return;
  if (document.getElementById(DETAIL_BANNER_ID)) return;

  const pathHandle = window.location.pathname.split('/')[1]?.toLowerCase();
  if (!pathHandle) return;
  if (deps.isHandleFollowed(pathHandle)) return;
  if (deps.isHandleWhitelisted(pathHandle)) return;

  function tryInsertBanner(): boolean {
    const stickyHeader = document.querySelector('[data-testid="primaryColumn"] > div > div:first-child');
    if (!stickyHeader) return false;

    // URL의 status path와 일치하는 article을 찾아 해당 트윗의 뱃지 확인
    const currentPath = window.location.pathname;
    const articles = document.querySelectorAll('article[data-testid="tweet"]');
    let targetTweet: HTMLElement | null = null;
    for (const article of articles) {
      const sp = extractTweetStatusPath(article as HTMLElement);
      if (sp && currentPath.includes(sp)) {
        targetTweet = article as HTMLElement;
        break;
      }
    }
    if (!targetTweet) return false;
    // 작성자 영역 스코프 탐색 — 인용 카드 내부 뱃지로 배너 오표시 방지 (#35)
    const verifiedBadge = findAuthorBadge(targetTweet);
    if (!verifiedBadge) return false;
    if (document.getElementById(DETAIL_BANNER_ID)) return true;

    // 금딱/회딱이면 배너 표시하지 않음
    if (!isBlueBadgeElement(verifiedBadge)) return true;

    injectBannerStyles();
    const lang = settings.language;

    const banner = document.createElement('div');
    banner.id = DETAIL_BANNER_ID;
    banner.className = 'bbr-fadak-banner bbr-banner-warning';

    const text = document.createElement('span');
    text.textContent = t('fadakDetailBanner', lang, { handle: pathHandle ?? '' });
    banner.appendChild(text);

    const btn = document.createElement('button');
    btn.className = 'bbr-banner-btn';
    btn.textContent = t('addToWhitelist', lang);
    btn.addEventListener('click', async () => {
      await deps.addToWhitelist('@' + pathHandle);
      text.textContent = t('addedToWhitelist', lang);
      banner.className = 'bbr-fadak-banner bbr-banner-success';
      btn.remove();
      setTimeout(() => banner.remove(), TIMINGS.BANNER_SUCCESS_DISMISS);
    });
    banner.appendChild(btn);

    stickyHeader.appendChild(banner);
    return true;
  }

  if (tryInsertBanner()) return;

  if (detailBannerObserver) detailBannerObserver.disconnect();
  const target = document.querySelector('[data-testid="primaryColumn"]') ?? document.body;
  detailBannerObserver = new MutationObserver(() => {
    if (tryInsertBanner()) {
      detailBannerObserver?.disconnect();
      detailBannerObserver = null;
    }
  });
  detailBannerObserver.observe(target, { childList: true, subtree: true });
  setTimeout(() => { detailBannerObserver?.disconnect(); detailBannerObserver = null; }, TIMINGS.BANNER_OBSERVER_TIMEOUT);
}
