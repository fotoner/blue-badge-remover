// src/content/message-handler.ts
// MAIN world(fetch-interceptor)에서 postMessage로 전달되는 데이터 수신 처리.
import { MESSAGE_TYPES } from '@shared/constants';
import { logger } from '@shared/utils/logger';
import { profileCache, collectorBuffer, getSettings, getFollowSet, getProtectedKeywords, getCurrentUserHandle } from './state';
import { extractRetweeterHandle, extractTweetAuthor } from './tweet-processing';
import { processTweet } from './tweet-orchestrator';
import { saveFollowHandles, getMyHandle, type FollowCollectorDeps } from './follow-collector';
import { removeFadakBanner } from './fadak-banner';
import type { ProfileInfo } from '@shared/types';

interface ProfilePayload {
  userId?: unknown;
  handle: string;
  displayName?: unknown;
  bio?: unknown;
  createdAt?: unknown;
  followersCount?: unknown;
  followingCount?: unknown;
}

type FollowSource = 'inline' | 'api-timeline';

const X_HANDLE_PATTERN = /^[A-Za-z0-9_]{1,15}$/;
const MAX_PROFILE_BATCH = 1000;
const MAX_DISPLAY_NAME_LENGTH = 100;
const MAX_BIO_LENGTH = 2000;
const MAX_DATE_LENGTH = 64;

// 팔로우 변경 시 숨겨진 트윗 복원 + 재처리를 디바운스하는 공유 헬퍼 (Defect 3 수정).
// storage-listener.ts의 handleFollowListChange도 이 함수를 호출한다 — 동일 tick 내
// 중복 트리거(예: 이 모듈의 즉시 처리 + 뒤이은 storage.onChanged 이벤트)가 타이머
// 하나로 합쳐져 restore/reprocess가 1회만 실행된다.
let followReprocessTimer: ReturnType<typeof setTimeout> | null = null;
const pendingFollowHandles = new Set<string>();

export function scheduleFollowReprocess(handles: Iterable<string>): void {
  for (const handle of handles) pendingFollowHandles.add(handle.toLowerCase());
  if (pendingFollowHandles.size === 0) return;
  if (followReprocessTimer !== null) clearTimeout(followReprocessTimer);
  followReprocessTimer = setTimeout(() => {
    followReprocessTimer = null;
    const targets = new Set(pendingFollowHandles);
    pendingFollowHandles.clear();
    reprocessTweetsByHandles(targets);
  }, 0);
}

export function reprocessTweetsByHandles(handles: Set<string>): void {
  const settings = getSettings();
  const feed = document.querySelector('main') ?? document.body;
  feed.querySelectorAll<HTMLElement>('article[data-testid="tweet"]').forEach((tweet) => {
    const author = extractTweetAuthor(tweet)?.handle.toLowerCase();
    const retweeter = extractRetweeterHandle(tweet)?.toLowerCase();
    if (!author || (!handles.has(author) && (!retweeter || !handles.has(retweeter)))) return;
    tweet.querySelector('[data-bbr-debug]')?.remove();
    try {
      processTweet(tweet);
    } catch (error) {
      if (settings.debugMode) logger.error('Tweet reprocess failed', { error: String(error) });
    }
  });
}

// X 핸들 최대 길이는 15자 — 여유를 두어 32자로 캡.
// 메시지당 처리할 최대 핸들 수 (Defect 4 수정 — MAIN world 페이로드는 신뢰하지 않음).
const MAX_FOLLOW_HANDLES_PER_MESSAGE = 1000;

// 문자열이 아니거나, trim 후 비어 있거나, 너무 긴 항목은 조용히 무시하고
// 나머지만 최대 개수만큼 처리한다 (경계에서 검증, 나머지는 무시).
function sanitizeFollowHandles(raw: unknown[]): string[] {
  const valid: string[] = [];
  for (const h of raw) {
    if (typeof h !== 'string') continue;
    const trimmed = h.trim();
    if (!X_HANDLE_PATTERN.test(trimmed)) continue;
    valid.push(trimmed);
  }
  return valid.slice(0, MAX_FOLLOW_HANDLES_PER_MESSAGE);
}

function isProfileDataPayload(data: unknown): data is { profiles: ProfilePayload[] } {
  if (!data || typeof data !== 'object') return false;
  const d = data as Record<string, unknown>;
  if (!Array.isArray(d['profiles']) || d['profiles'].length > MAX_PROFILE_BATCH) return false;
  return d['profiles'].every(isProfilePayload);
}

function optionalBoundedString(value: unknown, maxLength: number): boolean {
  return value === undefined || (typeof value === 'string' && value.length <= maxLength);
}

function optionalCount(value: unknown): boolean {
  return value === undefined || (typeof value === 'number' && Number.isFinite(value) && value >= 0);
}

function isProfilePayload(value: unknown): value is ProfilePayload {
  if (!value || typeof value !== 'object') return false;
  const profile = value as Record<string, unknown>;
  return typeof profile['handle'] === 'string'
    && X_HANDLE_PATTERN.test(profile['handle'])
    && optionalBoundedString(profile['displayName'], MAX_DISPLAY_NAME_LENGTH)
    && optionalBoundedString(profile['bio'], MAX_BIO_LENGTH)
    && optionalBoundedString(profile['createdAt'], MAX_DATE_LENGTH)
    && optionalCount(profile['followersCount'])
    && optionalCount(profile['followingCount']);
}

function toProfileInfo(payload: ProfilePayload): ProfileInfo {
  const profile: ProfileInfo = {
    handle: payload.handle,
    displayName: typeof payload.displayName === 'string' ? payload.displayName : '',
    bio: typeof payload.bio === 'string' ? payload.bio : '',
  };
  if (typeof payload.createdAt === 'string') profile.createdAt = payload.createdAt;
  if (typeof payload.followersCount === 'number') profile.followersCount = payload.followersCount;
  if (typeof payload.followingCount === 'number') profile.followingCount = payload.followingCount;
  return profile;
}

function isFollowDataPayload(data: unknown): data is { handles: unknown[]; account: string; source?: FollowSource } {
  if (!data || typeof data !== 'object') return false;
  const d = data as Record<string, unknown>;
  const source = d['source'];
  return Array.isArray(d['handles'])
    && typeof d['account'] === 'string'
    && X_HANDLE_PATTERN.test(d['account'])
    && (source === undefined || source === 'inline' || source === 'api-timeline');
}

export function listenForMessages(followCollectorDeps: FollowCollectorDeps): void {
  window.addEventListener('message', (event) => {
    if (event.source !== window || event.origin !== window.location.origin) return;

    if (event.data?.type === MESSAGE_TYPES.PROFILE_DATA && isProfileDataPayload(event.data)) {
      handleProfileData(event.data);
    }
    if (event.data?.type === MESSAGE_TYPES.FOLLOW_DATA && isFollowDataPayload(event.data)) {
      if (event.data.account.toLowerCase() !== getCurrentUserHandle()?.toLowerCase()) return;
      handleFollowData(event.data, followCollectorDeps);
    }
  });
}

function handleProfileData(data: { profiles: ProfilePayload[] }): void {
  const settings = getSettings();
  for (const p of data.profiles) {
    const key = p.handle.toLowerCase();
    const profile = toProfileInfo(p);
    profileCache.set(key, profile);
    if (settings.keywordCollectorEnabled) {
      const buffered = collectorBuffer.get(key);
      if (buffered) {
        if (profile.bio && !buffered.bio) {
          if (settings.debugMode) logger.debug('Profile bio backfilled', { handle: key, bioPreview: profile.bio.slice(0, 40) });
          buffered.bio = profile.bio;
        }
        if (profile.displayName) buffered.displayName = profile.displayName;
      }
    }
  }
  if (settings.debugMode) {
    const withBio = data.profiles.map(toProfileInfo).filter((p) => p.bio);
    if (withBio.length > 0) {
      logger.debug('Profile bios received', { profiles: withBio.map((p) => `${p.handle}: ${p.bio.slice(0, 30)}`) });
    }
  }
  // 키워드 필터 활성 시, 업데이트된 프로필의 트윗을 재처리
  if (settings.keywordFilterEnabled || settings.aggressorFilterEnabled || getProtectedKeywords().length > 0) {
    const updatedHandles = new Set(data.profiles.map((p) => p.handle.toLowerCase()));
    const feed = document.querySelector('main') ?? document.body;
    feed.querySelectorAll('article[data-testid="tweet"]').forEach((tweet) => {
      const author = extractTweetAuthor(tweet as HTMLElement);
      if (author && updatedHandles.has(author.handle.toLowerCase())) {
        tweet.querySelector('[data-bbr-debug]')?.remove();
        try {
          processTweet(tweet as HTMLElement);
        } catch (error) {
          if (settings.debugMode) logger.error('Tweet reprocess failed', { error: String(error) });
        }
      }
    });
  }
}

function handleFollowData(data: { handles: unknown[]; account: string; source?: FollowSource }, followCollectorDeps: FollowCollectorDeps): void {
  // 경계 검증 (Defect 4): MAIN world 페이로드는 신뢰하지 않는다 — 배열 여부부터 재확인하고,
  // 유효하지 않은 항목은 조용히 걸러내며, 메시지당 처리량을 캡한다.
  if (!Array.isArray(data.handles)) return;
  const handles = sanitizeFollowHandles(data.handles);

  if (data.source === 'inline' || data.source === 'api-timeline') {
    // inline(fiber) + api-timeline 공통 경로 — 즉시 followSet 업데이트 + storage 저장.
    // Storm guard: 전부 이미 아는 핸들이면 storage 쓰기/재처리 없이 조기 반환.
    if (!handles.length) return;
    const followSet = getFollowSet();
    const newHandles = [...new Set(handles.map((h) => h.toLowerCase()))].filter((h) => !followSet.has(h));
    if (getSettings().debugMode) {
      logger.debug('Follow data received', {
        source: data.source,
        incoming: handles.length,
        newCount: newHandles.length,
      });
    }
    if (newHandles.length === 0) return;
    for (const h of newHandles) {
      followSet.add(h);
    }
    void saveFollowHandles(newHandles, followCollectorDeps, data.account);
    const pathHandle = window.location.pathname.split('/')[1]?.toLowerCase();
    if (pathHandle && followSet.has(pathHandle)) {
      removeFadakBanner();
    }
    scheduleFollowReprocess(newHandles);
  } else {
    // API 기반: 자기 팔로잉 페이지에서만 신뢰
    const myHandle = getMyHandle();
    const pathUser = window.location.pathname.split('/')[1]?.toLowerCase();
    if (myHandle && pathUser && pathUser !== myHandle) return;
    const normalizedHandles = [...new Set(handles.map((handle) => handle.toLowerCase()))];
    if (normalizedHandles.length) {
      void saveFollowHandles(normalizedHandles, followCollectorDeps, data.account).then(() => {
        scheduleFollowReprocess(normalizedHandles);
      });
    }
  }
}
