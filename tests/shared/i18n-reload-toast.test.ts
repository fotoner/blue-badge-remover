import { describe, expect, it } from 'vitest';
import { t } from '@shared/i18n';

// 설치·업데이트 직후 열린 X 탭에 뜨는 안내 — X 화면 위에 뜨므로 확장 이름을 밝히고 한 문장으로 끝낸다 (#121)
describe('reloadToast 문구', () => {
  it.each([
    ['ko', '새로고침하면 Blue Badge Remover 업데이트가 적용됩니다', '새로고침하면 Blue Badge Remover가 동작합니다'],
    ['en', 'Reload to apply the Blue Badge Remover update', 'Reload to start using Blue Badge Remover'],
    ['ja', '再読み込みすると Blue Badge Remover の更新が反映されます', '再読み込みすると Blue Badge Remover が有効になります'],
  ] as const)('%s', (lang, updated, installed) => {
    expect(t('reloadToastUpdated', lang)).toBe(updated);
    expect(t('reloadToastInstalled', lang)).toBe(installed);
  });
});
