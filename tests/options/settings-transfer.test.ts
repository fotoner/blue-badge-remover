import { describe, expect, it } from 'vitest';
import {
  buildFilterListBackup,
  parseFilterListBackup,
  renderImportedFilterLists,
} from '../../src/options/settings-transfer';

describe('filter list backup boundary', () => {
  it('화이트리스트와 커스텀 필터를 버전이 있는 백업으로 만든다', () => {
    const backup = buildFilterListBackup(['@Alice'], 'tesla\ncoin', ['game']);
    expect(backup.schemaVersion).toBe(1);
    expect(backup.whitelist).toEqual(['@alice']);
    expect(backup.customFilterList).toBe('tesla\ncoin');
    expect(backup.protectedKeywords).toEqual(['game']);
  });

  it('가져온 목록을 정규화하고 중복을 제거한다', () => {
    const parsed = parseFilterListBackup({
      schemaVersion: 1,
      whitelist: ['@Alice', 'alice', '@Bob'],
      customFilterList: 'coin',
      protectedKeywords: [' Game ', 'game'],
    });
    expect(parsed?.whitelist).toEqual(['@alice', '@bob']);
    expect(parsed?.protectedKeywords).toEqual(['Game']);
  });

  it('잘못된 버전, 핸들, 과대 필터 문자열을 거부한다', () => {
    expect(parseFilterListBackup({ schemaVersion: 2, whitelist: [], customFilterList: '' })).toBeNull();
    expect(parseFilterListBackup({ schemaVersion: 1, whitelist: ['bad.handle'], customFilterList: '' })).toBeNull();
    expect(parseFilterListBackup({
      schemaVersion: 1,
      whitelist: [],
      customFilterList: 'x'.repeat(200_001),
    })).toBeNull();
  });

  it('가져온 커스텀 필터와 보호 키워드를 현재 입력란에 반영한다', () => {
    const customElement = document.createElement('textarea');
    const protectedElement = document.createElement('textarea');
    const backup = buildFilterListBackup([], 'coin', ['Game', 'Anime']);

    renderImportedFilterLists(backup, customElement, protectedElement);

    expect(customElement.value).toBe('coin');
    expect(protectedElement.value).toBe('Game\nAnime');
  });
});
