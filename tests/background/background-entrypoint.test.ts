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

    expect(source).toContain("if (details.reason === 'install') void initLanguageOnInstall()");
    expect(source).not.toContain('keepLegacyLanguageOnUpdate');
  });
});

describe('background follow list reset wiring', () => {
  // #70: 오염된 팔로우 목록을 업데이트 때 한 번 비운다 (새 설치에도 표식만 남김)
  it('설치·업데이트 때 팔로우 목록 초기화를 한 번 시도한다', () => {
    const source = readFileSync(resolve(process.cwd(), 'entrypoints/background.ts'), 'utf8');

    expect(source).toContain("import { resetPollutedFollowListOnce } from '@features/settings/follow-list-reset'");
    expect(source).toContain("if (details.reason === 'install' || details.reason === 'update') void resetPollutedFollowListOnce()");
  });
});
