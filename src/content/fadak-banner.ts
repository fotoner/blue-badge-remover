// src/content/fadak-banner.ts
import { detectBlueBadgeElement } from '@features/badge-detection';
import { t } from '@shared/i18n';
import { TIMINGS } from '@shared/constants';
import type { Settings } from '@shared/types';
import { extractTweetStatusPath } from './tweet-processing';

export const FADAK_BANNER_ID = 'bbr-fadak-profile-banner';
export const DETAIL_BANNER_ID = 'bbr-fadak-detail-banner';
const BANNER_STYLE_ATTR = 'data-bbr-banner-styles';
let fadakBannerObserver: MutationObserver | null = null;

export interface FadakBannerDeps {
  isProfilePage: () => boolean;
  isHandleFollowed: (handle: string) => boolean;
  isHandleWhitelisted: (handle: string) => boolean;
  getCurrentSettings: () => Settings;
  addToWhitelist: (handle: string) => Promise<void>;
}

type BannerMessageKey = 'fadakProfileBanner' | 'fadakDetailBanner';

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

function getPathHandle(): string | null {
  return window.location.pathname.split('/')[1]?.toLowerCase() ?? null;
}

function getStickyHeader(): Element | null {
  return document.querySelector('[data-testid="primaryColumn"] > div > div:first-child');
}

function getEligibleHandle(
  deps: FadakBannerDeps,
  settings: Settings,
  bannerId: string,
  pageGuard: boolean,
): string | null {
  if (!pageGuard || !settings.enabled) return null;
  if (document.getElementById(bannerId)) return null;

  const pathHandle = getPathHandle();
  if (!pathHandle) return null;
  if (deps.isHandleFollowed(pathHandle)) return null;
  if (deps.isHandleWhitelisted(pathHandle)) return null;
  return pathHandle;
}

function createWhitelistBanner(
  id: string,
  messageKey: BannerMessageKey,
  handle: string,
  settings: Settings,
  deps: FadakBannerDeps,
): HTMLElement {
  injectBannerStyles();
  const lang = settings.language;

  const banner = document.createElement('div');
  banner.id = id;
  banner.className = 'bbr-fadak-banner bbr-banner-warning';

  const text = document.createElement('span');
  text.textContent = t(messageKey, lang, { handle });
  banner.appendChild(text);

  const btn = document.createElement('button');
  btn.className = 'bbr-banner-btn';
  btn.textContent = t('addToWhitelist', lang);
  btn.addEventListener('click', async () => {
    await deps.addToWhitelist('@' + handle);
    text.textContent = t('addedToWhitelist', lang);
    banner.className = 'bbr-fadak-banner bbr-banner-success';
    btn.remove();
    setTimeout(() => banner.remove(), TIMINGS.BANNER_SUCCESS_DISMISS);
  });
  banner.appendChild(btn);

  return banner;
}

function observeUntilInserted(
  getObserver: () => MutationObserver | null,
  setObserver: (observer: MutationObserver | null) => void,
  target: Element,
  tryInsert: () => boolean,
): void {
  getObserver()?.disconnect();
  const observer = new MutationObserver(() => {
    if (tryInsert()) {
      observer.disconnect();
      setObserver(null);
    }
  });
  setObserver(observer);
  observer.observe(target, { childList: true, subtree: true });
  setTimeout(() => {
    if (getObserver() !== observer) return;
    observer.disconnect();
    setObserver(null);
  }, TIMINGS.BANNER_OBSERVER_TIMEOUT);
}

export function showFadakProfileBanner(deps: FadakBannerDeps): void {
  const settings = deps.getCurrentSettings();
  const pathHandle = getEligibleHandle(deps, settings, FADAK_BANNER_ID, deps.isProfilePage());
  if (!pathHandle) return;
  const handle = pathHandle;

  function tryInsertBanner(): boolean {
    const stickyHeader = getStickyHeader();
    if (!stickyHeader) return false;
    const verifiedBadge = stickyHeader.querySelector('[data-testid="icon-verified"]');
    if (!verifiedBadge) return false;
    if (document.getElementById(FADAK_BANNER_ID)) return true;

    // 금딱이면 배너 표시하지 않음
    if (!detectBlueBadgeElement(verifiedBadge)) return true;

    stickyHeader.appendChild(createWhitelistBanner(FADAK_BANNER_ID, 'fadakProfileBanner', handle, settings, deps));
    return true;
  }

  if (tryInsertBanner()) return;

  const target = document.querySelector('[data-testid="primaryColumn"]') ?? document.body;
  observeUntilInserted(
    () => fadakBannerObserver,
    (observer) => { fadakBannerObserver = observer; },
    target,
    tryInsertBanner,
  );
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

let detailBannerObserver: MutationObserver | null = null;

export function showFadakDetailBanner(deps: FadakBannerDeps): void {
  const settings = deps.getCurrentSettings();
  const pathHandle = getEligibleHandle(deps, settings, DETAIL_BANNER_ID, window.location.pathname.includes('/status/'));
  if (!pathHandle) return;
  const handle = pathHandle;

  function tryInsertBanner(): boolean {
    const stickyHeader = getStickyHeader();
    if (!stickyHeader) return false;

    // URL의 status path와 일치하는 article을 찾아 해당 트윗의 뱃지 확인
    const currentPath = window.location.pathname;
    const articles = document.querySelectorAll('article[data-testid="tweet"]');
    let targetTweet: Element | null = null;
    for (const article of articles) {
      const sp = extractTweetStatusPath(article as HTMLElement);
      if (sp && currentPath.includes(sp)) {
        targetTweet = article;
        break;
      }
    }
    if (!targetTweet) return false;
    const verifiedBadge = targetTweet.querySelector('[data-testid="icon-verified"]');
    if (!verifiedBadge) return false;
    if (document.getElementById(DETAIL_BANNER_ID)) return true;

    // 금딱/회딱이면 배너 표시하지 않음
    if (!detectBlueBadgeElement(verifiedBadge)) return true;

    stickyHeader.appendChild(createWhitelistBanner(DETAIL_BANNER_ID, 'fadakDetailBanner', handle, settings, deps));
    return true;
  }

  if (tryInsertBanner()) return;

  const target = document.querySelector('[data-testid="primaryColumn"]') ?? document.body;
  observeUntilInserted(
    () => detailBannerObserver,
    (observer) => { detailBannerObserver = observer; },
    target,
    tryInsertBanner,
  );
}
