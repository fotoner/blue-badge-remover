import { readdirSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

function findHtmlFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const fullPath = join(dir, entry.name);
    if (entry.isDirectory()) return findHtmlFiles(fullPath);
    return entry.name.endsWith('.html') ? [fullPath] : [];
  });
}

describe('entrypoint HTML location', () => {
  // WXT는 entrypoints/*/index.html만 빌드한다. src/에 HTML 사본이 있으면
  // 사본만 수정되고 실제 배포 화면은 갱신되지 않는 회귀가 반복된다 (v1.6.0 화이트리스트).
  it('src/ 아래에는 HTML 파일을 두지 않는다 — 화면 마크업은 entrypoints/에만 둔다', () => {
    const root = process.cwd();
    const htmlFiles = findHtmlFiles(resolve(root, 'src')).map((file) => relative(root, file));
    expect(htmlFiles).toEqual([]);
  });
});
