import { describe, expect, it } from 'vitest';
import { manifestFor } from './fixtures/manifest';

// 설치 직후 안내는 확장 페이지를 새 탭으로 열어 한다 — 이미 열린 X 탭에 코드를 넣지 않으므로 scripting을 요청하지 않는다 (#121)
describe('매니페스트 권한', () => {
  it.each(['chrome', 'edge', 'firefox'] as const)('%s 빌드는 storage·unlimitedStorage만 요청한다', async (browser) => {
    expect((await manifestFor(browser)).permissions).toEqual(['storage', 'unlimitedStorage']);
  });
});
