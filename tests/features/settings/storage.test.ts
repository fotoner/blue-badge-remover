import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { Mock } from 'vitest';
import { DEFAULT_SETTINGS } from '@shared/constants';

const mockStorage: Record<string, unknown> = {};
const { mockSendMessage, mockGetUILanguage } = vi.hoisted(() => ({
  mockSendMessage: vi.fn(),
  mockGetUILanguage: vi.fn((): string => 'ko-KR'),
}));

vi.mock('wxt/browser', () => ({
  browser: {
    storage: {
      local: {
        get: vi.fn((keys: string[]) =>
          Promise.resolve(
            Object.fromEntries(keys.filter((k: string) => k in mockStorage).map((k: string) => [k, mockStorage[k]])),
          ),
        ),
        set: vi.fn((items: Record<string, unknown>) => {
          Object.assign(mockStorage, items);
          return Promise.resolve();
        }),
      },
    },
    runtime: {
      sendMessage: mockSendMessage,
    },
    i18n: {
      getUILanguage: mockGetUILanguage,
    },
  },
}));

// Dynamic import after mock is set up
const { handleWhitelistRequest } = await import('@features/settings/whitelist-storage');
mockSendMessage.mockImplementation((request: unknown) => handleWhitelistRequest(request));
const {
  getSettings,
  updateSettings,
  keepLegacyLanguageOnUpdate,
  getWhitelist,
  addToWhitelist,
  addManyToWhitelist,
  removeFromWhitelist,
} = await import('@features/settings/storage');
const { browser } = await import('wxt/browser');

beforeEach(() => {
  Object.keys(mockStorage).forEach((k) => delete mockStorage[k]);
  mockSendMessage.mockClear();
  mockGetUILanguage.mockReset();
  mockGetUILanguage.mockReturnValue('ko-KR');
});

describe('getSettings', () => {
  it('should return default settings when storage is empty', async () => {
    const settings = await getSettings();
    expect(settings).toEqual(DEFAULT_SETTINGS);
  });

  it('should return stored settings', async () => {
    const custom = { ...DEFAULT_SETTINGS, enabled: false };
    mockStorage['settings'] = custom;
    const settings = await getSettings();
    expect(settings.enabled).toBe(false);
  });

  it('should fill missing top-level fields from defaults on upgrade', async () => {
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const { debugMode, ...withoutDebugMode } = DEFAULT_SETTINGS;
    mockStorage['settings'] = withoutDebugMode;
    const settings = await getSettings();
    expect(settings.enabled).toBe(DEFAULT_SETTINGS.enabled);
    expect(settings.debugMode).toBe(DEFAULT_SETTINGS.debugMode);
  });

  it('should deep merge nested filter object', async () => {
    const partial = {
      ...DEFAULT_SETTINGS,
      filter: { timeline: false, replies: true, search: false },
    };
    mockStorage['settings'] = partial;
    const settings = await getSettings();
    expect(settings.filter.timeline).toBe(false);
    expect(settings.filter.replies).toBe(true);
    expect(settings.filter.search).toBe(false);
    for (const key of Object.keys(DEFAULT_SETTINGS.filter)) {
      expect(settings.filter).toHaveProperty(key);
    }
  });

  it('should merge stored settings with defaults when fields are missing (migration)', async () => {
    mockStorage['settings'] = { enabled: true };
    const settings = await getSettings();
    expect(settings.enabled).toBe(true);
    expect(settings.keywordFilterEnabled).toBe(DEFAULT_SETTINGS.keywordFilterEnabled);
  });
});

// 기본 언어가 브라우저와 무관하게 한국어여서 영어권 사용자도 한국어 UI로 시작하던 문제
describe('언어 기본값', () => {
  it.each([
    ['en-US', 'en'],
    ['ja', 'ja'],
    ['ko-KR', 'ko'],
    ['fr-FR', 'en'],
  ] as const)('저장된 언어가 없으면 브라우저 언어 %s → %s로 시작한다', async (uiLanguage, expected) => {
    mockGetUILanguage.mockReturnValue(uiLanguage);
    expect((await getSettings()).language).toBe(expected);
  });

  it('저장된 언어는 브라우저 언어보다 우선한다', async () => {
    mockGetUILanguage.mockReturnValue('en-US');
    mockStorage['settings'] = { ...DEFAULT_SETTINGS, language: 'ja' };
    expect((await getSettings()).language).toBe('ja');
  });

  it('브라우저 언어를 읽을 수 없으면 영어로 시작한다', async () => {
    mockGetUILanguage.mockImplementation(() => { throw new Error('not implemented'); });
    expect((await getSettings()).language).toBe('en');
  });

  it('설정을 처음 저장할 때 감지한 언어가 함께 저장된다', async () => {
    mockGetUILanguage.mockReturnValue('en-US');
    await updateSettings({ enabled: false });
    expect((mockStorage['settings'] as { language: string }).language).toBe('en');
  });
});

// 업데이트 전에는 언어를 저장하지 않은 사용자도 한국어로 보고 있었다 — 업데이트만으로 언어가 바뀌면 안 된다
describe('keepLegacyLanguageOnUpdate', () => {
  it('저장된 설정이 없으면 기존 기본값인 한국어를 저장한다', async () => {
    mockGetUILanguage.mockReturnValue('en-US');
    await keepLegacyLanguageOnUpdate();
    expect((mockStorage['settings'] as { language: string }).language).toBe('ko');
  });

  it('저장된 설정에 언어가 없으면 한국어를 채우고 다른 값은 유지한다', async () => {
    mockStorage['settings'] = { enabled: false };
    await keepLegacyLanguageOnUpdate();
    const stored = mockStorage['settings'] as { language: string; enabled: boolean };
    expect(stored.language).toBe('ko');
    expect(stored.enabled).toBe(false);
  });

  it('이미 저장된 언어는 바꾸지 않는다', async () => {
    mockStorage['settings'] = { ...DEFAULT_SETTINGS, language: 'en' };
    await keepLegacyLanguageOnUpdate();
    expect((mockStorage['settings'] as { language: string }).language).toBe('en');
  });
});

describe('settings 불변성과 부분 갱신', () => {
  it('저장된 설정이 없을 때 반환값을 수정해도 DEFAULT_SETTINGS는 바뀌지 않는다', async () => {
    const settings = await getSettings();
    settings.filter.timeline = !DEFAULT_SETTINGS.filter.timeline;
    settings.enabled = !DEFAULT_SETTINGS.enabled;
    const again = await getSettings();
    expect(again).toEqual(DEFAULT_SETTINGS);
    expect(again.filter).not.toBe(DEFAULT_SETTINGS.filter);
  });

  // 대시보드/팝업이 열린 시점 스냅샷을 통째로 저장해 다른 화면의 변경을 되돌리던 문제
  it('updateSettings는 최신 저장값에 변경분만 병합한다', async () => {
    mockStorage['settings'] = { ...DEFAULT_SETTINGS, defaultFilterEnabled: true };
    const merged = await updateSettings({ keywordFilterEnabled: true });
    expect(merged.defaultFilterEnabled).toBe(true);
    expect(merged.keywordFilterEnabled).toBe(true);
    expect(mockStorage['settings']).toEqual(merged);
  });

  it('updateSettings는 filter 하위 필드를 부분 병합한다', async () => {
    mockStorage['settings'] = { ...DEFAULT_SETTINGS, filter: { ...DEFAULT_SETTINGS.filter, search: false } };
    const merged = await updateSettings({ filter: { replies: false } });
    expect(merged.filter.search).toBe(false);
    expect(merged.filter.replies).toBe(false);
    expect(merged.filter.timeline).toBe(DEFAULT_SETTINGS.filter.timeline);
  });
});

describe('whitelist', () => {
  it('should return empty array when no whitelist', async () => {
    const list = await getWhitelist();
    expect(list).toEqual([]);
  });

  it('should add handle to whitelist', async () => {
    await addToWhitelist('@testuser');
    expect(mockStorage['whitelist']).toContain('@testuser');
  });

  it('should add multiple normalized handles with one storage write', async () => {
    mockStorage['whitelist'] = ['@existing'];
    const before = (browser.storage.local.set as Mock).mock.calls.length;
    await addManyToWhitelist(['@Alice', 'bob', '@alice']);
    const after = (browser.storage.local.set as Mock).mock.calls.length;
    expect(mockStorage['whitelist']).toEqual(['@existing', '@alice', '@bob']);
    expect(after - before).toBe(1);
  });

  it('should not add duplicate handle', async () => {
    mockStorage['whitelist'] = ['@testuser'];
    await addToWhitelist('@testuser');
    expect((mockStorage['whitelist'] as string[]).length).toBe(1);
  });

  it('should remove handle from whitelist', async () => {
    mockStorage['whitelist'] = ['@testuser', '@other'];
    await removeFromWhitelist('@testuser');
    expect(mockStorage['whitelist']).toEqual(['@other']);
  });

  it('should store mixed-case handle as lowercase', async () => {
    await addToWhitelist('@MixedCase');
    expect(mockStorage['whitelist']).toEqual(['@mixedcase']);
  });

  it('should not add a duplicate when a normalized-equivalent handle already exists', async () => {
    mockStorage['whitelist'] = ['@mixedcase'];
    await addToWhitelist('@MixedCase');
    expect((mockStorage['whitelist'] as string[]).length).toBe(1);
  });

  it('should remove handle regardless of input case', async () => {
    mockStorage['whitelist'] = ['@foo', '@bar'];
    await removeFromWhitelist('@FOO');
    expect(mockStorage['whitelist']).toEqual(['@bar']);
  });

  it('should migrate mixed-case + duplicate storage on read', async () => {
    mockStorage['whitelist'] = ['@Foo', '@foo', '@bar'];
    const list = await getWhitelist();
    expect(list).toEqual(['@foo', '@bar']);
    expect(mockStorage['whitelist']).toEqual(['@foo', '@bar']);
  });

  it('should strip multiple leading "@" characters on migration', async () => {
    mockStorage['whitelist'] = ['@@Foo'];
    const list = await getWhitelist();
    expect(list).toEqual(['@foo']);
    expect(mockStorage['whitelist']).toEqual(['@foo']);
  });

  it('should perform exactly one write when migrating dirty storage', async () => {
    mockStorage['whitelist'] = ['@Foo', '@foo', '@bar'];
    const before = (browser.storage.local.set as Mock).mock.calls.length;
    await getWhitelist();
    const after = (browser.storage.local.set as Mock).mock.calls.length;
    expect(after - before).toBe(1);
  });

  it('should not write when storage is already clean', async () => {
    mockStorage['whitelist'] = ['@foo', '@bar'];
    const before = (browser.storage.local.set as Mock).mock.calls.length;
    const list = await getWhitelist();
    const after = (browser.storage.local.set as Mock).mock.calls.length;
    expect(after - before).toBe(0);
    expect(list).toEqual(['@foo', '@bar']);
  });

  it('should return empty array and perform zero writes when no whitelist is stored', async () => {
    const before = (browser.storage.local.set as Mock).mock.calls.length;
    const list = await getWhitelist();
    const after = (browser.storage.local.set as Mock).mock.calls.length;
    expect(list).toEqual([]);
    expect(after - before).toBe(0);
  });

  it('동시에 추가한 두 계정을 모두 보존한다', async () => {
    await Promise.all([
      addToWhitelist('@alice'),
      addToWhitelist('@bob'),
    ]);

    expect(mockStorage['whitelist']).toEqual(['@alice', '@bob']);
  });

  it('추가와 삭제가 겹쳐도 새로 추가한 계정을 잃지 않는다', async () => {
    mockStorage['whitelist'] = ['@alice'];

    await Promise.all([
      addToWhitelist('@bob'),
      removeFromWhitelist('@alice'),
    ]);

    expect(mockStorage['whitelist']).toEqual(['@bob']);
  });
});
