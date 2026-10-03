import { readdirSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

// 화면 코드에 한국어 문자열을 직접 쓰면 영어/일본어 사용자에게 그대로 노출된다 — 번역 키(t/tp)를 써야 한다
const PAGE_DIRS = ['src/popup', 'src/dashboard', 'src/options', 'src/whitelist', 'src/collector'];
const HANGUL = /[ㄱ-ㆎ가-힣]/;

function stripComments(source: string): string {
  return source
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/(^|[^:])\/\/.*$/gm, '$1');
}

function hangulLines(dir: string): string[] {
  const root = resolve(process.cwd(), dir);
  return readdirSync(root)
    .filter((file) => file.endsWith('.ts') && !file.endsWith('.test.ts'))
    .flatMap((file) => stripComments(readFileSync(join(root, file), 'utf8'))
      .split('\n')
      .filter((line) => HANGUL.test(line))
      .map((line) => `${dir}/${file}: ${line.trim()}`));
}

describe.each(PAGE_DIRS)('%s 소스', (dir) => {
  it('주석 밖에 한국어 문자열이 없다', () => {
    expect(hangulLines(dir)).toEqual([]);
  });
});
