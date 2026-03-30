// src/shared/i18n.test.ts
import { describe, it, expect } from 'vitest';
import { t } from './i18n';

describe('i18n', () => {
  it('manageWhitelist 키가 ko/en/ja에 모두 존재한다', () => {
    expect(t('manageWhitelist', 'ko')).toBe('화이트리스트 관리');
    expect(t('manageWhitelist', 'en')).toBe('Manage Whitelist');
    expect(t('manageWhitelist', 'ja')).toBe('ホワイトリスト管理');
  });

  it('whitelistCount 키가 count 파라미터를 치환한다', () => {
    expect(t('whitelistCount', 'ko', { count: '3' })).toBe('등록된 계정 (3)');
    expect(t('whitelistCount', 'en', { count: '3' })).toBe('Accounts (3)');
    expect(t('whitelistCount', 'ja', { count: '3' })).toBe('登録済み (3)');
  });

  it('whitelistEmpty 키가 ko/en/ja에 모두 존재한다', () => {
    expect(t('whitelistEmpty', 'ko')).toBe('등록된 계정이 없습니다');
    expect(t('whitelistEmpty', 'en')).toBe('No accounts added');
    expect(t('whitelistEmpty', 'ja')).toBe('登録なし');
  });
});
