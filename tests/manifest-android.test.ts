// AMO는 gecko_android 키가 없으면 데스크톱 전용으로 올린다 (#87).
// MDN: "the gecko_android sub-key must be an empty object … Otherwise, the extension is only made available on desktop Firefox."
import { describe, it, expect } from 'vitest';
import config from '../wxt.config';

describe('Firefox 매니페스트', () => {
  it('Firefox for Android 호환을 위해 gecko_android를 선언한다', () => {
    const manifest = config.manifest as { browser_specific_settings?: Record<string, unknown> };
    expect(manifest.browser_specific_settings).toHaveProperty('gecko_android', {});
  });
});
