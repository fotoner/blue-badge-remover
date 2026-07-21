// src/injected/data-extractors.ts
// fetch-interceptor에서 사용하는 순수 데이터 추출 함수.
// MAIN world에서 번들링되므로 @shared 경로 사용 불가 — 로컬 import만 허용.

function extractScreenName(userResult: Record<string, unknown>): string | null {
  const core = userResult['core'] as Record<string, unknown> | null | undefined;
  const legacy = userResult['legacy'] as Record<string, unknown> | null | undefined;
  const screenName = core?.['screen_name'] ?? legacy?.['screen_name'];
  return typeof screenName === 'string' && screenName.length > 0 ? screenName.toLowerCase() : null;
}

export interface ProfileEntry {
  userId: string;
  handle: string;
  displayName: string;
  bio: string;
  createdAt?: string;
  followersCount?: number;
  followingCount?: number;
}

function optionalString(value: unknown): string | undefined {
  return typeof value === 'string' ? value : undefined;
}

function optionalNumber(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0 ? value : undefined;
}

export function extractProfileEntries(users: Array<Record<string, unknown>>): ProfileEntry[] {
  const profiles: ProfileEntry[] = [];
  for (const user of users) {
    const userId = user['rest_id'];
    if (typeof userId !== 'string') continue;
    const legacy = user['legacy'] as Record<string, unknown> | null | undefined;
    const core = user['core'] as Record<string, unknown> | null | undefined;
    const handle = optionalString(legacy?.['screen_name']) ?? optionalString(core?.['screen_name']);
    if (!handle) continue;
    const profile: ProfileEntry = {
      userId,
      handle,
      displayName: optionalString(legacy?.['name']) ?? optionalString(core?.['name']) ?? '',
      bio: optionalString(legacy?.['description']) ?? '',
    };
    const createdAt = optionalString(legacy?.['created_at']);
    const followersCount = optionalNumber(legacy?.['followers_count']);
    const followingCount = optionalNumber(legacy?.['friends_count']);
    if (createdAt !== undefined) profile.createdAt = createdAt;
    if (followersCount !== undefined) profile.followersCount = followersCount;
    if (followingCount !== undefined) profile.followingCount = followingCount;
    profiles.push(profile);
  }
  return profiles;
}

export function findUserObjects(obj: unknown, result: Array<Record<string, unknown>>): void {
  if (obj === null || typeof obj !== 'object') return;

  const record = obj as Record<string, unknown>;
  if ('rest_id' in record && 'is_blue_verified' in record) {
    result.push({
      rest_id: record['rest_id'],
      is_blue_verified: record['is_blue_verified'],
      verified_type: record['verified_type'],
      legacy: record['legacy'],
      core: record['core'],
      following: record['following'],
      relationship_perspectives: record['relationship_perspectives'],
    });
  }

  for (const value of Object.values(record)) {
    if (Array.isArray(value)) {
      value.forEach((item) => findUserObjects(item, result));
    } else if (typeof value === 'object') {
      findUserObjects(value, result);
    }
  }
}

export function findFollowedHandles(obj: unknown, result: string[]): void {
  if (obj === null || typeof obj !== 'object') return;
  const record = obj as Record<string, unknown>;

  // X Following API 응답에서 screen_name 추출
  if ('user_results' in record) {
    const userResults = record['user_results'] as Record<string, unknown> | null;
    const userResult = userResults?.['result'] as Record<string, unknown> | undefined;
    if (userResult) {
      // 신스키마: screen_name은 core.screen_name (legacy는 통계 필드만 — Playwright 2026-03-28 검증)
      // 구스키마 폴백: legacy.screen_name
      const screenName = extractScreenName(userResult);
      if (screenName) result.push(screenName);
    }
  }

  for (const value of Object.values(record)) {
    if (Array.isArray(value)) {
      value.forEach((item) => findFollowedHandles(item, result));
    } else if (typeof value === 'object') {
      findFollowedHandles(value, result);
    }
  }
}

export interface FollowingUserMatch {
  handle: string;
  path: 'result.following' | 'legacy.following' | 'relationship_perspectives.following';
}

// 타임라인 응답 유저 객체에서 following=true인 핸들 추출.
// 'following' 플래그의 실제 위치는 미검증 — 3개 후보 경로를 관용적으로 확인.
// path 필드는 디버그 계측용 (어떤 경로가 실제로 매치되는지 식별).
export function extractFollowingFromUsers(users: Array<Record<string, unknown>>): FollowingUserMatch[] {
  const matches: FollowingUserMatch[] = [];
  for (const user of users) {
    const handle = extractScreenName(user);
    if (!handle) continue;
    const legacy = user['legacy'] as Record<string, unknown> | null | undefined;
    const rel = user['relationship_perspectives'] as Record<string, unknown> | null | undefined;
    if (user['following'] === true) matches.push({ handle, path: 'result.following' });
    else if (legacy?.['following'] === true) matches.push({ handle, path: 'legacy.following' });
    else if (rel?.['following'] === true) matches.push({ handle, path: 'relationship_perspectives.following' });
  }
  return matches;
}

// 배치(단일 응답) 내 중복 핸들만 제거하는 순수 함수 — 호출 간 상태를 갖지 않는다.
// 이전에는 영구 Set(postedFollowHandles)으로 이미 포스트한 핸들을 기억했으나,
// 이는 (1) ISOLATED 리스너 부착 전 포스트된 메시지 유실, (2) INITIAL_SETUP_DELAY 시점
// followSet 초기화로 인한 첫 3초 팔로우 유실, (3) 계정 전환 시 이전 계정 메모 잔존으로
// 새 계정 팔로우가 억제되는 3가지 데이터 유실을 유발했다 (Defect 1).
// 응답마다 반복 포스트되는 것은 의도된 self-heal 동작이며, content 측
// followSet diff(message-handler.ts handleFollowData)가 반복 도착을 저비용으로 흡수한다.
export function dedupeFollowHandles(matches: FollowingUserMatch[]): string[] {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const m of matches) {
    if (seen.has(m.handle)) continue;
    seen.add(m.handle);
    result.push(m.handle);
  }
  return result;
}
