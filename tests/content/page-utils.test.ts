// tests/content/page-utils.test.ts
import { describe, it, expect, beforeEach } from 'vitest';
import { isProfilePage, getPageType, getAccountHandleFromDOM, getAccountHandle, getDetailAuthorHandle, isXwebDocument } from '../../src/content/page-utils';
import { setViewerHandleHint } from '../../src/content/state';

function setPath(path: string): void {
  Object.defineProperty(window, 'location', {
    value: { ...window.location, pathname: path },
    writable: true,
    configurable: true,
  });
}

describe('isProfilePage', () => {
  beforeEach(() => {
    setPath('/');
  });

  it('should return false for root path', () => {
    setPath('/');
    expect(isProfilePage()).toBe(false);
  });

  it('should return true for /{handle} profile path', () => {
    setPath('/elonmusk');
    expect(isProfilePage()).toBe(true);
  });

  it('should return true for /{handle}/with_replies', () => {
    setPath('/elonmusk/with_replies');
    expect(isProfilePage()).toBe(true);
  });

  it('should return true for /{handle}/likes', () => {
    setPath('/someuser/likes');
    expect(isProfilePage()).toBe(true);
  });

  it.each([
    '/home',
    '/explore',
    '/search',
    '/notifications',
    '/messages',
    '/i/flow/login',
    '/settings',
    '/compose/tweet',
  ])('should return false for reserved path: %s', (path) => {
    setPath(path);
    expect(isProfilePage()).toBe(false);
  });

  it('should return false for /status/ paths (tweet detail)', () => {
    setPath('/elonmusk/status/123456789');
    expect(isProfilePage()).toBe(false);
  });

  it('should return false for /following paths', () => {
    setPath('/elonmusk/following');
    expect(isProfilePage()).toBe(false);
  });

  it('should return false for /followers paths', () => {
    setPath('/elonmusk/followers');
    expect(isProfilePage()).toBe(false);
  });

  it.each(['/i/history', '/i/history/likes'])('should return false for history page: %s', (path) => {
    setPath(path);
    expect(isProfilePage()).toBe(false);
  });
});

describe('getPageType', () => {
  beforeEach(() => {
    setPath('/');
  });

  it('should return timeline for home page', () => {
    setPath('/home');
    expect(getPageType()).toBe('timeline');
  });

  it('should return timeline for root', () => {
    setPath('/');
    expect(getPageType()).toBe('timeline');
  });

  it('should return search for search page', () => {
    setPath('/search');
    expect(getPageType()).toBe('search');
  });

  // 리뷰: search로 시작하는 핸들(searchfan 등)의 상세가 검색으로 판정되던 문제 (#94)
  it.each([
    ['/searchfan/status/200', 'replies'],
    ['/searchfan/status/200/photo/1', 'replies'],
    ['/search', 'search'],
    ['/i/lists/123', 'lists'],
  ] as const)('%s → %s', (path, expected) => {
    setPath(path);
    expect(getPageType()).toBe(expected);
  });

  it('should return replies for status page', () => {
    setPath('/user/status/123456');
    expect(getPageType()).toBe('replies');
  });

  it('should return bookmarks for /i/bookmarks', () => {
    setPath('/i/bookmarks');
    expect(getPageType()).toBe('bookmarks');
  });

  it('should return bookmarks for /i/bookmarks/folders subpath', () => {
    setPath('/i/bookmarks/folders/123');
    expect(getPageType()).toBe('bookmarks');
  });

  // X가 북마크·마음에 들어요를 /i/history(히스토리) 탭으로 옮김
  it('should return bookmarks for /i/history (bookmarks tab)', () => {
    setPath('/i/history');
    expect(getPageType()).toBe('bookmarks');
  });

  it('should return bookmarks for /i/history/likes (likes tab)', () => {
    setPath('/i/history/likes');
    expect(getPageType()).toBe('bookmarks');
  });

  it.each(['/i/historyfan', '/i/bookmarksx', '/someone/i/history'])('should not treat %s as bookmarks (path must start with the exact segments)', (path) => {
    setPath(path);
    expect(getPageType()).toBe('timeline');
  });

  it('should return timeline for user profile', () => {
    setPath('/fotoner');
    expect(getPageType()).toBe('timeline');
  });
});

describe('getAccountHandleFromDOM', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
  });

  function addProfileLink(href: string): void {
    document.body.insertAdjacentHTML('beforeend', `<a data-testid="AppTabBar_Profile_Link" href="${href}"></a>`);
  }

  // 2026-10: 사이드바에서 프로필 링크가 빠지고 계정 전환 버튼 아바타에만 핸들이 남았다 (Aside 실측)
  function addAccountSwitcher(handle: string): void {
    document.body.insertAdjacentHTML('beforeend', `
      <button data-testid="SideNav_AccountSwitcher_Button">
        <div data-testid="UserAvatar-Container-${handle}"></div>
      </button>
    `);
  }

  it('프로필 링크가 있으면 그 핸들을 소문자로 반환한다', () => {
    addProfileLink('/MyHandle');
    expect(getAccountHandleFromDOM()).toBe('myhandle');
  });

  it('프로필 링크가 없으면 계정 전환 버튼 아바타에서 읽는다', () => {
    addAccountSwitcher('Temi_Illust');
    expect(getAccountHandleFromDOM()).toBe('temi_illust');
  });

  it('계정 전환 버튼 밖(트윗 등)의 아바타는 본인으로 보지 않는다', () => {
    document.body.innerHTML = '<article><div data-testid="UserAvatar-Container-someone"></div></article>';
    expect(getAccountHandleFromDOM()).toBeNull();
  });

  it('핸들 형식이 아닌 값은 버리고 다음 출처를 본다', () => {
    addProfileLink('/i/flow/login');
    addAccountSwitcher('temi_illust');
    expect(getAccountHandleFromDOM()).toBe('temi_illust');
  });
});

// xweb에는 계정 전환 버튼·프로필 링크가 없다. DOM에서 못 찾을 때만, xweb 문서에서만 초기 데이터의 viewerScreenName 힌트를 쓴다 (#142)
const XWEB_SCRIPT = 'https://abs.twimg.com/x-web/x-web/entry-client.0123abcd.js';
const RWEB_SCRIPT = 'https://abs.twimg.com/responsive-web/client-web/main.0123abcd.js';

function setHeadScripts(...sources: string[]): void {
  document.head.innerHTML = sources.map((src) => `<script src="${src}"></script>`).join('');
}

describe('isXwebDocument', () => {
  beforeEach(() => { document.head.innerHTML = ''; });

  it('xweb 스크립트(abs.twimg.com/x-web/x-web/entry-client)가 있으면 true', () => {
    setHeadScripts(XWEB_SCRIPT);

    expect(isXwebDocument()).toBe(true);
  });

  it('rweb 스크립트만 있으면 false', () => {
    setHeadScripts(RWEB_SCRIPT);

    expect(isXwebDocument()).toBe(false);
  });

  it('스크립트가 없으면 false', () => {
    expect(isXwebDocument()).toBe(false);
  });

  it('다른 호스트가 같은 경로를 흉내 내도 false', () => {
    setHeadScripts('https://evil.example/abs.twimg.com/x-web/x-web/entry-client.js');

    expect(isXwebDocument()).toBe(false);
  });
});

describe('getAccountHandle', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
    setHeadScripts(XWEB_SCRIPT);
    setViewerHandleHint(null);
  });

  it('DOM에서 계정을 찾으면 힌트보다 DOM을 따른다', () => {
    document.body.innerHTML = '<a data-testid="AppTabBar_Profile_Link" href="/DomHandle"></a>';
    setViewerHandleHint('hint_handle');

    expect(getAccountHandle()).toBe('domhandle');
  });

  it('xweb 문서에서 DOM에서 못 찾으면 힌트를 소문자로 쓴다', () => {
    setViewerHandleHint('hint_handle');

    expect(getAccountHandle()).toBe('hint_handle');
  });

  it('xweb 문서가 아니면 힌트가 있어도 쓰지 않는다 (rweb은 DOM에서만 판정)', () => {
    setHeadScripts(RWEB_SCRIPT);
    setViewerHandleHint('hint_handle');

    expect(getAccountHandle()).toBeNull();
  });

  it('DOM도 힌트도 없으면 null이다', () => {
    expect(getAccountHandle()).toBeNull();
  });
});

// 상세 페이지에서 연 트윗의 작성자 — 그 작성자의 루트·타래 트윗은 숨기지 않는다 (#94)
describe('getDetailAuthorHandle', () => {
  it.each([
    ['/Author_A/status/123', 'author_a'],
    ['/author_a/status/123/photo/1', 'author_a'],
  ])('%s → %s', (path, expected) => {
    setPath(path);
    expect(getDetailAuthorHandle()).toBe(expected);
  });

  it.each(['/i/status/123', '/i/web/status/123', '/home', '/author_a', '/search', '/author_a/likes'])('%s → null', (path) => {
    setPath(path);
    expect(getDetailAuthorHandle()).toBeNull();
  });
});
