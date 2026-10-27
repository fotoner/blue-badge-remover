// src/features/settings/follow-list-reset.ts
// GraphQL 기능 플래그 때문에(#68) 미팔로우 계정이 섞인 v1 팔로우 데이터를 지운다 (#70).
// 새 코드는 v2 키(STORAGE_KEYS.FOLLOW_LIST·FOLLOW_CACHE)만 쓰므로, 정리 중이나 뒤에 옛 키로 늦게 도착한
// 쓰기가 있어도 새 목록에는 섞이지 않는다. 다시 모으는 일은 API following:true·fiber·/following 동기화가 맡는다.
import { browser } from 'wxt/browser';
import { STORAGE_KEYS } from '@shared/constants';

const LEGACY_FOLLOW_KEYS = ['followList', 'followCache'];

/** v1 팔로우 데이터가 있으면 동기화 시각과 함께 지우고 true, 없으면 false */
export async function removeLegacyFollowData(): Promise<boolean> {
  const stored = await browser.storage.local.get(LEGACY_FOLLOW_KEYS);
  if (Object.keys(stored).length === 0) return false;
  await browser.storage.local.remove([...LEGACY_FOLLOW_KEYS, STORAGE_KEYS.LAST_SYNC_AT]);
  return true;
}
