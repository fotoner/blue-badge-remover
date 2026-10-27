// src/features/settings/follow-list-reset.ts
// GraphQL 기능 플래그 때문에(#68) 미팔로우 계정이 섞인 팔로우 목록을 업데이트 때 한 번 비운다 (#70).
// 다시 모으는 일은 API 응답의 following:true, React fiber, /following 페이지 동기화가 맡는다.
import { browser } from 'wxt/browser';
import { STORAGE_KEYS } from '@shared/constants';

/** 처음 한 번만 비우고 true, 이미 비웠으면 아무것도 하지 않고 false */
export async function resetPollutedFollowListOnce(): Promise<boolean> {
  const stored = await browser.storage.local.get([STORAGE_KEYS.FOLLOW_LIST_RESET]);
  if (stored[STORAGE_KEYS.FOLLOW_LIST_RESET]) return false;
  await browser.storage.local.set({
    [STORAGE_KEYS.FOLLOW_LIST]: [],
    [STORAGE_KEYS.FOLLOW_CACHE]: {},
    [STORAGE_KEYS.FOLLOW_LIST_RESET]: new Date().toISOString(),
  });
  await browser.storage.local.remove(STORAGE_KEYS.LAST_SYNC_AT);
  return true;
}
