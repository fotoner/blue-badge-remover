// src/content/message-handler.ts
// MAIN world(fetch-interceptor)에서 postMessage로 전달되는 데이터 수신 처리.
import { MESSAGE_TYPES, TIMINGS } from '@shared/constants';
import { profileCache, collectorBuffer, getSettings, getFollowSet, setFollowSet } from './state';
import { extractTweetAuthor } from './tweet-processing';
import { processTweet, restoreHiddenTweets, reprocessExistingTweets } from './tweet-orchestrator';
import { saveFollowHandles, getMyHandle, type FollowCollectorDeps } from './follow-collector';
import { removeFadakBanner } from './fadak-banner';

let domFollowReprocessTimer: ReturnType<typeof setTimeout> | null = null;
let profileReprocessScheduled = false;
const pendingProfileHandles = new Set<string>();

function isProfileDataPayload(data: unknown): data is { profiles: Array<{ userId: string; handle: string; displayName: string; bio: string }> } {
  if (!data || typeof data !== 'object') return false;
  const d = data as Record<string, unknown>;
  if (!Array.isArray(d['profiles'])) return false;
  return d['profiles'].every((p: unknown) =>
    p !== null && typeof p === 'object' &&
    typeof (p as Record<string, unknown>)['handle'] === 'string',
  );
}

function isFollowDataPayload(data: unknown): data is { handles: string[]; source?: string } {
  if (!data || typeof data !== 'object') return false;
  const d = data as Record<string, unknown>;
  return Array.isArray(d['handles']) && d['handles'].every((h: unknown) => typeof h === 'string');
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
    scheduleProfileReprocess(updatedHandles);
  }
}

function scheduleProfileReprocess(updatedHandles: Set<string>): void {
  for (const handle of updatedHandles) {
    pendingProfileHandles.add(handle);
  }
  if (profileReprocessScheduled) return;
  profileReprocessScheduled = true;
  requestAnimationFrame(() => {
    const handles = new Set(pendingProfileHandles);
    pendingProfileHandles.clear();
    const feed = document.querySelector('main') ?? document.body;
    const tweets = Array.from(feed.querySelectorAll<HTMLElement>('article[data-testid="tweet"]'))
      .filter((tweet) => {
        const author = extractTweetAuthor(tweet);
        return author && handles.has(author.handle.toLowerCase());
      });
    processProfileReprocessChunk(tweets, 0);
  });
}

function processProfileReprocessChunk(tweets: HTMLElement[], startIndex: number): void {
  const settings = getSettings();
  const endIndex = Math.min(startIndex + TIMINGS.REPROCESS_CHUNK_SIZE, tweets.length);
  for (let i = startIndex; i < endIndex; i++) {
    const tweet = tweets[i];
    if (!tweet) continue;
    tweet.querySelector('[data-bbr-debug]')?.remove();
    try {
      processTweet(tweet);
    } catch (e) {
      if (settings?.debugMode) console.error('[BBR] processTweet error', e);
    }
  }

  if (endIndex < tweets.length) {
    requestAnimationFrame(() => processProfileReprocessChunk(tweets, endIndex));
    return;
  }

  profileReprocessScheduled = false;
  if (pendingProfileHandles.size > 0) {
    scheduleProfileReprocess(new Set());
  }
}

function handleFollowData(data: { handles: string[]; source?: string }, followCollectorDeps: FollowCollectorDeps): void {
  const handles = data.handles;
  if (data.source) {
    // Inline fiber detection — 즉시 followSet 업데이트 + storage 저장
    if (handles?.length) {
      const followSet = getFollowSet();
      for (const h of handles) {
        followSet.add(h.toLowerCase());
      }
      void saveFollowHandles(handles, followCollectorDeps);
      const pathHandle = window.location.pathname.split('/')[1]?.toLowerCase();
      if (pathHandle && followSet.has(pathHandle)) {
        removeFadakBanner();
      }
      if (domFollowReprocessTimer !== null) clearTimeout(domFollowReprocessTimer);
      domFollowReprocessTimer = setTimeout(() => {
        domFollowReprocessTimer = null;
        restoreHiddenTweets();
        reprocessExistingTweets();
      }, 0);
    }
  } else {
    // API 기반: 자기 팔로잉 페이지에서만 신뢰
    const myHandle = getMyHandle();
    const pathUser = window.location.pathname.split('/')[1]?.toLowerCase();
    if (myHandle && pathUser && pathUser !== myHandle) return;
    if (handles?.length) {
      void saveFollowHandles(handles, followCollectorDeps).then(() => {
        restoreHiddenTweets();
        reprocessExistingTweets();
      });
    }
  }
}
