import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

// 좁은 화면(Android용 Firefox 등)에서 일본어 버튼 글자가 "保 / 存"처럼 쪼개지던 문제 —
// 버튼 글자는 줄바꿈하지 않고, 버튼 줄이 넘치면 다음 줄로 내린다
const css = readFileSync(resolve(process.cwd(), 'src/options/style.css'), 'utf8');

function rule(selector: string): string {
  const match = css.match(new RegExp(`(^|\\n)${selector.replace('.', '\\.')}\\s*\\{([^}]*)\\}`));
  return match?.[2] ?? '';
}

describe('고급 필터 화면 버튼 줄바꿈', () => {
  it('버튼 줄은 넘치면 다음 줄로 내린다', () => {
    expect(rule('.btn-row')).toMatch(/flex-wrap:\s*wrap/);
  });

  it.each(['.btn-primary', '.btn-secondary'])('%s 글자는 줄바꿈하지 않는다', (selector) => {
    expect(rule(selector)).toMatch(/white-space:\s*nowrap/);
  });
});
