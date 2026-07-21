import { beforeEach, describe, expect, it } from 'vitest';
import { DEFAULT_SETTINGS } from '../../src/shared/constants';
import {
  getActiveFilterRules,
  getCurrentUserHandle,
  getExpandedSet,
  getFollowSet,
  getSettings,
  getProtectedKeywords,
  getWhitelistSet,
  isHandleFollowed,
  isHandleWhitelisted,
  setActiveFilterRules,
  setCurrentUserHandle,
  setFollowSet,
  setSettings,
  setProtectedKeywords,
  setWhitelistSet,
} from '../../src/content/state';

describe('content state', () => {
  beforeEach(() => {
    setSettings({ ...DEFAULT_SETTINGS });
    setFollowSet(new Set());
    setWhitelistSet(new Set());
    setActiveFilterRules([]);
    setProtectedKeywords([]);
    setCurrentUserHandle(null);
    getExpandedSet().clear();
  });

  it('보호 키워드 상태를 setter/getter로 공유한다', () => {
    setProtectedKeywords(['game', '커비']);
    expect(getProtectedKeywords()).toEqual(['game', '커비']);
  });

  it('setter로 저장한 상태를 동일한 getter에서 반환한다', () => {
    const rules = [{ type: 'keyword' as const, value: 'spam' }];
    setActiveFilterRules(rules);
    setCurrentUserHandle('owner');

    expect(getSettings()).toEqual(DEFAULT_SETTINGS);
    expect(getActiveFilterRules()).toBe(rules);
    expect(getCurrentUserHandle()).toBe('owner');
  });

  it('팔로우 핸들은 대소문자와 무관하게 조회한다', () => {
    setFollowSet(new Set(['alice']));

    expect(isHandleFollowed('ALICE')).toBe(true);
    expect(getFollowSet()).toEqual(new Set(['alice']));
  });

  it('화이트리스트는 저장 형식 @handle로 조회한다', () => {
    setWhitelistSet(new Set(['@alice']));

    expect(isHandleWhitelisted('ALICE')).toBe(true);
    expect(getWhitelistSet()).toEqual(new Set(['@alice']));
  });

  it('expanded status path는 DOM 재생성 사이에도 유지한다', () => {
    getExpandedSet().add('/alice/status/1');

    expect(getExpandedSet().has('/alice/status/1')).toBe(true);
  });
});
