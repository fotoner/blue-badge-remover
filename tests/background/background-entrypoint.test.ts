import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

describe('background whitelist wiring', () => {
  it('화이트리스트 요청을 백그라운드 직렬화 핸들러로 전달한다', () => {
    const source = readFileSync(resolve(process.cwd(), 'entrypoints/background.ts'), 'utf8');

    expect(source).toContain("import { handleWhitelistRequest } from '@features/settings/whitelist-storage'");
    expect(source).toContain('if (type === MESSAGE_TYPES.WHITELIST) return handleWhitelistRequest(message)');
  });
});

describe('background language wiring', () => {
  it('새로 설치할 때만 브라우저 언어를 저장한다', () => {
    const source = readFileSync(resolve(process.cwd(), 'entrypoints/background.ts'), 'utf8');

    expect(source).toContain("if (details.reason === 'install') void welcomeOnInstall()");
    expect(source).not.toContain('keepLegacyLanguageOnUpdate');
  });
});

describe('background follow list reset wiring', () => {
  // #70: 오염된 v1 팔로우 데이터를 설치·업데이트 때 지운다 (새 코드는 v2 키만 사용)
  it('설치·업데이트 때 v1 팔로우 데이터를 지운다', () => {
    const source = readFileSync(resolve(process.cwd(), 'entrypoints/background.ts'), 'utf8');

    expect(source).toContain("import { removeLegacyFollowData } from '@features/settings/follow-list-reset'");
    expect(source).toContain("if (details.reason === 'install' || details.reason === 'update') void removeLegacyFollowData()");
  });
});

describe('background popup source tab wiring', () => {
  // #121: Firefox Android는 팝업을 탭으로 열어 활성 탭이 팝업 자신이 된다 — 클릭한 탭 ID를 넘긴다
  it('Firefox Android 아이콘 클릭 때 클릭한 탭 ID를 팝업 주소에 싣는다', () => {
    const source = readFileSync(resolve(process.cwd(), 'entrypoints/background.ts'), 'utf8');

    expect(source).toContain("import { buildPopupUrl } from '@shared/utils/popup-source-tab'");
    expect(source).toContain('actionApi.onClicked.addListener((tab) =>');
    expect(source).toContain("buildPopupUrl(browser.runtime.getURL('/popup.html'), tab?.id)");
  });
});

describe('background welcome page wiring', () => {
  // #121: 설치 직후 감사·안내 페이지를 새 탭으로 연다. 이미 열린 X 탭에 코드를 넣지 않는다(scripting 권한 없음)
  it('새로 설치할 때만 환영 페이지를 연다', () => {
    const source = readFileSync(resolve(process.cwd(), 'entrypoints/background.ts'), 'utf8');

    expect(source).toContain("browser.tabs.create({ url: browser.runtime.getURL('/welcome.html') })");
    expect(source).not.toContain('executeScript');
  });

  it('언어를 저장한 뒤에 환영 페이지를 연다', () => {
    const source = readFileSync(resolve(process.cwd(), 'entrypoints/background.ts'), 'utf8');

    expect(source.indexOf('await initLanguageOnInstall()')).toBeLessThan(source.indexOf("getURL('/welcome.html')"));
  });
});
