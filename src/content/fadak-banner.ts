// src/content/fadak-banner.ts
import { t } from '@shared/i18n';
import { TIMINGS } from '@shared/constants';
import type { Settings } from '@shared/types';

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
    #${FADAK_BANNER_ID} {
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
    #${FADAK_BANNER_ID}.bbr-banner-warning {
      background: #F4212E;
      color: white;
    }
    #${FADAK_BANNER_ID}.bbr-banner-success {
      background: #00ba7c;
      color: white;
    }
    #${FADAK_BANNER_ID} .bbr-banner-btn {
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
    #${FADAK_BANNER_ID} .bbr-banner-btn:hover {
      opacity: 0.85;
    }
  `;
  document.head.appendChild(style);
}

function isBlueBadge(badgeEl: Element): boolean {
  const svg = badgeEl.closest('svg') ?? badgeEl;
  // 금딱은 linearGradient 사용
  if (svg.querySelector('linearGradient')) return false;
  // 회색딱 체크
  const fill = (svg.getAttribute('fill') ?? '').toLowerCase();
  if (fill.includes('#829aab') || fill.includes('grey') || fill.includes('gray')) return false;
  return true;
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
    if (!isBlueBadge(verifiedBadge)) return true;

    injectBannerStyles();
    const lang = settings.language;

    const banner = document.createElement('div');
    banner.id = FADAK_BANNER_ID;
    banner.className = 'bbr-banner-warning';

    const text = document.createElement('span');
    text.textContent = t('fadakProfileBanner', lang, { handle: pathHandle ?? '' });
    banner.appendChild(text);

    const btn = document.createElement('button');
    btn.className = 'bbr-banner-btn';
    btn.textContent = t('addToWhitelist', lang);
    btn.addEventListener('click', async () => {
      await deps.addToWhitelist('@' + pathHandle);
      text.textContent = t('addedToWhitelist', lang);
      banner.className = 'bbr-banner-success';
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
  if (fadakBannerObserver) {
    fadakBannerObserver.disconnect();
    fadakBannerObserver = null;
  }
}
