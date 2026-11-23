// src/content/follow-button.ts
// 팔로우 버튼 판정 — 화면 언어와 무관하다 (#111).
// 팔로우 상태는 버튼 data-testid 접미사(`<id>-follow` / `<id>-unfollow`)로, 핸들은 aria-label 안의 `@handle`로만 읽는다.
// aria-label 문구("팔로잉 @x", "Following @x", 「@xさんをフォロー中」)는 화면 언어를 따르므로 판정에 쓰지 않는다.
// testid 규약은 2026-11-23 한국어 화면 실측 픽스처(tests/fixtures/x-dom/user-cell-*.html)로 고정했다. 일본어 aria-label 형태는 아직 실측하지 않았다.
import { X_HANDLE_PATTERN } from '@shared/constants';

export const FOLLOW_BUTTON_SELECTOR = '[data-testid$="-follow"], [data-testid$="-unfollow"]';

export interface FollowButtonState {
  handle: string;
  /** 지금 팔로우 중이면 true(testid `-unfollow`), 아직이면 false(testid `-follow`) */
  following: boolean;
}

const UNFOLLOW_TESTID_SUFFIX = '-unfollow';
const FOLLOW_TESTID_SUFFIX = '-follow';
const AT_TOKEN_PATTERN = /@([A-Za-z0-9_]+)/g;

/** testid 접미사로만 팔로우 상태를 읽는다. 팔로우 버튼이 아니면 null */
export function readFollowState(button: Element): boolean | null {
  const testId = button.getAttribute('data-testid') ?? '';
  if (testId.endsWith(UNFOLLOW_TESTID_SUFFIX)) return true;
  if (testId.endsWith(FOLLOW_TESTID_SUFFIX)) return false;
  return null;
}

/** aria-label 안의 `@handle`만 뽑는다. 핸들 규칙(영숫자·밑줄 15자)에 맞는 첫 토큰을 쓴다 */
function readHandleFromLabel(label: string | null): string | null {
  for (const match of (label ?? '').matchAll(AT_TOKEN_PATTERN)) {
    const handle = match[1];
    if (handle && X_HANDLE_PATTERN.test(handle)) return handle;
  }
  return null;
}

/** 버튼 요소 → 핸들과 팔로우 상태. testid가 없거나 라벨에 핸들이 없으면 null (화면 문구로 되돌아가지 않는다) */
export function readFollowButton(button: Element): FollowButtonState | null {
  const following = readFollowState(button);
  if (following === null) return null;
  const handle = readHandleFromLabel(button.getAttribute('aria-label'));
  return handle ? { handle, following } : null;
}
