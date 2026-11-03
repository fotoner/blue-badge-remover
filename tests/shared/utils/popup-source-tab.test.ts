import { describe, expect, it } from 'vitest';
import { buildPopupUrl, parseSourceTabId } from '@shared/utils/popup-source-tab';

describe('parseSourceTabId', () => {
  it('쿼리의 sourceTabId를 숫자로 읽는다', () => {
    expect(parseSourceTabId('?sourceTabId=42')).toBe(42);
  });

  it.each(['', '?', '?sourceTabId=', '?sourceTabId=abc', '?sourceTabId=-1', '?sourceTabId=1.5', '?other=3'])(
    '없거나 올바른 탭 ID가 아니면 undefined이다: %s',
    (search) => {
      expect(parseSourceTabId(search)).toBeUndefined();
    },
  );
});

describe('buildPopupUrl', () => {
  const base = 'moz-extension://abc/popup.html';

  it('클릭한 탭 ID를 sourceTabId 쿼리로 붙인다', () => {
    expect(buildPopupUrl(base, 7)).toBe(`${base}?sourceTabId=7`);
  });

  it('탭 ID가 없으면 주소를 그대로 둔다', () => {
    expect(buildPopupUrl(base, undefined)).toBe(base);
  });

  it('만든 주소는 parseSourceTabId로 되읽힌다', () => {
    const url = new URL(buildPopupUrl(base, 123));
    expect(parseSourceTabId(url.search)).toBe(123);
  });
});
