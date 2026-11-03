import { beforeEach, describe, expect, it, vi } from 'vitest';
import { MAIN_WORLD_START, MESSAGE_TYPES } from '@shared/constants';

const MANIFEST_VERSION = '1.8.2';

const { addListener } = vi.hoisted(() => ({ addListener: vi.fn() }));

vi.mock('wxt/browser', () => ({
  browser: {
    runtime: {
      getManifest: () => ({ version: '1.8.2' }),
      onMessage: { addListener },
    },
  },
}));

const { readMainWorldStart, listenForReloadProbe } = await import('../../src/content/reload-probe');

function pageWith(attrs: Record<string, string>): Document {
  const doc = document.implementation.createHTMLDocument('x');
  for (const [name, value] of Object.entries(attrs)) doc.documentElement.setAttribute(name, value);
  return doc;
}

const recorded = {
  [MAIN_WORLD_START.READY_STATE_ATTR]: 'loading',
  [MAIN_WORLD_START.VERSION_ATTR]: MANIFEST_VERSION,
};

describe('readMainWorldStart', () => {
  it('MAIN world가 남긴 기록과 확장 버전이 같으면 그대로 돌려준다', () => {
    expect(readMainWorldStart(pageWith(recorded), MANIFEST_VERSION)).toEqual({ readyState: 'loading', version: MANIFEST_VERSION });
  });

  it('기록이 없으면 null이다', () => {
    expect(readMainWorldStart(pageWith({}), MANIFEST_VERSION)).toBeNull();
  });

  it('기록된 버전이 확장 버전과 다르면 null이다 (이전 버전의 MAIN world)', () => {
    const doc = pageWith({ ...recorded, [MAIN_WORLD_START.VERSION_ATTR]: '1.8.1' });
    expect(readMainWorldStart(doc, MANIFEST_VERSION)).toBeNull();
  });

  it('readyState가 올바르지 않으면 null이다', () => {
    const doc = pageWith({ ...recorded, [MAIN_WORLD_START.READY_STATE_ATTR]: 'weird' });
    expect(readMainWorldStart(doc, MANIFEST_VERSION)).toBeNull();
  });

  it('늦게 시작한 기록은 readyState를 그대로 알린다', () => {
    const doc = pageWith({ ...recorded, [MAIN_WORLD_START.READY_STATE_ATTR]: 'complete' });
    expect(readMainWorldStart(doc, MANIFEST_VERSION)?.readyState).toBe('complete');
  });
});

describe('listenForReloadProbe', () => {
  beforeEach(() => {
    addListener.mockReset();
    document.documentElement.removeAttribute(MAIN_WORLD_START.READY_STATE_ATTR);
    document.documentElement.removeAttribute(MAIN_WORLD_START.VERSION_ATTR);
  });

  function registered(): (message: unknown, sender: unknown, sendResponse: (r: unknown) => void) => void {
    listenForReloadProbe();
    expect(addListener).toHaveBeenCalledTimes(1);
    return addListener.mock.calls[0]![0];
  }

  it('확인 메시지에는 MAIN world 시작 기록으로 바로 응답한다', () => {
    document.documentElement.setAttribute(MAIN_WORLD_START.READY_STATE_ATTR, 'loading');
    document.documentElement.setAttribute(MAIN_WORLD_START.VERSION_ATTR, MANIFEST_VERSION);
    const sendResponse = vi.fn();

    registered()({ type: MESSAGE_TYPES.RELOAD_PROBE }, {}, sendResponse);

    expect(sendResponse).toHaveBeenCalledWith({ mainWorldStart: { readyState: 'loading', version: MANIFEST_VERSION } });
  });

  it('MAIN world 기록이 없으면 mainWorldStart: null로 응답한다', () => {
    const sendResponse = vi.fn();

    registered()({ type: MESSAGE_TYPES.RELOAD_PROBE }, {}, sendResponse);

    expect(sendResponse).toHaveBeenCalledWith({ mainWorldStart: null });
  });

  it.each([undefined, null, 'x', {}, { type: 'OTHER' }])('다른 메시지에는 응답하지 않는다: %j', (message) => {
    const sendResponse = vi.fn();

    registered()(message, {}, sendResponse);

    expect(sendResponse).not.toHaveBeenCalled();
  });
});
