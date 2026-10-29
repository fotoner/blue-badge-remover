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

describe('SPA navigation', () => {
  // 뒤로가기 팝인: 끊었다가 다시 붙이는 사이 X가 그린 트윗은 숨김 전에 그대로 그려진다
  it('이동할 때 FeedObserver를 끊지 않는다', () => {
    const start = source.indexOf('function handleNavigate()');
    const end = source.indexOf('\nfunction ', start + 1);
    const body = source.slice(start, end);

    expect(start).toBeGreaterThan(-1);
    expect(body).not.toContain('feedObserver.disconnect()');
  });
});

describe('content reload probe', () => {
  // #121: 팝업의 새로고침 확인에 응답하는 리스너는 초기화의 첫 await보다 앞에서 등록한다
  it('응답 리스너를 init의 첫 await 앞에서 등록한다', () => {
    const initStart = source.indexOf('async function init()');
    const listen = source.indexOf('listenForReloadProbe()', initStart);
    const firstAwait = source.indexOf('await ', initStart);

    expect(listen).toBeGreaterThan(initStart);
    expect(listen).toBeLessThan(firstAwait);
  });
});
