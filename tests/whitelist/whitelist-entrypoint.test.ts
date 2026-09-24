import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const whitelistHtml = readFileSync(
  resolve(process.cwd(), 'entrypoints/whitelist/index.html'),
  'utf8',
);

describe('whitelist entrypoint', () => {
  it('실제 빌드 화면의 입력란은 여러 줄 일괄 등록을 위한 textarea다', () => {
    expect(whitelistHtml).toMatch(/<textarea[^>]*id="whitelist-input"/);
    expect(whitelistHtml).not.toMatch(/<input[^>]*id="whitelist-input"/);
  });

  it('실제 빌드 화면의 등록 목록은 접을 수 있다', () => {
    expect(whitelistHtml).toMatch(/<details[^>]*class="[^"]*whitelist-list/);
    expect(whitelistHtml).toMatch(/<summary>\s*<h2 id="list-heading"/);
  });
});
