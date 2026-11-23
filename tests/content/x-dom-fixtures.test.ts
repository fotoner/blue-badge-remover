// 실제 X 화면에서 뜬 DOM 조각(tests/fixtures/x-dom)으로 파서를 검증한다.
// 손으로 만든 픽스처가 실제 구조와 달라 놓쳤던 버그(#67 계정 식별, #69 리트위터 식별)를 막기 위한 테스트.
// 픽스처 갱신: scripts/x-dom/README.md
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, it, expect, beforeEach } from 'vitest';
import {
  extractTweetAuthor,
  extractDisplayName,
  extractRetweeterHandle,
  extractRetweeterName,
  findQuoteBlock,
  extractQuoteAuthor,
  findAuthorBadge,
} from '../../src/content/tweet-processing';
import { detectBadgeSvg, isBlueBadgeElement } from '@features/badge-detection/svg-fallback';
import { getAccountHandleFromDOM } from '../../src/content/page-utils';
import { FOLLOW_BUTTON_SELECTOR, readFollowButton } from '../../src/content/follow-button';

function loadFixture(name: string): void {
  document.body.innerHTML = readFileSync(resolve(process.cwd(), 'tests/fixtures/x-dom', `${name}.html`), 'utf8');
}

function tweet(): HTMLElement {
  const article = document.querySelector<HTMLElement>('article[data-testid="tweet"]');
  if (!article) throw new Error('fixture has no tweet article');
  return article;
}

describe('실측 X DOM 픽스처', () => {
  it('사이드바에 프로필 링크 없이 계정 전환 버튼만 있어도 본인 핸들을 읽는다', () => {
    loadFixture('account-switcher');

    expect(document.querySelector('[data-testid="AppTabBar_Profile_Link"]')).toBeNull();
    expect(getAccountHandleFromDOM()).toBe('user_1');
  });

  describe('리트윗: 링크가 socialContext를 감싸고, 금색 배지 계정 인용을 포함', () => {
    beforeEach(() => loadFixture('repost-wrapped-social-context'));

    it('리트위터와 작성자를 구분한다', () => {
      expect(extractRetweeterHandle(tweet())).toBe('user_1');
      expect(extractTweetAuthor(tweet())?.handle).toBe('user_2');
    });

    it('리트위터 이름은 문구("님이 재게시함")를 빼고 이름 span만 읽는다 (#111)', () => {
      expect(extractRetweeterName(tweet())).toBe('표시 이름');
    });

    it('작성자 표시 이름은 User-Name 링크에서 읽는다 (#111)', () => {
      expect(extractDisplayName(tweet(), 'user_2')).toBe('표시 이름');
    });

    it('작성자 배지는 파딱으로, 인용 카드의 금색 배지는 파딱이 아닌 것으로 본다', () => {
      const badge = findAuthorBadge(tweet());
      const quote = findQuoteBlock(tweet());

      expect(badge !== null && isBlueBadgeElement(badge)).toBe(true);
      expect(quote).not.toBeNull();
      expect(extractQuoteAuthor(quote as HTMLElement)?.handle).toBe('user_3');
      expect(detectBadgeSvg(quote as HTMLElement)).toBe(false);
    });
  });

  describe('인용 트윗: 파딱이 아닌 계정이 파딱을 인용', () => {
    beforeEach(() => loadFixture('quote-card'));

    it('인용 카드와 인용된 파딱을 찾는다', () => {
      const quote = findQuoteBlock(tweet());

      expect(quote).not.toBeNull();
      expect(extractQuoteAuthor(quote as HTMLElement)?.handle).toBe('user_2');
      expect(detectBadgeSvg(quote as HTMLElement)).toBe(true);
    });

    it('인용된 계정의 표시 이름에 @가 들어 있어도 testid의 실제 핸들을 읽는다 (#110)', () => {
      const quote = findQuoteBlock(tweet()) as HTMLElement;
      const nameSpan = quote.querySelector('[data-testid="User-Name"] span span');
      if (!nameSpan) throw new Error('fixture quote card has no display name span');
      nameSpan.textContent = '名前@C105';

      expect(extractQuoteAuthor(quote)?.handle).toBe('user_2');
    });

    it('인용 카드의 파딱 배지를 작성자 것으로 보지 않는다 (#35)', () => {
      expect(extractTweetAuthor(tweet())?.handle).toBe('user_1');
      expect(findAuthorBadge(tweet())).toBeNull();
    });
  });

  // 2026-11-23 한국어 화면 실측. 실제 DOM은 UserCell button 안에 팔로우 button이 중첩되지만 HTML 파서가 펼친다 (#111)
  describe('사용자 셀의 팔로우 버튼', () => {
    function followButton(): Element {
      const button = document.querySelector(FOLLOW_BUTTON_SELECTOR);
      if (!button) throw new Error('fixture has no follow button');
      return button;
    }

    it('팔로우 전 버튼(testid -follow)은 팔로우 중이 아닌 것으로 읽는다', () => {
      loadFixture('user-cell-follow');
      expect(readFollowButton(followButton())).toEqual({ handle: 'user_1', following: false });
    });

    it('팔로잉 목록의 버튼(testid -unfollow)은 팔로우 중으로 읽는다', () => {
      loadFixture('user-cell-following');
      expect(readFollowButton(followButton())).toEqual({ handle: 'user_1', following: true });
    });
  });
});
