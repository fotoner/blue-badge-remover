// src/content/message-handler.ts
// MAIN world(fetch-interceptor)에서 postMessage로 전달되는 데이터 수신 처리.
import { MESSAGE_TYPES } from '@shared/constants';
import { profileCache, collectorBuffer, getSettings, getFollowSet, setFollowSet } from './state';
import { extractTweetAuthor } from './tweet-processing';
import { processTweet, restoreHiddenTweets, reprocessExistingTweets } from './tweet-orchestrator';
import { saveFollowHandles, getMyHandle, type FollowCollectorDeps } from './follow-collector';
import { removeFadakBanner } from './fadak-banner';

// 팔로우 변경 시 숨겨진 트윗 복원 + 재처리를 디바운스하는 공유 헬퍼 (Defect 3 수정).
// storage-listener.ts의 handleFollowListChange도 이 함수를 호출한다 — 동일 tick 내
// 중복 트리거(예: 이 모듈의 즉시 처리 + 뒤이은 storage.onChanged 이벤트)가 타이머
// 하나로 합쳐져 restore/reprocess가 1회만 실행된다.
let followReprocessTimer: ReturnType<typeof setTimeout> | null = null;

export function scheduleFollowReprocess(): void {
  if (followReprocessTimer !== null) clearTimeout(followReprocessTimer);
  followReprocessTimer = setTimeout(() => {
    followReprocessTimer = null;
    restoreHiddenTweets();
    reprocessExistingTweets();
  }, 0);
}

// X 핸들 최대 길이는 15자 — 여유를 두어 32자로 캡.
const MAX_FOLLOW_HANDLE_LENGTH = 32;
// 메시지당 처리할 최대 핸들 수 (Defect 4 수정 — MAIN world 페이로드는 신뢰하지 않음).
const MAX_FOLLOW_HANDLES_PER_MESSAGE = 1000;

// 문자열이 아니거나, trim 후 비어 있거나, 너무 긴 항목은 조용히 무시하고
// 나머지만 최대 개수만큼 처리한다 (경계에서 검증, 나머지는 무시).
function sanitizeFollowHandles(raw: unknown[]): string[] {
  const valid: string[] = [];
  for (const h of raw) {
    if (typeof h !== 'string') continue;
    const trimmed = h.trim();
    if (trimmed.length === 0 || trimmed.length > MAX_FOLLOW_HANDLE_LENGTH) continue;
    valid.push(trimmed);
  }
  return valid.slice(0, MAX_FOLLOW_HANDLES_PER_MESSAGE);
}

function isProfileDataPayload(data: unknown): data is { profiles: Array<{ userId: string; handle: string; displayName: string; bio: string }> } {
  if (!data || typeof data !== 'object') return false;
  const d = data as Record<string, unknown>;
  if (!Array.isArray(d['profiles'])) return false;
  return d['profiles'].every((p: unknown) =>
    p !== null && typeof p === 'object' &&
    typeof (p as Record<string, unknown>)['handle'] === 'string',
  );
}

function isFollowDataPayload(data: unknown): data is { handles: unknown[]; source?: string } {
  if (!data || typeof data !== 'object') return false;
  const d = data as Record<string, unknown>;
  return Array.isArray(d['handles']);
}

export function listenForMessages(followCollectorDeps: FollowCollectorDeps): void {
  window.addEventListener('message', (event) => {
    if (event.source !== window || event.origin !== window.location.origin) return;

    if (event.data?.type === MESSAGE_TYPES.BADGE_DATA) {
      handleBadgeData(event.data);
    }
    if (event.data?.type === MESSAGE_TYPES.PROFILE_DATA && isProfileDataPayload(event.data)) {
      handleProfileData(event.data);
    }
    if (event.data?.type === MESSAGE_TYPES.FOLLOW_DATA && isFollowDataPayload(event.data)) {
      handleFollowData(event.data, followCollectorDeps);
    }
  });
}

function handleBadgeData(_data: { users: unknown[] }): void {
  // SVG 기반 감지로 전환 — API 배지 캐시 사용 안 함.
  // 이중 팝(SVG 숨김→API 복원→재숨김)과 parseBadgeInfo 엣지 케이스 제거.
}

function handleProfileData(data: { profiles: Array<{ userId: string; handle: string; displayName: string; bio: string }> }): void {
  const settings = getSettings();
  for (const p of data.profiles) {
    const key = p.handle.toLowerCase();
    profileCache.set(key, { handle: p.handle, displayName: p.displayName, bio: p.bio });
    if (settings.keywordCollectorEnabled) {
      const buffered = collectorBuffer.get(key);
      if (buffered) {
        if (p.bio && !buffered.bio) {
          if (settings.debugMode) console.log('[BBR BIO BACKFILL]', key, '->', p.bio.slice(0, 40));
          buffered.bio = p.bio;
        }
        if (p.displayName) buffered.displayName = p.displayName;
      }
    }
  }
  if (settings.debugMode) {
    const withBio = data.profiles.filter((p) => p.bio);
    if (withBio.length > 0) console.log('[BBR PROFILE_DATA bios]', withBio.map((p) => `${p.handle}: ${p.bio.slice(0, 30)}`));
  }
  // 키워드 필터 활성 시, 업데이트된 프로필의 트윗을 재처리
  if (settings.keywordFilterEnabled) {
    const updatedHandles = new Set(data.profiles.map((p) => p.handle.toLowerCase()));
    const feed = document.querySelector('main') ?? document.body;
    feed.querySelectorAll('article[data-testid="tweet"]').forEach((tweet) => {
      const author = extractTweetAuthor(tweet as HTMLElement);
      if (author && updatedHandles.has(author.handle.toLowerCase())) {
        tweet.querySelector('[data-bbr-debug]')?.remove();
        try {
          processTweet(tweet as HTMLElement);
        } catch (e) {
          if (settings?.debugMode) console.error('[BBR] processTweet error', e);
        }
      }
    });
  }
}

function handleFollowData(data: { handles: unknown[]; source?: string }, followCollectorDeps: FollowCollectorDeps): void {
  // 경계 검증 (Defect 4): MAIN world 페이로드는 신뢰하지 않는다 — 배열 여부부터 재확인하고,
  // 유효하지 않은 항목은 조용히 걸러내며, 메시지당 처리량을 캡한다.
  if (!Array.isArray(data.handles)) return;
  const handles = sanitizeFollowHandles(data.handles);

  if (data.source) {
    // inline(fiber) + api-timeline 공통 경로 — 즉시 followSet 업데이트 + storage 저장.
    // Storm guard: 전부 이미 아는 핸들이면 storage 쓰기/재처리 없이 조기 반환.
    if (!handles.length) return;
    const followSet = getFollowSet();
    const newHandles = [...new Set(handles.map((h) => h.toLowerCase()))].filter((h) => !followSet.has(h));
    if (getSettings().debugMode) console.log('[BBR FOLLOW]', data.source, `incoming=${handles.length} new=${newHandles.length}`);
    if (newHandles.length === 0) return;
    for (const h of newHandles) {
      followSet.add(h);
    }
    void saveFollowHandles(newHandles, followCollectorDeps);
    const pathHandle = window.location.pathname.split('/')[1]?.toLowerCase();
    if (pathHandle && followSet.has(pathHandle)) {
      removeFadakBanner();
    }
    scheduleFollowReprocess();
  } else {
    // API 기반: 자기 팔로잉 페이지에서만 신뢰
    const myHandle = getMyHandle();
    const pathUser = window.location.pathname.split('/')[1]?.toLowerCase();
    if (myHandle && pathUser && pathUser !== myHandle) return;
    if (handles.length) {
      void saveFollowHandles(handles, followCollectorDeps).then(() => {
        restoreHiddenTweets();
        reprocessExistingTweets();
      });
    }
  }
}
