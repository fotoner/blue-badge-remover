import { beforeEach, describe, expect, it } from 'vitest';
import {
  applyTranslations,
  detectLanguage,
  getTranslations,
  interpolate,
  setPageLanguage,
  t,
  tp,
  translateCategoryName,
  type Language,
} from '@shared/i18n';
import { DEFAULT_FILTER_LIST, parseCategories } from '@features/keyword-filter';

const HANGUL = /[ㄱ-ㆎ가-힣]/;

// 기본 언어가 브라우저와 무관하게 한국어여서 영어권 사용자도 한국어 UI로 시작하던 문제
describe('detectLanguage', () => {
  it.each([
    ['ko', 'ko'],
    ['ko-KR', 'ko'],
    ['ja', 'ja'],
    ['ja-JP', 'ja'],
    ['en-US', 'en'],
    ['en', 'en'],
    ['de-DE', 'en'],
    ['zh-CN', 'en'],
    ['', 'en'],
    [undefined, 'en'],
  ] as const)('%s → %s', (uiLanguage, expected) => {
    expect(detectLanguage(uiLanguage)).toBe(expected);
  });
});

describe('번역 사전', () => {
  it('한국어 사전의 모든 키가 영어/일본어에도 있고, 영어/일본어에는 한글이 없다', () => {
    const ko = getTranslations('ko');
    for (const lang of ['en', 'ja'] as Language[]) {
      const dict = getTranslations(lang);
      for (const key of Object.keys(ko)) {
        const text = dict[key as keyof typeof dict];
        expect(text, `${lang}:${key}`).toBeTruthy();
        expect(HANGUL.test(text), `${lang}:${key} = ${text}`).toBe(false);
      }
    }
  });
});

describe('applyTranslations', () => {
  beforeEach(() => {
    document.head.innerHTML = '<title data-i18n="optionsPageTitle">고급 필터 설정</title>';
    document.body.innerHTML = `
      <span id="label" data-i18n="whitelist">화이트리스트</span>
      <input id="input" data-i18n-placeholder="whitelistPlaceholder" placeholder="한국어">
      <textarea id="area" data-i18n-placeholder="customFilterPlaceholder" placeholder="한국어"></textarea>`;
  });

  it('텍스트, input/textarea placeholder, 제목, html lang을 선택 언어로 바꾼다', () => {
    applyTranslations('en');
    expect(document.getElementById('label')!.textContent).toBe(t('whitelist', 'en'));
    expect((document.getElementById('input') as HTMLInputElement).placeholder).toBe(t('whitelistPlaceholder', 'en'));
    expect((document.getElementById('area') as HTMLTextAreaElement).placeholder).toBe(t('customFilterPlaceholder', 'en'));
    expect(document.title).toBe(t('optionsPageTitle', 'en'));
    expect(document.documentElement.lang).toBe('en');
  });
});

describe('tp (페이지 언어 번역)', () => {
  it('setPageLanguage로 정한 언어로 번역하고 파라미터를 치환한다', () => {
    setPageLanguage('ja');
    expect(tp('whitelistCount', { count: '2' })).toBe(t('whitelistCount', 'ja', { count: '2' }));
    setPageLanguage('en');
    expect(tp('whitelist')).toBe('Whitelist');
  });
});

// 내장 필터 카테고리 이름은 저장 키(비활성 목록)로도 쓰이므로 원문은 그대로 두고 표시만 번역한다
describe('translateCategoryName', () => {
  const names = parseCategories(DEFAULT_FILTER_LIST).map((category) => category.name);

  it('내장 필터의 모든 카테고리가 영어/일본어 표시 이름을 가진다', () => {
    for (const lang of ['en', 'ja'] as Language[]) {
      for (const name of names) {
        const label = translateCategoryName(name, lang);
        expect(HANGUL.test(label), `${lang}:${name} = ${label}`).toBe(false);
      }
    }
  });

  it('한국어는 원래 이름을, 모르는 이름은 그대로 보여준다', () => {
    expect(translateCategoryName(names[0]!, 'ko')).toBe(names[0]);
    expect(translateCategoryName('사용자 정의', 'en')).toBe('사용자 정의');
  });
});

describe('interpolate', () => {
  it('같은 자리표시자가 여러 번 나와도 모두 바꾼다', () => {
    expect(interpolate('{count} / {count}', { count: '3' })).toBe('3 / 3');
  });

  it('값 안의 {이름}은 다시 치환하지 않는다', () => {
    expect(interpolate('"{keyword}" · {count}', { keyword: '{count}', count: '5' })).toBe('"{count}" · 5');
  });

  it('값이 없는 자리표시자는 그대로 둔다', () => {
    expect(interpolate('{a} {b}', { a: '1' })).toBe('1 {b}');
  });
});
