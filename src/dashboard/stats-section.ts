import { getTodayStats } from '@features/stats';
import { formatStatCount, computeCategoryBars } from './stats-helpers';

export async function renderStats(): Promise<void> {
  const stats = await getTodayStats();

  const heroEl = document.getElementById('hero-count');
  if (heroEl) heroEl.textContent = formatStatCount(stats.total);

  const emptyEl = document.getElementById('stats-empty');
  const barsEl = document.getElementById('category-bars');
  const shareBtn = document.getElementById('share-btn');

  if (stats.total === 0) {
    if (emptyEl) emptyEl.style.display = 'block';
    if (barsEl) barsEl.style.display = 'none';
    if (shareBtn) shareBtn.style.display = 'none';
    return;
  }

  if (emptyEl) emptyEl.style.display = 'none';
  if (barsEl) barsEl.style.display = 'flex';
  if (shareBtn) shareBtn.style.display = 'block';

  renderCategoryBars(stats.categories);
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
