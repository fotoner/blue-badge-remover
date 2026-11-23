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
    // 2026-11 새 형식에는 legacy가 없다 — 생성일은 core, 자기소개는 profile_bio, 통계는 relationship_counts (#131)
    const profileBio = user['profile_bio'] as Record<string, unknown> | null | undefined;
    const counts = user['relationship_counts'] as Record<string, unknown> | null | undefined;
    const handle = optionalString(legacy?.['screen_name']) ?? optionalString(core?.['screen_name']);
    if (!handle) continue;
    const profile: ProfileEntry = {
      userId,
      handle,
      displayName: optionalString(legacy?.['name']) ?? optionalString(core?.['name']) ?? '',
      bio: optionalString(legacy?.['description']) ?? optionalString(profileBio?.['description']) ?? '',
    };
    const createdAt = optionalString(legacy?.['created_at']) ?? optionalString(core?.['created_at']);
    const followersCount = optionalNumber(legacy?.['followers_count']) ?? optionalNumber(counts?.['followers']);
    const followingCount = optionalNumber(legacy?.['friends_count']) ?? optionalNumber(counts?.['following']);
    if (createdAt !== undefined) profile.createdAt = createdAt;
    if (followersCount !== undefined) profile.followersCount = followersCount;
    if (followingCount !== undefined) profile.followingCount = followingCount;
    profiles.push(profile);
  }
  return profiles;
}

// 같은 사용자 ID로 거듭 온 프로필을 합친다 (#142 리뷰 r4 S4-2). 후속 값이 있는 필드는 갱신하고, 후속 값에 없는 필드는 앞선 값을 지킨다.
// 이름·자기소개는 값이 없으면 빈 문자열로 오므로 빈 문자열을 "없음"으로 본다 — 초기 데이터가 준 이름과 자기소개를 빈 값이 지우지 않게 한다
export function mergeProfileEntry(earlier: ProfileEntry | undefined, later: ProfileEntry): ProfileEntry {
  if (!earlier) return later;
  const merged: ProfileEntry = {
    ...earlier,
    userId: later.userId,
    handle: later.handle,
    displayName: later.displayName || earlier.displayName,
    bio: later.bio || earlier.bio,
  };
  if (later.createdAt !== undefined) merged.createdAt = later.createdAt;
  if (later.followersCount !== undefined) merged.followersCount = later.followersCount;
  if (later.followingCount !== undefined) merged.followingCount = later.followingCount;
  return merged;
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === 'object' ? (value as Record<string, unknown>) : null;
}

export function findUserObjects(obj: unknown, result: Array<Record<string, unknown>>): void {
  if (obj === null || typeof obj !== 'object') return;

  const record = obj as Record<string, unknown>;
  // xweb(2026-11-23 실측)은 파딱 여부가 최상위 is_blue_verified가 아니라 verification 안에 중첩된다 (#142)
  const verification = asRecord(record['verification']);
  const hasTopLevelBlue = 'is_blue_verified' in record;
  if ('rest_id' in record && (hasTopLevelBlue || typeof verification?.['is_blue_verified'] === 'boolean')) {
    result.push({
      rest_id: record['rest_id'],
      is_blue_verified: hasTopLevelBlue ? record['is_blue_verified'] : verification?.['is_blue_verified'],
      verified_type: record['verified_type'] ?? verification?.['verified_type'],
      legacy: record['legacy'],
      core: record['core'],
      profile_bio: record['profile_bio'],
      relationship_counts: record['relationship_counts'],
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

// API가 명시적으로 '팔로우 안 함'이라고 알려준 핸들 — 오염된 팔로우 목록을 정리하는 근거.
// 실측(2026-10 HomeTimeline): 팔로우 여부는 relationship_perspectives.following에만 true/false로 온다.
// 목록에서 지우는 근거이므로 boolean false만 믿고, 필드가 없거나 다른 경로가 true면 판단하지 않는다.
export function extractNotFollowingFromUsers(users: Array<Record<string, unknown>>): string[] {
  const following = new Set(extractFollowingFromUsers(users).map((m) => m.handle));
  const result = new Set<string>();
  for (const user of users) {
    const handle = extractScreenName(user);
    if (!handle || following.has(handle)) continue;
    const rel = user['relationship_perspectives'] as Record<string, unknown> | null | undefined;
    if (rel?.['following'] === false) result.add(handle);
  }
  return [...result];
}

// Following 응답에서 팔로우 핸들 추출 — 같은 응답에서 following:false로 확인된 유저(추천 등)는 뺀다
export function extractFollowingListHandles(data: unknown): string[] {
  const handles: string[] = [];
  findFollowedHandles(data, handles);
  const users: Array<Record<string, unknown>> = [];
  findUserObjects(data, users);
  const notFollowing = new Set(extractNotFollowingFromUsers(users));
  return [...new Set(handles.map((handle) => handle.toLowerCase()))].filter((handle) => !notFollowing.has(handle));
}

// 가로챌 GraphQL 요청인지 본다. 기존 앱은 x.com·twitter.com의 /i/api/graphql/·/i/api/2/, 새 앱(xweb)은 api.x.com·api.twitter.com의 /graphql/<해시>/<오퍼레이션>이다 (#142).
// 상대 주소는 페이지 주소로 해석한 뒤 호스트와 pathname으로 가른다. 주소 문자열에 경로가 들어 있는지만 보면
// 외부 주소의 쿼리·해시나 다른 호스트의 같은 경로(api.x.com.evil.example, ?next=/i/api/graphql/)도 잡힌다.
// 사본: @shared/constants의 X_GRAPHQL_ENDPOINTS·X_API_GRAPHQL_HOSTS
const PAGE_HOSTS = ['x.com', 'twitter.com'];
const PAGE_API_PATHS = ['/i/api/graphql/', '/i/api/2/'];
const XWEB_API_HOSTS = ['api.x.com', 'api.twitter.com'];
const XWEB_API_PATH = '/graphql/';

export function isGraphqlRequestUrl(url: string): boolean {
  try {
    const { hostname, pathname } = new URL(url, location.href);
    if (PAGE_HOSTS.includes(hostname)) return PAGE_API_PATHS.some((prefix) => pathname.startsWith(prefix));
    return XWEB_API_HOSTS.includes(hostname) && pathname.startsWith(XWEB_API_PATH);
  } catch {
    return false;
  }
}

// xweb 첫 화면 데이터(window.__INITIAL_DATA__). 기존 앱에는 없어 null이다 (#142)
export function readInitialData(win: object): Record<string, unknown> | null {
  return asRecord((win as Record<string, unknown>)['__INITIAL_DATA__']);
}

// 첫 화면 데이터의 viewerScreenName — 화면에 계정 전환 링크가 없어 본인 계정을 알 수 있는 유일한 곳이다 (#142).
// 형식 검증은 받는 쪽(content script)이 한다. 여기서는 문자열 여부만 본다
export function readViewerHandle(win: object): string | null {
  const handle = readInitialData(win)?.['viewerScreenName'];
  return typeof handle === 'string' && handle.length > 0 ? handle : null;
}

// GraphQL 오퍼레이션 이름(쿼리스트링 앞 경로의 마지막 세그먼트)이 정확히 Following인지 본다.
// X가 모든 GraphQL 요청 쿼리스트링에 responsive_web_grok_analyze_post_followups_enabled 플래그를 붙이면서
// url.includes('follow')가 항상 참이 되어 모든 응답의 작성자가 팔로우로 저장되었다. Followers 목록도 제외한다.
export function isFollowingEndpoint(url: string): boolean {
  const path = url.split(/[?#]/)[0] ?? '';
  return path.slice(path.lastIndexOf('/') + 1) === 'Following';
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
