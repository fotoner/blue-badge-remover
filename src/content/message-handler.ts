// src/content/message-handler.ts
// MAIN world(fetch-interceptor)에서 postMessage로 전달되는 데이터 수신 처리.
import { parseBadgeInfo } from '@features/badge-detection';
import { MESSAGE_TYPES } from '@shared/constants';
import { badgeCache, profileCache, collectorBuffer, getSettings, getFollowSet, setFollowSet } from './state';
import { extractTweetAuthor } from './tweet-processing';
import { processTweet, restoreHiddenTweets, reprocessExistingTweets } from './tweet-orchestrator';
import { saveFollowHandles, getMyHandle } from './follow-collector';
import { removeFadakBanner } from './fadak-banner';

let domFollowReprocessTimer: ReturnType<typeof setTimeout> | null = null;

export function listenForMessages(followCollectorDeps: Record<string, unknown>): void {
  window.addEventListener('message', (event) => {
    if (event.source !== window || event.origin !== window.location.origin) return;

    if (event.data?.type === MESSAGE_TYPES.BADGE_DATA) {
      handleBadgeData(event.data);
    }
    if (event.data?.type === MESSAGE_TYPES.PROFILE_DATA) {
      handleProfileData(event.data);
    }
    if (event.data?.type === MESSAGE_TYPES.FOLLOW_DATA) {
      handleFollowData(event.data, followCollectorDeps);
    }
  });
}

function handleBadgeData(data: { users: unknown[] }): void {
  for (const userData of data.users) {
    const badge = parseBadgeInfo(userData);
    if (badge) {
      badgeCache.set(badge.userId, badge.isBluePremium);
    }
  }
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

function handleFollowData(data: { handles: string[]; source?: string }, followCollectorDeps: Record<string, unknown>): void {
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
