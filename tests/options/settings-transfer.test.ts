import { describe, expect, it, vi } from 'vitest';
import {
  buildFilterListBackup,
  importFilterListFile,
  parseFilterListBackup,
  renderImportedFilterLists,
} from '../../src/options/settings-transfer';

function backupFile(content: string): File {
  return new File([content], 'backup.json', { type: 'application/json' });
}

function makeImportDeps(confirmResult = true): Parameters<typeof importFilterListFile>[1] & {
  replaceWhitelist: ReturnType<typeof vi.fn>;
  saveLists: ReturnType<typeof vi.fn>;
  confirmReplace: ReturnType<typeof vi.fn>;
} {
  return {
    confirmReplace: vi.fn(() => confirmResult),
    replaceWhitelist: vi.fn(async () => {}),
    saveLists: vi.fn(async () => {}),
  };
}

const VALID_BACKUP = JSON.stringify({
  schemaVersion: 1,
  whitelist: ['@Alice'],
  customFilterList: 'coin\ntesla',
  protectedKeywords: ['game'],
});

describe('importFilterListFile', () => {
  it('확인 후 화이트리스트는 큐 경유로, 필터/보호 키워드는 저장한다', async () => {
    const deps = makeImportDeps();
    const outcome = await importFilterListFile(backupFile(VALID_BACKUP), deps);
    expect(outcome.status).toBe('imported');
    expect(deps.confirmReplace).toHaveBeenCalledWith(expect.objectContaining({ whitelist: 1, customRules: 2, protectedKeywords: 1 }));
    expect(deps.replaceWhitelist).toHaveBeenCalledWith(['@alice']);
    expect(deps.saveLists).toHaveBeenCalledWith('coin\ntesla', ['game']);
  });

  it('사용자가 취소하면 아무것도 저장하지 않는다', async () => {
    const deps = makeImportDeps(false);
    expect((await importFilterListFile(backupFile(VALID_BACKUP), deps)).status).toBe('cancelled');
    expect(deps.replaceWhitelist).not.toHaveBeenCalled();
    expect(deps.saveLists).not.toHaveBeenCalled();
  });

  it('형식이 잘못된 파일은 invalid-format으로 알리고 저장하지 않는다', async () => {
    const deps = makeImportDeps();
    const outcome = await importFilterListFile(backupFile('{ not json'), deps);
    expect(outcome).toEqual({ status: 'invalid', reason: 'invalid-format' });
    expect(deps.confirmReplace).not.toHaveBeenCalled();
  });

  it('너무 큰 파일은 읽기 전에 too-large로 거부한다', async () => {
    const deps = makeImportDeps();
    const huge = backupFile('x'.repeat(2_000_001));
    const textSpy = vi.spyOn(huge, 'text');
    const outcome = await importFilterListFile(huge, deps);
    expect(outcome).toEqual({ status: 'invalid', reason: 'too-large' });
    expect(textSpy).not.toHaveBeenCalled();
  });
});

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
