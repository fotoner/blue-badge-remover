// src/content/milestone-banner.ts
// 마일스톤 축하 배너: 100/500/1K/5K/10K 도달 시 타임라인 상단에 표시.
import { browser } from 'wxt/browser';
import { t, type Language } from '@shared/i18n';
import { getSettings } from './state';

const MILESTONE_BANNER_ID = 'bbr-milestone-banner';
const MILESTONE_STORAGE_KEY = 'bbr-milestone-last';
const MILESTONES = [100, 500, 1000, 5000, 10000];

export async function checkMilestone(totalHidden: number): Promise<void> {
  if (totalHidden <= 0) return;

  const result = await browser.storage.local.get([MILESTONE_STORAGE_KEY]);
  const lastCelebrated = (result[MILESTONE_STORAGE_KEY] as number | undefined) ?? 0;

  const reached = MILESTONES.filter((m) => totalHidden >= m && m > lastCelebrated);
  if (reached.length === 0) return;

  const highest = reached[reached.length - 1]!;
  await browser.storage.local.set({ [MILESTONE_STORAGE_KEY]: highest });
  showMilestoneBanner(highest);
}

function showMilestoneBanner(count: number): void {
  if (document.getElementById(MILESTONE_BANNER_ID)) return;

  const main = document.querySelector('main [data-testid="primaryColumn"]') ?? document.querySelector('main');
  if (!main) return;

  const banner = document.createElement('div');
  banner.id = MILESTONE_BANNER_ID;
  banner.style.cssText = `
    display: flex; align-items: center; justify-content: center; gap: 12px;
    padding: 10px 20px; background: #1d9bf0; color: white;
    font-size: 13px; font-weight: 600;
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
  `;

  const text = document.createElement('span');
  const lang = getSettings().language;
  text.textContent = t('milestoneMessage', lang, { count: count.toLocaleString() });

  const dismiss = document.createElement('button');
  dismiss.textContent = '✕';
  dismiss.style.cssText = `
    background: none; border: none; color: white; font-size: 16px;
    cursor: pointer; padding: 0 4px; opacity: 0.7;
  `;
  dismiss.addEventListener('click', () => banner.remove());

  banner.appendChild(text);
  banner.appendChild(dismiss);
  main.insertBefore(banner, main.firstChild);
}
