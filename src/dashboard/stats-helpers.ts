export interface CategoryBar {
  name: string;
  count: number;
  percent: number;
}

export function formatStatCount(count: number): string {
  return `${count}개`;
}

export function computeCategoryBars(
  categories: Record<string, number>,
): CategoryBar[] {
  const entries = Object.entries(categories);
  if (entries.length === 0) return [];

  const sorted = entries.sort((a, b) => b[1] - a[1]);
  const max = sorted[0]![1];

  return sorted.map(([name, count]) => ({
    name,
    count,
    percent: max > 0 ? Math.round((count / max) * 100) : 0,
  }));
}

export function getShareText(count: number): string {
  return `오늘 Blue Badge Remover로 파딱 트윗 ${count}개를 숨겼습니다! 🛡️\n\nhttps://chromewebstore.google.com/detail/blue-badge-remover/gpoiflbcmmpihejhgnomdkaofdgjlbhm`;
}
