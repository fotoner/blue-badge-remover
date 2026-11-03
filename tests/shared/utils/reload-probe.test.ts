import { describe, expect, it } from 'vitest';
import { parseMainWorldStart, parseReloadProbeResponse } from '@shared/utils/reload-probe';

describe('parseMainWorldStart', () => {
  it('readyState와 버전이 올바르면 그대로 돌려준다', () => {
    expect(parseMainWorldStart({ readyState: 'loading', version: '1.8.2' })).toEqual({ readyState: 'loading', version: '1.8.2' });
  });

  it.each([
    null,
    undefined,
    'loading',
    {},
    { readyState: 'loading' },
    { version: '1.8.2' },
    { readyState: 'unknown', version: '1.8.2' },
    { readyState: 'loading', version: '' },
    { readyState: 'loading', version: 1 },
  ])('형식이 어긋나면 null이다: %j', (raw) => {
    expect(parseMainWorldStart(raw)).toBeNull();
  });
});

describe('parseReloadProbeResponse', () => {
  it('mainWorldStart가 null인 응답도 유효한 응답이다', () => {
    expect(parseReloadProbeResponse({ mainWorldStart: null })).toEqual({ mainWorldStart: null });
  });

  it('mainWorldStart가 있으면 검증해서 돌려준다', () => {
    const response = { mainWorldStart: { readyState: 'interactive', version: '1.8.2' } };
    expect(parseReloadProbeResponse(response)).toEqual(response);
  });

  it.each([undefined, null, 'ok', {}, { mainWorldStart: 'loading' }, { mainWorldStart: { readyState: 'x', version: '1' } }])(
    '응답이 아니거나 형식이 어긋나면 null이다: %j',
    (raw) => {
      expect(parseReloadProbeResponse(raw)).toBeNull();
    },
  );
});
