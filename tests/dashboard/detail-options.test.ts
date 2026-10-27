import { beforeEach, describe, expect, it, vi } from 'vitest';
import { DEFAULT_SETTINGS } from '../../src/shared/constants';

vi.mock('wxt/browser', () => ({
  browser: {
    storage: { local: { get: vi.fn(async () => ({})) }, onChanged: { addListener: vi.fn() } },
    tabs: { create: vi.fn() },
    runtime: { getURL: (path: string) => path },
  },
}));

const { renderSettingsToDOM, syncDetailOptions } = await import('../../src/dashboard/settings-section');

const SETTINGS_DOM = `
  <input type="checkbox" id="filter-timeline"><input type="checkbox" id="filter-replies">
  <div id="detail-options">
    <input type="checkbox" id="showAuthorThread"><input type="checkbox" id="collapseOnDetail">
  </div>
  <input type="checkbox" id="filter-search"><input type="checkbox" id="filter-bookmarks"><input type="checkbox" id="filter-lists">
  <input type="checkbox" id="retweetFilter"><input type="checkbox" id="debugMode">
  <input type="checkbox" id="keywordFilterEnabled"><input type="checkbox" id="keywordCollectorEnabled">
  <input type="checkbox" id="defaultFilterEnabled"><input type="checkbox" id="milestoneBannerEnabled">
  <input type="checkbox" id="aggressorFilterEnabled">
  <select id="language"><option value="ko">ko</option></select>
`;

function input(id: string): HTMLInputElement {
  return document.getElementById(id) as HTMLInputElement;
}

beforeEach(() => {
  document.body.innerHTML = SETTINGS_DOM;
});

// #94: "트윗 상세 / 답글" 아래 하위 토글 — 글쓴이 타래 보기, 상세에서 접어 두기
describe('트윗 상세 하위 토글', () => {
  it('저장된 값을 그린다', () => {
    renderSettingsToDOM({ ...DEFAULT_SETTINGS, showAuthorThread: false, collapseOnDetail: true });
    expect(input('showAuthorThread').checked).toBe(false);
    expect(input('collapseOnDetail').checked).toBe(true);
  });

  it('"트윗 상세 / 답글"이 꺼져 있으면 하위 토글을 비활성으로 둔다', () => {
    renderSettingsToDOM({ ...DEFAULT_SETTINGS, filter: { ...DEFAULT_SETTINGS.filter, replies: false } });
    expect(input('showAuthorThread').disabled).toBe(true);
    expect(input('collapseOnDetail').disabled).toBe(true);
    expect(document.getElementById('detail-options')?.classList.contains('is-disabled')).toBe(true);
  });

  it('"트윗 상세 / 답글"을 다시 켜면 하위 토글을 활성으로 되돌린다', () => {
    renderSettingsToDOM({ ...DEFAULT_SETTINGS, filter: { ...DEFAULT_SETTINGS.filter, replies: false } });
    input('filter-replies').checked = true;
    syncDetailOptions();
    expect(input('showAuthorThread').disabled).toBe(false);
    expect(document.getElementById('detail-options')?.classList.contains('is-disabled')).toBe(false);
  });

  it('기본값은 둘 다 켜짐이다', () => {
    expect(DEFAULT_SETTINGS.showAuthorThread).toBe(true);
    expect(DEFAULT_SETTINGS.collapseOnDetail).toBe(true);
  });
});
