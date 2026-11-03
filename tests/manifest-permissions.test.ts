import { describe, expect, it } from 'vitest';
import { manifestFor } from './fixtures/manifest';

// 설치·업데이트 직후 이미 열린 X 탭에 새로고침 안내를 넣으려면 scripting이 필요하다 (#121).
// Firefox는 열린 탭에 content script를 다시 넣어 주므로 권한을 늘리지 않는다
describe('매니페스트 권한', () => {
  it.each(['chrome', 'edge'] as const)('%s 빌드는 scripting을 요청한다', async (browser) => {
    expect((await manifestFor(browser)).permissions).toEqual(['storage', 'unlimitedStorage', 'scripting']);
  });

  it('Firefox 빌드는 권한이 그대로다', async () => {
    expect((await manifestFor('firefox')).permissions).toEqual(['storage', 'unlimitedStorage']);
  });
});
