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
