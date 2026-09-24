import { describe, expect, it } from 'vitest';
import { t } from '@shared/i18n';

describe('whitelistPlaceholder', () => {
  // 입력란이 textarea라 Enter는 줄바꿈이 되므로, 줄 단위 입력과 추가 단축키를 안내해야 한다
  it.each([
    ['ko', '한 줄'],
    ['en', 'one per line'],
    ['ja', '1行'],
  ] as const)('%s 문구가 줄 단위 입력과 Ctrl/⌘+Enter를 안내한다', (lang, perLine) => {
    const placeholder = t('whitelistPlaceholder', lang);
    expect(placeholder).toContain(perLine);
    expect(placeholder).toContain('Enter');
  });
});
