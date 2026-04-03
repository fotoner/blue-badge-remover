// src/content/state.ts
// Content script의 모든 공유 상태. 단일 진실 소스.
import { BadgeCache } from '@features/badge-detection';
import { ProfileCache } from '@features/keyword-filter';
import type { CollectedFadak, FilterRule, Settings } from '@shared/types';

export const badgeCache = new BadgeCache();
export const profileCache = new ProfileCache();
export const collectorBuffer = new Map<string, CollectedFadak>();

// 가변 상태 — setter를 통해서만 변경
let _settings: Settings;
let _followSet = new Set<string>();
let _whitelistSet = new Set<string>();
let _activeFilterRules: FilterRule[] = [];
let _currentUserHandle: string | null = null;

export function getSettings(): Settings { return _settings; }
export function setSettings(s: Settings): void { _settings = s; }

export function getFollowSet(): Set<string> { return _followSet; }
export function setFollowSet(s: Set<string>): void { _followSet = s; }

export function getWhitelistSet(): Set<string> { return _whitelistSet; }
export function setWhitelistSet(s: Set<string>): void { _whitelistSet = s; }

export function getActiveFilterRules(): FilterRule[] { return _activeFilterRules; }
export function setActiveFilterRules(r: FilterRule[]): void { _activeFilterRules = r; }

export function getCurrentUserHandle(): string | null { return _currentUserHandle; }
export function setCurrentUserHandle(h: string | null): void { _currentUserHandle = h; }

export function isHandleFollowed(handle: string): boolean {
  return _followSet.has(handle.toLowerCase());
}

export function isHandleWhitelisted(handle: string): boolean {
  return _whitelistSet.has('@' + handle.toLowerCase());
}
