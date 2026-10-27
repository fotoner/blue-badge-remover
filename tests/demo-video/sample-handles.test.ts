import { readdirSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

// 데모 영상은 실제 X 화면 대신 예시 계정으로 다시 그린다. 예시 아이디가 실존 계정과 겹치면
// 그 사람을 파딱으로 표시하게 되므로, X 아이디 최대 길이(15자)보다 긴 sample_ 아이디만 쓴다.
const RELEASES = resolve(process.cwd(), 'scripts/demo-video/releases');
const MAX_X_HANDLE_LENGTH = 15;
const releases = readdirSync(RELEASES).filter((file) => file.endsWith('.html'));

function handlesIn(file: string): string[] {
  const text = readFileSync(resolve(RELEASES, file), 'utf8');
  const fields = [...text.matchAll(/handle:\s*'([^']+)'/g)].map((match) => match[1]!);
  const mentions = [...text.matchAll(/@([A-Za-z0-9_]{2,})/g)].map((match) => match[1]!);
  return [...fields, ...mentions];
}

describe('데모 영상 예시 계정', () => {
  it('릴리스 장면 파일이 하나 이상 있다', () => {
    expect(releases.length).toBeGreaterThan(0);
  });

  it.each(releases)('%s의 모든 아이디가 sample_로 시작하는 16자 이상이다', (file) => {
    const invalid = handlesIn(file).filter((handle) => !handle.startsWith('sample_') || handle.length <= MAX_X_HANDLE_LENGTH);
    expect(invalid).toEqual([]);
  });
});
