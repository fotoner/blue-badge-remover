import { describe, it, expect, beforeEach } from 'vitest';
import { JSDOM } from 'jsdom';
import {
  extractTweetAuthor,
  extractRetweeterName,
  extractRetweeterHandle,
  findQuoteBlock,
  extractQuoteAuthor,
  extractTweetText,
  extractDisplayName,
  findAuthorBadge,
  formatUserLabel,
} from '../../src/content/tweet-processing';
import { isBlueBadgeElement } from '@features/badge-detection/svg-fallback';

let doc: Document;

function html(template: string): HTMLElement {
  const div = doc.createElement('div');
  div.innerHTML = template.trim();
  return div.firstElementChild as HTMLElement;
}

beforeEach(() => {
  doc = new JSDOM('<!DOCTYPE html><body></body>').window.document;
});

// --- extractTweetAuthor ---

describe('extractTweetAuthor', () => {
  it('일반 트윗에서 핸들 추출', () => {
    const el = html(`
      <article data-testid="tweet">
        <a role="link" href="/test_user">@test_user</a>
        <div data-testid="tweetText">내용</div>
      </article>
    `);
    const result = extractTweetAuthor(el);
    expect(result).toEqual({ handle: 'test_user' });
  });

  it('리트윗 표시 링크는 건너뜀', () => {
    const el = html(`
      <article data-testid="tweet">
        <a role="link" href="/retweeter">재게시함</a>
        <a role="link" href="/original_author">@original_author</a>
      </article>
    `);
    const result = extractTweetAuthor(el);
    expect(result?.handle).toBe('original_author');
  });

  it('영문 Retweeted도 건너뜀', () => {
    const el = html(`
      <article data-testid="tweet">
        <a role="link" href="/someone">Retweeted</a>
        <a role="link" href="/real_user">@real_user</a>
      </article>
    `);
    expect(extractTweetAuthor(el)?.handle).toBe('real_user');
  });

  it('/status/ 링크는 무시', () => {
    const el = html(`
      <article data-testid="tweet">
        <a role="link" href="/user/status/123">트윗 링크</a>
        <a role="link" href="/actual_user">@actual_user</a>
      </article>
    `);
    expect(extractTweetAuthor(el)?.handle).toBe('actual_user');
  });

  it('/photo/ 링크는 무시', () => {
    const el = html(`
      <article data-testid="tweet">
        <a role="link" href="/user/photo/1">사진</a>
        <a role="link" href="/photo_user">@photo_user</a>
      </article>
    `);
    expect(extractTweetAuthor(el)?.handle).toBe('photo_user');
  });

  it('/i/ 경로 무시', () => {
    const el = html(`
      <article data-testid="tweet">
        <a role="link" href="/i/premium_sign_up">프리미엄</a>
        <a role="link" href="/my_user">@my_user</a>
      </article>
    `);
    expect(extractTweetAuthor(el)?.handle).toBe('my_user');
  });

  it('hashtag 경로 무시', () => {
    const el = html(`
      <article data-testid="tweet">
        <a role="link" href="/hashtag/test">#test</a>
        <a role="link" href="/hash_user">@hash_user</a>
      </article>
    `);
    expect(extractTweetAuthor(el)?.handle).toBe('hash_user');
  });

  it('링크가 없으면 null', () => {
    const el = html(`<article data-testid="tweet"><div>텍스트만</div></article>`);
    expect(extractTweetAuthor(el)).toBeNull();
  });

  it('socialContext 안 링크는 텍스트 로케일과 무관하게 건너뜀 (closest 스코프 스킵)', () => {
    const el = html(`
      <article data-testid="tweet">
        <div data-testid="socialContext">
          <a role="link" href="/retweeter">ユーザーさんがリポスト</a>
        </div>
        <a role="link" href="/original_author">@original_author</a>
      </article>
    `);
    expect(extractTweetAuthor(el)?.handle).toBe('original_author');
  });
});

// --- extractRetweeterName ---

describe('extractRetweeterName', () => {
  it('socialContext에서 리트윗한 사람 이름 추출', () => {
    const el = html(`
      <article>
        <div data-testid="socialContext">
          <a href="/retweeter_handle">리트윗한사람</a> 님이 재게시함
        </div>
      </article>
    `);
    expect(extractRetweeterName(el)).toBe('리트윗한사람');
  });

  it('링크 없이 텍스트만 있는 경우', () => {
    const el = html(`
      <article>
        <div data-testid="socialContext">SomeUser Retweeted</div>
      </article>
    `);
    expect(extractRetweeterName(el)).toBe('SomeUser');
  });

  it('socialContext 없으면 null', () => {
    const el = html(`<article><div>일반 트윗</div></article>`);
    expect(extractRetweeterName(el)).toBeNull();
  });
});

// --- extractRetweeterHandle ---

describe('extractRetweeterHandle', () => {
  it('socialContext 링크 href에서 핸들 추출', () => {
    const el = html(`
      <article>
        <div data-testid="socialContext">
          <a href="/retweeter_handle">리트윗한사람 님이 재게시함</a>
        </div>
      </article>
    `);
    expect(extractRetweeterHandle(el)).toBe('retweeter_handle');
  });

  it('로케일 독립 — 링크 텍스트가 일본어여도 href만으로 추출', () => {
    const el = html(`
      <article>
        <div data-testid="socialContext">
          <a href="/rt_user">ユーザーさんがリポスト</a>
        </div>
      </article>
    `);
    expect(extractRetweeterHandle(el)).toBe('rt_user');
  });

  it('링크 없는 텍스트-only socialContext → null', () => {
    const el = html(`
      <article>
        <div data-testid="socialContext">SomeUser Retweeted</div>
      </article>
    `);
    expect(extractRetweeterHandle(el)).toBeNull();
  });

  it('socialContext 없으면 null', () => {
    const el = html(`<article><div>일반 트윗</div></article>`);
    expect(extractRetweeterHandle(el)).toBeNull();
  });

  it('href가 /i/ 경로면 null (커뮤니티/토픽 링크 가드)', () => {
    const el = html(`
      <article>
        <div data-testid="socialContext">
          <a href="/i/communities/123">커뮤니티</a>
        </div>
      </article>
    `);
    expect(extractRetweeterHandle(el)).toBeNull();
  });
});

// --- findQuoteBlock ---

describe('findQuoteBlock', () => {
  it('한국어 "인용" 레이블로 인용 블록 탐지', () => {
    const el = html(`
      <article>
        <div>
          <span>인용</span>
          <div id="quote-content">인용된 트윗 내용</div>
        </div>
      </article>
    `);
    const quote = findQuoteBlock(el);
    expect(quote).not.toBeNull();
    expect(quote?.id).toBe('quote-content');
  });

  it('영어 "Quote" 레이블로 인용 블록 탐지', () => {
    const el = html(`
      <article>
        <div>
          <span>Quote</span>
          <div id="en-quote">English quoted tweet</div>
        </div>
      </article>
    `);
    const quote = findQuoteBlock(el);
    expect(quote).not.toBeNull();
    expect(quote?.id).toBe('en-quote');
  });

  it('인용 없으면 null', () => {
    const el = html(`<article><div>일반 트윗</div></article>`);
    expect(findQuoteBlock(el)).toBeNull();
  });

  it('한국어가 영어보다 우선', () => {
    const el = html(`
      <article>
        <div>
          <span>인용</span>
          <div id="ko-quote">한국어 인용</div>
        </div>
        <div>
          <span>Quote</span>
          <div id="en-quote">English quote</div>
        </div>
      </article>
    `);
    expect(findQuoteBlock(el)?.id).toBe('ko-quote');
  });
});

// --- extractQuoteAuthor ---

describe('extractQuoteAuthor', () => {
  it('텍스트에서 @핸들 추출', () => {
    const el = html(`<div>표시이름@quoted_handle 인용 내용</div>`);
    const result = extractQuoteAuthor(el);
    expect(result?.handle).toBe('quoted_handle');
    expect(result?.displayName).toBe('표시이름');
  });

  it('@링크에서 핸들 추출', () => {
    const el = html(`<div><a href="/some_user">@some_user</a></div>`);
    const result = extractQuoteAuthor(el);
    expect(result?.handle).toBe('some_user');
  });

  it('일반 링크 href에서 핸들 추출 (마지막 폴백)', () => {
    const el = html(`<div><a href="/fallback_user">표시이름</a></div>`);
    const result = extractQuoteAuthor(el);
    expect(result?.handle).toBe('fallback_user');
  });

  it('status 링크는 무시', () => {
    const el = html(`<div><a href="/user/status/123">트윗 링크</a></div>`);
    expect(extractQuoteAuthor(el)).toBeNull();
  });

  it('빈 블록이면 null', () => {
    const el = html(`<div></div>`);
    expect(extractQuoteAuthor(el)).toBeNull();
  });
});

// --- extractTweetText ---

describe('extractTweetText', () => {
  it('tweetText에서 본문 추출', () => {
    const el = html(`
      <article>
        <div data-testid="tweetText">이것은 트윗 내용입니다</div>
      </article>
    `);
    expect(extractTweetText(el)).toBe('이것은 트윗 내용입니다');
  });

  it('tweetText 없으면 빈 문자열', () => {
    const el = html(`<article><div>다른 내용</div></article>`);
    expect(extractTweetText(el)).toBe('');
  });
});

// --- extractDisplayName ---

describe('extractDisplayName', () => {
  it('핸들과 일치하는 링크에서 표시 이름 추출', () => {
    const el = html(`
      <article>
        <a role="link" href="/test_user">표시이름</a>
        <a role="link" href="/test_user">@test_user</a>
      </article>
    `);
    expect(extractDisplayName(el, 'test_user')).toBe('표시이름');
  });

  it('@로 시작하는 텍스트는 표시 이름이 아님', () => {
    const el = html(`
      <article>
        <a role="link" href="/test_user">@test_user</a>
      </article>
    `);
    expect(extractDisplayName(el, 'test_user')).toBeNull();
  });

  it('리트윗 텍스트 포함 링크는 무시', () => {
    const el = html(`
      <article>
        <a role="link" href="/someone">재게시함</a>
        <a role="link" href="/someone">표시이름</a>
      </article>
    `);
    expect(extractDisplayName(el, 'someone')).toBe('표시이름');
  });

  it('"비공개 계정" 접미사 제거', () => {
    const el = html(`
      <article>
        <a role="link" href="/private_user">비밀유저 비공개 계정</a>
      </article>
    `);
    expect(extractDisplayName(el, 'private_user')).toBe('비밀유저');
  });

  it('해당 핸들 링크 없으면 null', () => {
    const el = html(`
      <article>
        <a role="link" href="/other_user">다른사람</a>
      </article>
    `);
    expect(extractDisplayName(el, 'test_user')).toBeNull();
  });

  it('socialContext 안 링크는 표시 이름 후보에서 제외 (로케일 독립)', () => {
    const el = html(`
      <article>
        <div data-testid="socialContext">
          <a role="link" href="/someone">ユーザーさんがリポスト</a>
        </div>
        <a role="link" href="/someone">표시이름</a>
      </article>
    `);
    expect(extractDisplayName(el, 'someone')).toBe('표시이름');
  });
});

// --- findAuthorBadge ---

describe('findAuthorBadge', () => {
  it('외부 User-Name에 뱃지 → 해당 뱃지 요소 반환', () => {
    const el = html(`
      <article>
        <div data-testid="User-Name">
          <span>유저</span>
          <svg data-testid="icon-verified" id="outer-badge"><g><path d="M1 1Z"></path></g></svg>
        </div>
      </article>
    `);
    expect(findAuthorBadge(el)).toBe(el.querySelector('#outer-badge'));
  });

  it('뱃지가 인용 카드 안에만 있으면 null', () => {
    const el = html(`
      <article>
        <div data-testid="User-Name"><span>작성자</span></div>
        <div>
          <span>인용</span>
          <div>
            <div data-testid="User-Name">
              <svg data-testid="icon-verified"><g><path d="M1 1Z"></path></g></svg>
            </div>
          </div>
        </div>
      </article>
    `);
    expect(findAuthorBadge(el)).toBeNull();
  });

  it('User-Name이 전혀 없으면 전체 폴백으로 뱃지 반환', () => {
    const el = html(`
      <article>
        <svg data-testid="icon-verified"></svg>
      </article>
    `);
    expect(findAuthorBadge(el)).toBe(el.querySelector('[data-testid="icon-verified"]'));
  });

  it('User-Name이 인용 카드 안에만 있으면 null — 전체 폴백 발동 금지', () => {
    const el = html(`
      <article>
        <div>
          <span>인용</span>
          <div>
            <div data-testid="User-Name">
              <svg data-testid="icon-verified"><g><path d="M1 1Z"></path></g></svg>
            </div>
          </div>
        </div>
      </article>
    `);
    expect(findAuthorBadge(el)).toBeNull();
  });

  it('외부 User-Name에 뱃지 없고 인용도 없으면 null', () => {
    const el = html(`
      <article>
        <div data-testid="User-Name"><span>유저</span></div>
      </article>
    `);
    expect(findAuthorBadge(el)).toBeNull();
  });

  it('User-Name이 전혀 없고 뱃지가 인용 카드 안에만 있으면 null (전체 폴백이 인용 카드를 오귀속하지 않음)', () => {
    const el = html(`
      <article>
        <div>
          <span>인용</span>
          <div id="quote-content">
            <svg data-testid="icon-verified"><g><path d="M1 1Z"></path></g></svg>
          </div>
        </div>
      </article>
    `);
    expect(findAuthorBadge(el)).toBeNull();
  });

  it('User-Name이 전혀 없고 뱃지가 인용 카드 밖에 있으면 해당 뱃지 반환', () => {
    const el = html(`
      <article>
        <svg data-testid="icon-verified" id="outer-badge"></svg>
        <div>
          <span>인용</span>
          <div id="quote-content">텍스트만</div>
        </div>
      </article>
    `);
    expect(findAuthorBadge(el)).toBe(el.querySelector('#outer-badge'));
  });
});

// --- isBlueBadgeElement (element-level 판정) ---
// 원래 svg-fallback.test.ts 소속이 자연스러우나 해당 파일은 이 변경의 범위 밖이라 여기서 검증.

function blueBadgeSvg(): string {
  return `<svg viewBox="0 0 22 22" data-testid="icon-verified">
    <g><path d="M20.396 11c-.018-.137-.065-.27-.148-.385Z"></path></g>
  </svg>`;
}

function goldBadgeSvg(): string {
  return `<svg viewBox="0 0 22 22" data-testid="icon-verified">
    <g>
      <linearGradient id="grad1"><stop offset="0" stop-color="#f4e72a"></stop><stop offset=".539" stop-color="#cd8105"></stop></linearGradient>
      <linearGradient id="grad2"><stop offset="0" stop-color="#f9e87f"></stop><stop offset=".539" stop-color="#e2b719"></stop></linearGradient>
      <path fill="url(#grad1)" d="M20.396 11Z"></path>
      <path fill="url(#grad2)" d="M11 1Z"></path>
      <path fill="#d18800" d="M13 3Z"></path>
    </g>
  </svg>`;
}

function greyBadgeSvg(): string {
  return `<svg viewBox="0 0 22 22" data-testid="icon-verified">
    <g>
      <linearGradient id="g1"><stop offset="0" stop-color="#829aab"></stop></linearGradient>
      <linearGradient id="g2"><stop offset="0" stop-color="#829aab"></stop></linearGradient>
      <path fill="url(#g1)" d="M20.396 11Z"></path>
      <path fill="url(#g2)" d="M11 1Z"></path>
      <path fill="#829aab" d="M13 3Z"></path>
    </g>
  </svg>`;
}

describe('isBlueBadgeElement', () => {
  function badgeFrom(markup: string): Element {
    const wrap = doc.createElement('div');
    wrap.innerHTML = markup;
    const badge = wrap.querySelector('[data-testid="icon-verified"]');
    expect(badge).not.toBeNull();
    return badge as Element;
  }

  it('파딱 svg 요소 → true', () => {
    expect(isBlueBadgeElement(badgeFrom(blueBadgeSvg()))).toBe(true);
  });

  it('금딱 svg 요소 → false', () => {
    expect(isBlueBadgeElement(badgeFrom(goldBadgeSvg()))).toBe(false);
  });

  it('회딱 svg 요소 → false', () => {
    expect(isBlueBadgeElement(badgeFrom(greyBadgeSvg()))).toBe(false);
  });

  it('data-testid가 내부 <g>에 있어도 closest(svg)로 판정 → true', () => {
    const markup = `<svg viewBox="0 0 22 22">
      <g data-testid="icon-verified"><path d="M20.396 11Z"></path></g>
    </svg>`;
    expect(isBlueBadgeElement(badgeFrom(markup))).toBe(true);
  });

  it('path에 fill 속성 있으면 false', () => {
    const markup = `<svg viewBox="0 0 22 22" data-testid="icon-verified">
      <g><path fill="#E8B829" d="M20 11Z"></path></g>
    </svg>`;
    expect(isBlueBadgeElement(badgeFrom(markup))).toBe(false);
  });

  it('path 0개(부분 렌더링)면 false', () => {
    const markup = `<svg viewBox="0 0 22 22" data-testid="icon-verified"><g></g></svg>`;
    expect(isBlueBadgeElement(badgeFrom(markup))).toBe(false);
  });
});

// --- findAuthorBadge + isBlueBadgeElement 통합 ---

describe('findAuthorBadge + isBlueBadgeElement 통합', () => {
  it('외부 User-Name의 파딱 뱃지 → 발견 + true', () => {
    const el = html(`
      <article>
        <div data-testid="User-Name">
          <span>유저</span>
          ${blueBadgeSvg()}
        </div>
      </article>
    `);
    const badge = findAuthorBadge(el);
    expect(badge).not.toBeNull();
    expect(isBlueBadgeElement(badge as Element)).toBe(true);
  });

  it('외부 User-Name의 금딱 뱃지 → 발견되지만 false', () => {
    const el = html(`
      <article>
        <div data-testid="User-Name">
          <span>유저</span>
          ${goldBadgeSvg()}
        </div>
      </article>
    `);
    const badge = findAuthorBadge(el);
    expect(badge).not.toBeNull();
    expect(isBlueBadgeElement(badge as Element)).toBe(false);
  });
});

// --- formatUserLabel ---

describe('formatUserLabel', () => {
  it('displayName 있으면 "이름(@핸들)" 형식', () => {
    expect(formatUserLabel('user', '유저이름')).toBe('유저이름(@user)');
  });

  it('displayName 없으면 "@핸들" 형식', () => {
    expect(formatUserLabel('user', null)).toBe('@user');
  });
});
