import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { t } from '@shared/i18n';

// 추천·팔로잉 탭이 모두 '홈 타임라인' 범위에 들어가는데, 설정 문구가 홈 타임라인만 적어 추천 탭이 포함되는지 알 수 없었다
describe('homeTimeline', () => {
  it.each([
    ['ko', '홈 타임라인 (추천·팔로잉)'],
    ['en', 'Home Timeline (For you · Following)'],
    ['ja', 'ホームタイムライン（おすすめ・フォロー中）'],
  ] as const)('%s 문구가 추천·팔로잉 탭을 함께 드러낸다', (lang, label) => {
    expect(t('homeTimeline', lang)).toBe(label);
  });

  it('대시보드 HTML 기본 텍스트가 한국어 번역과 같다', () => {
    const html = readFileSync(resolve(process.cwd(), 'entrypoints/dashboard/index.html'), 'utf8');
    const doc = new DOMParser().parseFromString(html, 'text/html');
    const label = doc.querySelector('[data-i18n="homeTimeline"]');
    expect(label?.textContent?.trim()).toBe(t('homeTimeline', 'ko'));
  });
});
