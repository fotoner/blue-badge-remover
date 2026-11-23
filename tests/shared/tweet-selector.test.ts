// 트윗 article 선택자 한 곳 (#142): 기존 앱(rweb)과 새 앱(xweb)의 트윗을 모두 잡고 인용 프레임 안 article은 잡지 않는다.
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { beforeEach, describe, expect, it } from 'vitest';
import { TWEET_ARTICLE_SELECTOR } from '@shared/constants';

const EMBEDDED_FRAME = '[data-slot="embedded-tweet-frame"]';

function loadFixture(name: string): void {
  document.body.innerHTML = readFileSync(resolve(process.cwd(), 'tests/fixtures/x-dom', `${name}.html`), 'utf8');
}

describe('TWEET_ARTICLE_SELECTOR', () => {
  it('기존 앱: article[data-testid="tweet"]을 잡는다', () => {
    loadFixture('quote-card');

    const matched = document.querySelectorAll(TWEET_ARTICLE_SELECTOR);

    expect(matched).toHaveLength(1);
    expect(matched[0]).toBe(document.querySelector('article[data-testid="tweet"]'));
  });

  it('새 앱: data-href 컨테이너의 직계 article 하나만 잡고 인용 프레임 안 article은 잡지 않는다', () => {
    loadFixture('xweb-quote-tweet');

    const matched = document.querySelectorAll(TWEET_ARTICLE_SELECTOR);

    expect(document.querySelectorAll('article')).toHaveLength(2);
    expect(matched).toHaveLength(1);
    expect(matched[0]?.closest(EMBEDDED_FRAME)).toBeNull();
  });

  it('새 앱: 인용 프레임만 있는 조각에서는 아무것도 잡지 않는다', () => {
    loadFixture('xweb-embedded-frame');

    expect(document.querySelectorAll('article')).toHaveLength(1);
    expect(document.querySelectorAll(TWEET_ARTICLE_SELECTOR)).toHaveLength(0);
  });

  describe('요소 하나를 matches·closest로 볼 때(MutationObserver·fiber 관찰)', () => {
    beforeEach(() => loadFixture('xweb-quote-tweet'));

    it('최상위 article은 matches가 참이고, 그 안의 요소에서 closest로 찾는다', () => {
      const article = document.querySelector<HTMLElement>(TWEET_ARTICLE_SELECTOR);
      const innerLink = article?.querySelector('a');

      expect(article?.matches(TWEET_ARTICLE_SELECTOR)).toBe(true);
      expect(innerLink?.closest(TWEET_ARTICLE_SELECTOR)).toBe(article);
    });

    it('인용 프레임 안 요소에서 closest로 찾으면 프레임이 아니라 바깥 트윗이 나온다', () => {
      const frameLink = document.querySelector(`${EMBEDDED_FRAME} a`);

      expect(frameLink?.closest(TWEET_ARTICLE_SELECTOR)).toBe(document.querySelector(TWEET_ARTICLE_SELECTOR));
    });
  });
});
