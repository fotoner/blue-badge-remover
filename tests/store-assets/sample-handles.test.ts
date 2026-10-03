import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

// 스토어 이미지의 예시 계정이 우연히 실존 개인 계정과 겹치면, 그 사람을 파딱으로 표시하게 된다.
// X 아이디는 최대 15자이므로 예시 아이디는 16자 이상으로 둬서 실존 계정과 겹칠 수 없게 한다.
const FILES = ['seed.json', 'slides.en.json', 'slides.ko.json', 'slides.ja.json'];
const MAX_X_HANDLE_LENGTH = 15;

function handlesIn(file: string): string[] {
  const text = readFileSync(resolve(process.cwd(), 'scripts/store-assets', file), 'utf8');
  const mentions = [...text.matchAll(/@@?([A-Za-z0-9_]+)/g)].map((match) => match[1]!);
  const fields = [...text.matchAll(/"(?:handle|currentUserId)":\s*"([^"]+)"/g)].map((match) => match[1]!);
  return [...mentions, ...fields];
}

describe.each(FILES)('%s 예시 계정', (file) => {
  it('모든 아이디가 X에서 쓸 수 없는 16자 이상이다', () => {
    const tooShort = handlesIn(file).filter((handle) => handle.length <= MAX_X_HANDLE_LENGTH);
    expect(tooShort).toEqual([]);
  });
});
