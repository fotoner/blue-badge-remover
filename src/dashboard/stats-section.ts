import { getTodayStats, getAllTimeTotal, resetAllStats } from '@features/stats';
import { t } from '@shared/i18n';
import type { Settings } from '@shared/types';
import { formatStatCount, computeCategoryBars } from './stats-helpers';

type StatsSettings = Pick<Settings, 'keywordFilterEnabled' | 'language'>;

export async function renderStats({ keywordFilterEnabled, language }: StatsSettings): Promise<void> {
  const stats = await getTodayStats();
  const allTimeTotal = await getAllTimeTotal();

  const heroEl = document.getElementById('hero-count');
  if (heroEl) heroEl.textContent = formatStatCount(stats.totalHidden, language);

  const totalEl = document.getElementById('total-count');
  if (totalEl) totalEl.textContent = formatStatCount(allTimeTotal, language);

  const emptyEl = document.getElementById('stats-empty');
  const barsEl = document.getElementById('category-bars');
  const shareBtn = document.getElementById('share-btn');
  const resetBtn = document.getElementById('reset-stats-btn');

  if (stats.totalHidden === 0 && allTimeTotal === 0) {
    if (emptyEl) emptyEl.style.display = 'block';
    if (barsEl) barsEl.style.display = 'none';
    if (shareBtn) shareBtn.style.display = 'none';
    if (resetBtn) resetBtn.style.display = 'none';
    return;
  }

  if (emptyEl) emptyEl.style.display = 'none';
  if (shareBtn) shareBtn.style.display = 'block';
  if (resetBtn) resetBtn.style.display = 'block';

  if (!keywordFilterEnabled || Object.keys(stats.byCategory).length === 0) {
    if (barsEl) barsEl.style.display = 'none';
  } else {
    if (barsEl) barsEl.style.display = 'flex';
    renderCategoryBars(stats.byCategory);
  }
}

/** 바인딩 시점 값이 아니라 현재 설정을 읽는다 — 언어/키워드 필터 변경 후에도 맞게 표시 */
export function bindStatsEvents(getSettings: () => StatsSettings): void {
  document.getElementById('reset-stats-btn')?.addEventListener('click', async () => {
    const btn = document.getElementById('reset-stats-btn') as HTMLButtonElement;
    const settings = getSettings();
    btn.textContent = t('resettingStats', settings.language);
    btn.disabled = true;
    await resetAllStats();
    await renderStats(settings);
    btn.textContent = t('resetStats', settings.language);
    btn.disabled = false;
  });
}

function renderCategoryBars(categories: Record<string, number>): void {
  const container = document.getElementById('category-bars');
  if (!container) return;

  const bars = computeCategoryBars(categories);
  container.innerHTML = '';

  for (const bar of bars) {
    const row = document.createElement('div');
    row.className = 'category-bar-row';

    const nameEl = document.createElement('span');
    nameEl.className = 'category-bar-name';
    nameEl.textContent = bar.name;

    const track = document.createElement('div');
    track.className = 'category-bar-track';

    const fill = document.createElement('div');
    fill.className = 'category-bar-fill';
    fill.style.width = `${bar.percent}%`;
    track.appendChild(fill);

    const countEl = document.createElement('span');
    countEl.className = 'category-bar-count';
    countEl.textContent = `${bar.count}건`;

    row.appendChild(nameEl);
    row.appendChild(track);
    row.appendChild(countEl);
    container.appendChild(row);
  }
}
