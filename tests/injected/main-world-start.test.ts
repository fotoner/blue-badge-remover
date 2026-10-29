import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { MAIN_WORLD_START } from '@shared/constants';
import { recordMainWorldStart } from '../../src/injected/main-world-start';

function fakeDocument(readyState: DocumentReadyState, root: HTMLElement | null): Document {
  return { readyState, documentElement: root } as unknown as Document;
}

describe('recordMainWorldStart', () => {
  it('시작 시점의 readyState와 빌드 버전을 <html> data 속성에 남긴다', () => {
    const root = document.createElement('html');
    recordMainWorldStart(fakeDocument('loading', root), '1.8.2');

    expect(root.getAttribute(MAIN_WORLD_START.READY_STATE_ATTR)).toBe('loading');
    expect(root.getAttribute(MAIN_WORLD_START.VERSION_ATTR)).toBe('1.8.2');
  });

  it('늦게 시작했으면 그때의 readyState를 그대로 남긴다', () => {
    const root = document.createElement('html');
    recordMainWorldStart(fakeDocument('interactive', root), '1.8.2');

    expect(root.getAttribute(MAIN_WORLD_START.READY_STATE_ATTR)).toBe('interactive');
  });

  it('documentElement가 아직 없으면 아무것도 하지 않는다', () => {
    expect(() => recordMainWorldStart(fakeDocument('loading', null), '1.8.2')).not.toThrow();
  });
});

describe('injected.content 진입점', () => {
  const source = readFileSync(resolve(process.cwd(), 'entrypoints/injected.content.ts'), 'utf8');

  it('인터셉터를 불러온 뒤에 시작 시점을 기록한다', () => {
    const importAt = source.indexOf("import('../src/injected/fetch-interceptor')");
    const recordAt = source.indexOf('recordMainWorldStart(', importAt);

    expect(importAt).toBeGreaterThan(-1);
    expect(recordAt).toBeGreaterThan(importAt);
  });

  it('빌드 버전은 package.json 버전을 쓴다 (runtime API는 MAIN world에 없다)', () => {
    expect(source).toContain("from '../package.json'");
  });
});
