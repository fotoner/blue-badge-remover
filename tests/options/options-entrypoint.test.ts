import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const optionsHtml = readFileSync(
  resolve(process.cwd(), 'entrypoints/options/index.html'),
  'utf8',
);

describe('options entrypoint', () => {
  it('실제 빌드 화면에 보호 키워드 입력란을 포함한다', () => {
    expect(optionsHtml).toContain('id="protected-keywords"');
    expect(optionsHtml).toContain('id="save-protected-keywords"');
  });

  it('실제 빌드 화면에 필터 목록 백업 버튼을 포함한다', () => {
    expect(optionsHtml).toContain('id="export-lists-btn"');
    expect(optionsHtml).toContain('id="import-lists-btn"');
  });
});
