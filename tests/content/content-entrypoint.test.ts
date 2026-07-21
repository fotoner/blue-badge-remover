import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const source = readFileSync(resolve(process.cwd(), 'src/content/index.ts'), 'utf8');

describe('content bridge startup order', () => {
  it('계정 전환 확인 뒤 MAIN world에 준비 완료를 알린다', () => {
    const initStart = source.indexOf('async function init()');
    const accountCheck = source.indexOf('await loadInitialAccountState(whitelist)', initStart);
    const readySignal = source.indexOf('signalContentReady()', accountCheck);

    expect(accountCheck).toBeGreaterThan(initStart);
    expect(readySignal).toBeGreaterThan(accountCheck);
  });
});
