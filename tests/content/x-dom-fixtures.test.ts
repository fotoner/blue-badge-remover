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
  extractTweetStatusPath,
  extractTweetText,
} from '../../src/content/tweet-processing';
import { detectBadgeSvg, isBlueBadgeElement } from '@features/badge-detection/svg-fallback';
import { getAccountHandleFromDOM } from '../../src/content/page-utils';
import { FOLLOW_BUTTON_SELECTOR, readFollowButton } from '../../src/content/follow-button';
import { TWEET_ARTICLE_SELECTOR } from '@shared/constants';

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

// 2026-11-23 로그인 xweb 화면 실측(강제 진입). 기존 앱의 data-testid·User-Name·icon-verified가 없고,
// 작성자·배지·인용을 구조(.x-middot-group, use[href], data-slot)로 읽는다 (#142)
describe('실측 xweb DOM 픽스처 (#142)', () => {
  const EMBEDDED_FRAME = '[data-slot="embedded-tweet-frame"]';

  function xwebTweet(): HTMLElement {
    const article = document.querySelector<HTMLElement>(TWEET_ARTICLE_SELECTOR);
    if (!article) throw new Error('fixture has no xweb tweet article');
    return article;
  }

  function quoteFrame(): HTMLElement {
    const frame = document.querySelector<HTMLElement>(EMBEDDED_FRAME);
    if (!frame) throw new Error('fixture has no embedded tweet frame');
    return frame;
  }

  describe('인용이 있는 최상위 트윗', () => {
    beforeEach(() => loadFixture('xweb-quote-tweet'));

    it('작성자 핸들은 인용 프레임 밖 머리글에서 읽는다', () => {
      expect(extractTweetAuthor(xwebTweet())).toEqual({ handle: 'user_1' });
    });

    it('표시 이름은 머리글의 이름 링크에서 읽는다', () => {
      expect(extractDisplayName(xwebTweet(), 'user_1')).toBe('…');
    });

    it('상태 경로는 컨테이너 data-href에서 읽는다', () => {
      expect(extractTweetStatusPath(xwebTweet())).toBe('/user_1/status/1');
    });

    it('작성자 배지는 파딱 심볼(#icon-verified-premium-color)이다', () => {
      const badge = findAuthorBadge(xwebTweet());

      expect(badge).not.toBeNull();
      expect(badge?.getAttribute('href')).toBe('#icon-verified-premium-color');
      expect(isBlueBadgeElement(badge as Element)).toBe(true);
    });

    it('인용 블록은 embedded-tweet-frame 컨테이너이고, 인용 작성자와 배지를 읽는다', () => {
      const quote = findQuoteBlock(xwebTweet());

      expect(quote).toBe(quoteFrame());
      expect(extractQuoteAuthor(quote as HTMLElement)).toEqual({ handle: 'user_1', displayName: '…' });
      expect(detectBadgeSvg(quote as HTMLElement)).toBe(true);
    });

    it('작성자 배지가 없으면 인용된 파딱 배지를 작성자 것으로 보지 않는다 (#35)', () => {
      const authorBadge = findAuthorBadge(xwebTweet());
      authorBadge?.closest('svg')?.remove();

      expect(findAuthorBadge(xwebTweet())).toBeNull();
      expect(detectBadgeSvg(quoteFrame())).toBe(true);
    });

    it('작성자 배지가 파딱이 아닌 심볼(business·government)이면 파딱으로 보지 않는다', () => {
      for (const symbol of ['#icon-verified-business-color', '#icon-verified-government-color']) {
        loadFixture('xweb-quote-tweet');
        findAuthorBadge(xwebTweet())?.setAttribute('href', symbol);

        const badge = findAuthorBadge(xwebTweet());
        expect(badge).not.toBeNull();
        expect(isBlueBadgeElement(badge as Element)).toBe(false);
      }
    });

    it('표시 이름에 @가 들어 있어도 @핸들 링크의 핸들을 읽는다 (#110)', () => {
      const nameDiv = xwebTweet().querySelector('.x-middot-group a div');
      if (!nameDiv) throw new Error('fixture header has no display name');
      nameDiv.textContent = '名前@C105';

      expect(extractTweetAuthor(xwebTweet())).toEqual({ handle: 'user_1' });
      expect(extractDisplayName(xwebTweet(), 'user_1')).toBe('名前@C105');
    });

    // 실측 구조: 본문은 머리글 아래 형제인 div[dir="auto"]다. 머리글의 이름 링크 안 div[dir="auto"](표시 이름)와
    // 인용 프레임 안 같은 구조 둘이 더 있다 — 바깥 본문 자리표시자 하나만 본문이다 (#142 리뷰 r1 S1-3)
    function bodyCandidates(scope: 'outer' | 'quote'): HTMLElement[] {
      const root = scope === 'outer' ? xwebTweet() : quoteFrame();
      return Array.from(root.querySelectorAll<HTMLElement>('[dir="auto"]')).filter((el) => {
        if (el.closest('.x-middot-group')) return false;
        const inFrame = el.closest(EMBEDDED_FRAME) !== null;
        return scope === 'quote' ? inFrame : !inFrame;
      });
    }

    it('실측 구조에서 본문 자리는 인용 프레임 밖과 안에 하나씩이다', () => {
      expect(bodyCandidates('outer')).toHaveLength(1);
      expect(bodyCandidates('quote')).toHaveLength(1);
    });

    it('인용 프레임 밖 본문 자리표시자를 키워드로 바꾸면 extractTweetText에 나온다', () => {
      bodyCandidates('outer')[0]!.textContent = '바깥본문키워드';

      expect(extractTweetText(xwebTweet())).toBe('바깥본문키워드');
    });

    it('인용 프레임 본문은 extractTweetText에 나오지 않는다', () => {
      bodyCandidates('outer')[0]!.textContent = '바깥본문키워드';
      bodyCandidates('quote')[0]!.textContent = '인용본문키워드';

      expect(extractTweetText(xwebTweet())).not.toContain('인용본문키워드');
    });

    it('이름 링크 안 표시 이름은 본문에 넣지 않는다', () => {
      bodyCandidates('outer')[0]!.textContent = '바깥본문키워드';
      const nameDiv = xwebTweet().querySelector('.x-middot-group a div[dir="auto"]');
      if (!nameDiv) throw new Error('fixture header has no display name');
      nameDiv.textContent = '표시이름키워드';

      expect(extractTweetText(xwebTweet())).not.toContain('표시이름키워드');
    });

    it('버튼 안 [dir="auto"] 텍스트는 본문에 넣지 않는다', () => {
      bodyCandidates('outer')[0]!.textContent = '바깥본문키워드';
      const button = document.createElement('button');
      button.innerHTML = '<span dir="auto">버튼문구키워드</span>';
      bodyCandidates('outer')[0]!.after(button);

      expect(extractTweetText(xwebTweet())).toBe('바깥본문키워드');
    });

    // 합성(#142 리뷰 r2 S2-1): 실측 픽스처의 번역 표시 줄(Grok 아이콘을 품은 영역)에 dir="auto"를 붙인 모양.
    // 번역 표시의 UI 문구가 본문으로 읽혀 키워드 판정에 섞이면 안 된다
    function grokNoteRow(): HTMLElement {
      const icon = Array.from(xwebTweet().querySelectorAll('[data-icon="icon-logo-grok"]'))
        .find((el) => !el.closest('.x-middot-group') && !el.closest('button') && !el.closest(EMBEDDED_FRAME));
      const row = icon?.closest('span')?.parentElement;
      if (!row) throw new Error('fixture has no translation note row');
      return row;
    }

    it('번역 표시 영역의 dir="auto" 텍스트는 본문에 넣지 않는다', () => {
      bodyCandidates('outer')[0]!.textContent = '바깥본문키워드';
      const label = grokNoteRow().querySelector<HTMLElement>(':scope > span:not(:has(svg))');
      if (!label) throw new Error('fixture note row has no label span');
      label.setAttribute('dir', 'auto');
      label.textContent = '번역표시문구';

      expect(extractTweetText(xwebTweet())).toBe('바깥본문키워드');
    });

    it('번역 표시 줄 전체에 dir="auto"가 붙어도 본문에 넣지 않는다', () => {
      bodyCandidates('outer')[0]!.textContent = '바깥본문키워드';
      const row = grokNoteRow();
      row.setAttribute('dir', 'auto');
      row.insertAdjacentText('beforeend', '번역표시문구');

      expect(extractTweetText(xwebTweet())).toBe('바깥본문키워드');
    });

    // #142 리뷰 r3 S2-1: 본문은 작성자 머리글 뒤에 오는 첫 [dir="auto"] 하나다. 링크 미리보기 같은 뒤쪽 영역의 문구가 섞이면 안 된다
    it('S2-1: 링크 미리보기(링크·버튼 밖)의 dir="auto" 문구가 본문 뒤에 있어도 본문에 섞이지 않는다', () => {
      const body = bodyCandidates('outer')[0]!;
      body.textContent = '바깥본문키워드';
      const preview = document.createElement('div');
      preview.setAttribute('role', 'link');
      preview.innerHTML = '<div dir="auto">미리보기제목키워드</div><div dir="auto">미리보기설명키워드</div>';
      body.after(preview);

      expect(extractTweetText(xwebTweet())).toBe('바깥본문키워드');
    });

    it('S2-1: 머리글 뒤 첫 dir="auto"만 본문으로 읽고 그 뒤의 dir="auto" 블록은 읽지 않는다', () => {
      const body = bodyCandidates('outer')[0]!;
      body.textContent = '바깥본문키워드';
      const second = document.createElement('div');
      second.setAttribute('dir', 'auto');
      second.textContent = '뒤쪽문구키워드';
      body.after(second);

      expect(extractTweetText(xwebTweet())).toBe('바깥본문키워드');
    });

    // 합성(#142 리뷰 r3 S3-2): 번역 표시 줄은 아이콘을 감싼 요소의 부모 하나뿐이다. 아이콘만 있는 번역 표시가 본문과 나란해도 본문을 읽는다
    it('S3-2: 아이콘만 있는 번역 표시(문구·버튼 없음)가 본문과 나란해도 본문을 읽는다', () => {
      const body = bodyCandidates('outer')[0]!;
      body.textContent = '바깥본문키워드';
      const iconOnly = document.createElement('div');
      iconOnly.innerHTML = '<span><svg data-icon="icon-logo-grok" viewBox="0 0 24 24" role="img"></svg></span>';
      body.before(iconOnly);

      expect(extractTweetText(xwebTweet())).toBe('바깥본문키워드');
    });

    it('S3-2: 아이콘을 감싼 요소가 본문과 같은 컨테이너(머리글도 함께 있는)에 바로 놓여도 본문을 읽는다', () => {
      const body = bodyCandidates('outer')[0]!;
      body.textContent = '바깥본문키워드';
      const wrapper = document.createElement('span');
      wrapper.innerHTML = '<svg data-icon="icon-logo-grok" viewBox="0 0 24 24" role="img"></svg>';
      body.before(wrapper);

      expect(extractTweetText(xwebTweet())).toBe('바깥본문키워드');
    });

    it('번역 표시가 없는 트윗의 본문은 그대로 읽는다', () => {
      bodyCandidates('outer')[0]!.textContent = '바깥본문키워드';
      xwebTweet().querySelectorAll('[data-icon="icon-logo-grok"]').forEach((icon) => icon.remove());

      expect(extractTweetText(xwebTweet())).toBe('바깥본문키워드');
    });

    it('본문이 인용 프레임(Grok 아이콘 포함)과 같은 컨테이너에 있어도 머리글과 떨어져 있으면 본문으로 읽는다', () => {
      const body = bodyCandidates('outer')[0]!;
      body.textContent = '바깥본문키워드';
      // 본문을 머리글이 없는 컨테이너(인용 프레임과 같은 곳)로 옮긴다
      const mediaBox = quoteFrame().parentElement;
      if (!mediaBox) throw new Error('fixture quote frame has no container');
      mediaBox.prepend(body);

      expect(extractTweetText(xwebTweet())).toBe('바깥본문키워드');
    });

    it('인용 프레임 조각을 루트로 읽으면 그 프레임의 본문을 돌려준다', () => {
      loadFixture('xweb-embedded-frame');
      const body = Array.from(quoteFrame().querySelectorAll<HTMLElement>('[dir="auto"]')).find((el) => !el.closest('.x-middot-group'));
      if (!body) throw new Error('fixture frame has no body');
      body.textContent = '프레임본문키워드';

      expect(extractTweetText(quoteFrame())).toBe('프레임본문키워드');
    });
  });

  describe('인용 프레임 컨테이너만 있는 조각', () => {
    beforeEach(() => loadFixture('xweb-embedded-frame'));

    it('프레임을 루트로 인용 작성자 핸들과 파딱 배지를 읽는다', () => {
      expect(extractQuoteAuthor(quoteFrame())).toEqual({ handle: 'user_1', displayName: '…' });
      expect(detectBadgeSvg(quoteFrame())).toBe(true);
    });
  });
});
