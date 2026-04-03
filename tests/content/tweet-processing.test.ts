import { describe, it, expect, beforeEach } from 'vitest';
import { JSDOM } from 'jsdom';
import {
  extractTweetAuthor,
  extractRetweeterName,
  findQuoteBlock,
  extractQuoteAuthor,
  extractTweetText,
  extractDisplayName,
  hasBadgeInAuthorArea,
  formatUserLabel,
} from '../../src/content/tweet-processing';

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
    expect(result).toEqual({ handle: 'test_user', userId: 'test_user' });
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
});

// --- hasBadgeInAuthorArea ---

describe('hasBadgeInAuthorArea', () => {
  it('User-Name 영역에 뱃지 있으면 true', () => {
    const el = html(`
      <article>
        <div data-testid="User-Name">
          <span>유저</span>
          <svg data-testid="icon-verified"></svg>
        </div>
      </article>
    `);
    expect(hasBadgeInAuthorArea(el)).toBe(true);
  });

  it('뱃지 없으면 false', () => {
    const el = html(`
      <article>
        <div data-testid="User-Name"><span>유저</span></div>
      </article>
    `);
    expect(hasBadgeInAuthorArea(el)).toBe(false);
  });

  it('User-Name 없어도 article 전체에서 탐색', () => {
    const el = html(`
      <article>
        <svg data-testid="icon-verified"></svg>
      </article>
    `);
    expect(hasBadgeInAuthorArea(el)).toBe(true);
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
