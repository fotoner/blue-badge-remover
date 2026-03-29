// src/content/fadak-banner.ts
import { t } from '@shared/i18n';
import type { Settings } from '@shared/types';

export const FADAK_BANNER_ID = 'bbr-fadak-profile-banner';
let fadakBannerObserver: MutationObserver | null = null;

export interface FadakBannerDeps {
  isProfilePage: () => boolean;
  isHandleFollowed: (handle: string) => boolean;
  isHandleWhitelisted: (handle: string) => boolean;
  getCurrentSettings: () => Settings;
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

    const banner = document.createElement('div');
    banner.id = FADAK_BANNER_ID;
    banner.textContent = t('fadakProfileBanner', settings.language, { handle: pathHandle ?? '' });
    banner.style.cssText = 'background:#F4212E;color:white;text-align:center;padding:6px 16px;font-size:13px;font-weight:500;';
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
  setTimeout(() => { fadakBannerObserver?.disconnect(); fadakBannerObserver = null; }, 10000);
}

export function removeFadakBanner(): void {
  document.getElementById(FADAK_BANNER_ID)?.remove();
  if (fadakBannerObserver) {
    fadakBannerObserver.disconnect();
    fadakBannerObserver = null;
  }
}
