// src/content/collector-buffer.ts
// 키워드 수집기 버퍼: 파딱 계정 데이터를 메모리에 버퍼링하고 주기적으로 storage에 플러시.
import { getCollectedFadaks, saveCollectedFadaks } from '@features/keyword-collector';
import type { CollectedFadak } from '@shared/types';
import { collectorBuffer } from './state';

const MAX_TWEET_TEXTS_PER_USER = 50;

export function bufferCollectedFadak(
  userId: string,
  handle: string,
  displayName: string,
  bio: string,
  tweetText: string,
): void {
  const now = Date.now();
  const existing = collectorBuffer.get(userId);
  if (existing) {
    if (displayName) existing.displayName = displayName;
    if (bio) existing.bio = bio;
    if (tweetText && !existing.tweetTexts.includes(tweetText)) {
      existing.tweetTexts.push(tweetText);
      if (existing.tweetTexts.length > MAX_TWEET_TEXTS_PER_USER) existing.tweetTexts.shift();
    }
    existing.lastSeenAt = now;
  } else {
    collectorBuffer.set(userId, {
      userId, handle, displayName, bio,
      tweetTexts: tweetText ? [tweetText] : [],
      firstSeenAt: now,
      lastSeenAt: now,
    });
  }
}

export async function flushCollector(): Promise<void> {
  if (collectorBuffer.size === 0) return;
  const existing = await getCollectedFadaks();
  const merged = new Map<string, CollectedFadak>(existing.map((f) => [f.userId, f]));
  for (const entry of collectorBuffer.values()) {
    const prev = merged.get(entry.userId);
    if (prev) {
      if (entry.displayName) prev.displayName = entry.displayName;
      if (entry.bio) prev.bio = entry.bio;
      for (const t of entry.tweetTexts) {
        if (!prev.tweetTexts.includes(t)) {
          prev.tweetTexts.push(t);
          if (prev.tweetTexts.length > MAX_TWEET_TEXTS_PER_USER) prev.tweetTexts.shift();
        }
      }
      prev.lastSeenAt = entry.lastSeenAt;
    } else {
      merged.set(entry.userId, entry);
    }
  }
  await saveCollectedFadaks(Array.from(merged.values()));
  collectorBuffer.clear();
}

