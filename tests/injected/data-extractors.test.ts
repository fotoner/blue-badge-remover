import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  findUserObjects,
  findFollowedHandles,
  extractFollowingFromUsers,
  dedupeFollowHandles,
  extractProfileEntries,
  mergeProfileEntry,
  extractNotFollowingFromUsers,
  extractFollowingListHandles,
  isFollowingEndpoint,
  isGraphqlRequestUrl,
  readViewerHandle,
  type FollowingUserMatch,
} from '../../src/injected/data-extractors';

describe('findUserObjects', () => {
  it('단일 유저 객체 추출', () => {
    const data = {
      rest_id: '12345',
      is_blue_verified: true,
      verified_type: undefined,
      legacy: { screen_name: 'testuser', verified: false },
      core: {},
    };
    const result: Array<Record<string, unknown>> = [];
    findUserObjects(data, result);
    expect(result).toHaveLength(1);
    expect(result[0]!['rest_id']).toBe('12345');
    expect(result[0]!['is_blue_verified']).toBe(true);
  });

  it('중첩된 GraphQL 응답에서 여러 유저 추출', () => {
    const data = {
      data: {
        timeline: {
          entries: [
            { content: { result: { rest_id: '111', is_blue_verified: true, legacy: {} } } },
            { content: { result: { rest_id: '222', is_blue_verified: false, legacy: {} } } },
          ],
        },
      },
    };
    const result: Array<Record<string, unknown>> = [];
    findUserObjects(data, result);
    expect(result).toHaveLength(2);
    expect(result[0]!['rest_id']).toBe('111');
    expect(result[1]!['rest_id']).toBe('222');
  });

  it('rest_id 또는 is_blue_verified 없으면 무시', () => {
    const result: Array<Record<string, unknown>> = [];
    findUserObjects({ rest_id: '123' }, result); // missing is_blue_verified
    findUserObjects({ is_blue_verified: true }, result); // missing rest_id
    findUserObjects({ name: 'test' }, result); // neither
    expect(result).toHaveLength(0);
  });

  it('null/primitive 입력은 무시', () => {
    const result: Array<Record<string, unknown>> = [];
    findUserObjects(null, result);
    findUserObjects(undefined, result);
    findUserObjects('string', result);
    findUserObjects(42, result);
    expect(result).toHaveLength(0);
  });

  it('배열 내부의 유저 객체도 추출', () => {
    const data = [
      { rest_id: '1', is_blue_verified: true },
      { rest_id: '2', is_blue_verified: false },
    ];
    const result: Array<Record<string, unknown>> = [];
    findUserObjects(data, result);
    expect(result).toHaveLength(2);
  });

  it('legacy와 core 필드를 보존', () => {
    const data = {
      rest_id: '123',
      is_blue_verified: true,
      legacy: { screen_name: 'user', description: 'bio text' },
      core: { screen_name: 'user' },
    };
    const result: Array<Record<string, unknown>> = [];
    findUserObjects(data, result);
    expect(result[0]!['legacy']).toEqual({ screen_name: 'user', description: 'bio text' });
    expect(result[0]!['core']).toEqual({ screen_name: 'user' });
  });

  it('following과 relationship_perspectives 필드를 보존', () => {
    const data = {
      rest_id: '123',
      is_blue_verified: true,
      following: true,
      relationship_perspectives: { following: true },
    };
    const result: Array<Record<string, unknown>> = [];
    findUserObjects(data, result);
    expect(result).toHaveLength(1);
    expect(result[0]!['following']).toBe(true);
    expect(result[0]!['relationship_perspectives']).toEqual({ following: true });
  });
});

describe('extractProfileEntries', () => {
  it('C4 판정에 필요한 생성일과 팔로워 통계를 추출한다', () => {
    const profiles = extractProfileEntries([{
      rest_id: '42',
      core: { screen_name: 'NewUser', name: 'New User' },
      legacy: {
        description: 'bio', created_at: 'Wed Apr 01 00:00:00 +0000 2026',
        followers_count: 2_000, friends_count: 100,
      },
    }]);
    expect(profiles).toEqual([{
      userId: '42', handle: 'NewUser', displayName: 'New User', bio: 'bio',
      createdAt: 'Wed Apr 01 00:00:00 +0000 2026', followersCount: 2_000, followingCount: 100,
    }]);
  });

  it('legacy가 없는 새 사용자 형식에서도 생성일·팔로워 통계·자기소개를 추출한다 (#131)', () => {
    // 2026-11 HomeTimeline·TweetDetail 응답의 사용자 객체 모양(값은 지어냄)
    const response = { data: { tweet_results: { result: { core: { user_results: { result: {
      __typename: 'User', rest_id: '42', is_blue_verified: true,
      core: { screen_name: 'NewUser', name: 'New User', created_at: 'Wed Apr 01 00:00:00 +0000 2026' },
      profile_bio: { description: 'bio', entities: {} },
      relationship_counts: { followers: 2_000, following: 100 },
      relationship_perspectives: { following: false },
    } } } } } } };
    const users: Array<Record<string, unknown>> = [];
    findUserObjects(response, users);
    expect(extractProfileEntries(users)).toEqual([{
      userId: '42', handle: 'NewUser', displayName: 'New User', bio: 'bio',
      createdAt: 'Wed Apr 01 00:00:00 +0000 2026', followersCount: 2_000, followingCount: 100,
    }]);
  });

  it('필수 식별자가 없는 사용자와 잘못된 통계 타입을 안전하게 처리한다', () => {
    expect(extractProfileEntries([{ legacy: { screen_name: 'missing-id' } }])).toEqual([]);
    expect(extractProfileEntries([{
      rest_id: '1', legacy: { screen_name: 'x', followers_count: 'many' },
    }])[0]?.followersCount).toBeUndefined();
  });
});

describe('findFollowedHandles', () => {
  it('legacy.screen_name에서 팔로우 핸들 추출', () => {
    const data = {
      user_results: {
        result: {
          legacy: { screen_name: 'FollowedUser' },
        },
      },
    };
    const result: string[] = [];
    findFollowedHandles(data, result);
    expect(result).toEqual(['followeduser']);
  });

  it('core.screen_name에서 추출 (신스키마)', () => {
    const data = {
      user_results: {
        result: {
          core: { screen_name: 'CoreUser' },
        },
      },
    };
    const result: string[] = [];
    findFollowedHandles(data, result);
    expect(result).toEqual(['coreuser']);
  });

  it('Following 응답 신스키마 — screen_name은 core에만, legacy는 통계 필드만', () => {
    // Playwright 2026-03-28 검증: legacy에는 screen_name/name/verified가 없음 (통계 필드만)
    const data = {
      data: {
        user: {
          result: {
            timeline: {
              timeline: {
                instructions: [
                  {
                    type: 'TimelineAddEntries',
                    entries: [
                      {
                        content: {
                          itemContent: {
                            user_results: {
                              result: {
                                core: { screen_name: 'FollowedFadak', name: 'F' },
                                legacy: {
                                  followers_count: 10,
                                  friends_count: 5,
                                  statuses_count: 3,
                                  description: 'bio',
                                  default_profile: true,
                                },
                              },
                            },
                          },
                        },
                      },
                    ],
                  },
                ],
              },
            },
          },
        },
      },
    };
    const result: string[] = [];
    findFollowedHandles(data, result);
    expect(result).toEqual(['followedfadak']);
  });

  it('Following 응답 신스키마 — 두 엔트리 모두 추출 (0건 추출 회귀 방지)', () => {
    const entry = (screenName: string) => ({
      content: {
        itemContent: {
          user_results: {
            result: {
              core: { screen_name: screenName, name: 'N' },
              legacy: { followers_count: 1, friends_count: 2, statuses_count: 3 },
            },
          },
        },
      },
    });
    const data = {
      data: {
        user: {
          result: {
            timeline: {
              timeline: {
                instructions: [
                  { type: 'TimelineAddEntries', entries: [entry('UserOne'), entry('UserTwo')] },
                ],
              },
            },
          },
        },
      },
    };
    const result: string[] = [];
    findFollowedHandles(data, result);
    expect(result).toHaveLength(2);
    expect(result).toContain('userone');
    expect(result).toContain('usertwo');
  });

  it('core와 legacy 둘 다 screen_name이 있으면 core 우선', () => {
    const data = {
      user_results: {
        result: {
          core: { screen_name: 'CoreName' },
          legacy: { screen_name: 'LegacyName' },
        },
      },
    };
    const result: string[] = [];
    findFollowedHandles(data, result);
    expect(result).toEqual(['corename']);
  });

  it('여러 팔로우 항목이 있는 timeline 응답', () => {
    const data = {
      entries: [
        { user_results: { result: { legacy: { screen_name: 'User1' } } } },
        { user_results: { result: { legacy: { screen_name: 'User2' } } } },
      ],
    };
    const result: string[] = [];
    findFollowedHandles(data, result);
    expect(result).toHaveLength(2);
    expect(result).toContain('user1');
    expect(result).toContain('user2');
  });

  it('screen_name 없는 user_results는 무시', () => {
    const data = {
      user_results: {
        result: {
          legacy: { name: 'NoScreenName' },
        },
      },
    };
    const result: string[] = [];
    findFollowedHandles(data, result);
    expect(result).toHaveLength(0);
  });

  it('null/primitive 입력은 무시', () => {
    const result: string[] = [];
    findFollowedHandles(null, result);
    findFollowedHandles(undefined, result);
    findFollowedHandles(42, result);
    expect(result).toHaveLength(0);
  });

  it('핸들을 소문자로 정규화', () => {
    const data = {
      user_results: {
        result: {
          legacy: { screen_name: 'MixedCaseUser' },
        },
      },
    };
    const result: string[] = [];
    findFollowedHandles(data, result);
    expect(result[0]).toBe('mixedcaseuser');
  });
});

describe('extractFollowingFromUsers', () => {
  it('result.following === true → path result.following', () => {
    const users = [{ core: { screen_name: 'A' }, following: true }];
    expect(extractFollowingFromUsers(users)).toEqual([
      { handle: 'a', path: 'result.following' },
    ]);
  });

  it('legacy.following === true → path legacy.following', () => {
    const users = [{ legacy: { screen_name: 'B', following: true } }];
    expect(extractFollowingFromUsers(users)).toEqual([
      { handle: 'b', path: 'legacy.following' },
    ]);
  });

  it('relationship_perspectives.following === true → path relationship_perspectives.following', () => {
    const users = [
      { core: { screen_name: 'C' }, relationship_perspectives: { following: true } },
    ];
    expect(extractFollowingFromUsers(users)).toEqual([
      { handle: 'c', path: 'relationship_perspectives.following' },
    ]);
  });

  it('우선순위: following:false 최상위 + legacy.following:true → legacy.following 경로', () => {
    // false는 매치가 아니므로 다음 후보 경로를 확인한다
    const users = [
      { core: { screen_name: 'D' }, following: false, legacy: { following: true } },
    ];
    expect(extractFollowingFromUsers(users)).toEqual([
      { handle: 'd', path: 'legacy.following' },
    ]);
  });

  it('우선순위: 셋 다 true면 result.following 우선', () => {
    const users = [
      {
        core: { screen_name: 'E' },
        following: true,
        legacy: { following: true },
        relationship_perspectives: { following: true },
      },
    ];
    expect(extractFollowingFromUsers(users)).toEqual([
      { handle: 'e', path: 'result.following' },
    ]);
  });

  it('boolean true만 인정 — "true", 1, {} 는 매치하지 않음', () => {
    const users = [
      { core: { screen_name: 'F1' }, following: 'true' },
      { core: { screen_name: 'F2' }, following: 1 },
      { core: { screen_name: 'F3' }, following: {} },
      { core: { screen_name: 'F4' }, legacy: { following: 'true' } },
      { core: { screen_name: 'F5' }, relationship_perspectives: { following: 1 } },
    ];
    expect(extractFollowingFromUsers(users)).toEqual([]);
  });

  it('screen_name 없으면 following:true여도 스킵', () => {
    const users = [{ following: true }, { legacy: { followers_count: 3 }, following: true }];
    expect(extractFollowingFromUsers(users)).toEqual([]);
  });

  it('핸들 소문자 정규화', () => {
    const users = [{ core: { screen_name: 'MixedCase' }, following: true }];
    expect(extractFollowingFromUsers(users)[0]!.handle).toBe('mixedcase');
  });

  it('core.screen_name이 legacy.screen_name보다 우선', () => {
    const users = [
      { core: { screen_name: 'CoreH' }, legacy: { screen_name: 'LegacyH' }, following: true },
    ];
    expect(extractFollowingFromUsers(users)[0]!.handle).toBe('coreh');
  });
});

describe('dedupeFollowHandles', () => {
  const match = (handle: string): FollowingUserMatch => ({ handle, path: 'result.following' });

  it('배치 내 중복 핸들은 1회만 반환한다', () => {
    const result = dedupeFollowHandles([match('a'), match('a'), match('b')]);
    expect(result).toEqual(['a', 'b']);
  });

  it('중복이 없는 배치는 순서 그대로 반환한다', () => {
    const result = dedupeFollowHandles([match('a'), match('b')]);
    expect(result).toEqual(['a', 'b']);
  });

  it('빈 배열이면 빈 배열을 반환한다', () => {
    expect(dedupeFollowHandles([])).toEqual([]);
  });

  it('영구 메모 없음(Defect 1 회귀 방지) — 같은 핸들이 서로 다른 응답(호출)에서 오면 매번 다시 반환된다', () => {
    // 순수 함수이며 호출 간 상태를 공유하지 않는다.
    // 이전의 영구 Set 메모는 계정 전환/리스너 부착 지연 시 팔로우 유실을 유발했다 —
    // 반복 포스트는 이제 의도된 동작이며 content 측 followSet diff가 흡수한다.
    const first = dedupeFollowHandles([match('a')]);
    const second = dedupeFollowHandles([match('a')]);
    expect(first).toEqual(['a']);
    expect(second).toEqual(['a']);
  });
});

describe('isFollowingEndpoint', () => {
  // X가 모든 GraphQL 요청 쿼리스트링에 붙이는 feature 플래그 — 이름에 'followups'가 들어 있다
  const FLAGS = 'features=%7B%22responsive_web_grok_analyze_post_followups_enabled%22%3Atrue%7D';

  it('GraphQL 오퍼레이션이 Following이면 true', () => {
    expect(isFollowingEndpoint(`https://x.com/i/api/graphql/abc123/Following?variables=%7B%7D&${FLAGS}`)).toBe(true);
    expect(isFollowingEndpoint('/i/api/graphql/abc123/Following')).toBe(true);
  });

  it('쿼리스트링에만 follow가 들어 있는 다른 오퍼레이션은 false', () => {
    expect(isFollowingEndpoint(`https://x.com/i/api/graphql/abc123/HomeTimeline?variables=%7B%7D&${FLAGS}`)).toBe(false);
    expect(isFollowingEndpoint(`https://x.com/i/api/graphql/abc123/Likes?${FLAGS}`)).toBe(false);
  });

  it.each(['Followers', 'BlueVerifiedFollowers', 'FollowersYouKnow'])('팔로워 목록(%s)은 팔로잉 목록이 아니므로 false', (operation) => {
    expect(isFollowingEndpoint(`https://x.com/i/api/graphql/abc123/${operation}?${FLAGS}`)).toBe(false);
  });
});

describe('extractNotFollowingFromUsers', () => {
  it('relationship_perspectives.following === false인 핸들만 소문자로 추출', () => {
    const users = [
      { core: { screen_name: 'Stranger' }, relationship_perspectives: { following: false } },
      { core: { screen_name: 'Friend' }, relationship_perspectives: { following: true } },
      { core: { screen_name: 'NoRelation' } },
      { core: { screen_name: 'NullRelation' }, relationship_perspectives: null },
    ];
    expect(extractNotFollowingFromUsers(users)).toEqual(['stranger']);
  });

  it('다른 경로가 following=true면 팔로우 중으로 본다', () => {
    const users = [{ core: { screen_name: 'Mixed' }, following: true, relationship_perspectives: { following: false } }];
    expect(extractNotFollowingFromUsers(users)).toEqual([]);
  });

  it('같은 응답에서 true로도 나온 핸들은 팔로우 중으로 본다', () => {
    const users = [
      { core: { screen_name: 'Twice' }, relationship_perspectives: { following: false } },
      { core: { screen_name: 'twice' }, relationship_perspectives: { following: true } },
    ];
    expect(extractNotFollowingFromUsers(users)).toEqual([]);
  });

  it('boolean false가 아닌 값은 판단하지 않는다', () => {
    const users = [
      { core: { screen_name: 'Str' }, relationship_perspectives: { following: 'false' } },
      { core: { screen_name: 'Zero' }, relationship_perspectives: { following: 0 } },
    ];
    expect(extractNotFollowingFromUsers(users)).toEqual([]);
  });

  it('배치 내 중복 핸들은 한 번만 반환한다', () => {
    const users = [
      { core: { screen_name: 'Dup' }, relationship_perspectives: { following: false } },
      { core: { screen_name: 'dup' }, relationship_perspectives: { following: false } },
    ];
    expect(extractNotFollowingFromUsers(users)).toEqual(['dup']);
  });
});

describe('extractFollowingListHandles', () => {
  it('Following 응답의 user_results 핸들을 소문자로 모으되, 같은 응답에서 following:false인 유저는 뺀다', () => {
    const data = {
      entries: [
        { user_results: { result: { rest_id: '1', is_blue_verified: false, core: { screen_name: 'Friend' }, relationship_perspectives: { following: true } } } },
        { user_results: { result: { rest_id: '2', is_blue_verified: true, core: { screen_name: 'Suggested' }, relationship_perspectives: { following: false } } } },
        { user_results: { result: { rest_id: '3', is_blue_verified: false, core: { screen_name: 'NoRelation' } } } },
      ],
    };
    expect(extractFollowingListHandles(data)).toEqual(['friend', 'norelation']);
  });
});

// xweb(2026-11-23 실측 #138): 사용자 객체에 최상위 is_blue_verified가 없고 verification 안에 중첩된다.
// legacy도 없고 가입일 필드도 없다 (#142)
const XWEB_HOME_USER = {
  __typename: 'User',
  id: 'VXNlcjox',
  rest_id: '1',
  core: { name: '이름', screen_name: 'Fadak_One' },
  verification: { is_blue_verified: true },
  relationship_perspectives: { blocking: false, followed_by: false, following: true, muting: false },
  relationship_counts: { followers: 5000, following: 30 },
  profile_bio: { description: '자기소개' },
};

describe('xweb 사용자 객체 (#142)', () => {
  it('findUserObjects: verification.is_blue_verified만 있는 사용자도 잡고 파딱 여부를 최상위로 올린다', () => {
    const result: Array<Record<string, unknown>> = [];
    findUserObjects({ data: { home: { entries: [{ result: XWEB_HOME_USER }] } } }, result);

    expect(result).toHaveLength(1);
    expect(result[0]!['rest_id']).toBe('1');
    expect(result[0]!['is_blue_verified']).toBe(true);
    expect(result[0]!['relationship_perspectives']).toEqual(XWEB_HOME_USER.relationship_perspectives);
  });

  it('findUserObjects: verification.is_blue_verified가 false여도 사용자로 잡는다', () => {
    const result: Array<Record<string, unknown>> = [];
    findUserObjects({ ...XWEB_HOME_USER, verification: { is_blue_verified: false } }, result);

    expect(result).toHaveLength(1);
    expect(result[0]!['is_blue_verified']).toBe(false);
  });

  it('findUserObjects: verification에 boolean이 없으면 사용자로 보지 않는다', () => {
    const result: Array<Record<string, unknown>> = [];
    findUserObjects({ rest_id: '2', verification: { verified_type: 'Business' } }, result);
    findUserObjects({ rest_id: '3', verification: null }, result);
    findUserObjects({ rest_id: '4', verification: { is_blue_verified: 'true' } }, result);

    expect(result).toHaveLength(0);
  });

  it('findUserObjects: 최상위 is_blue_verified가 있으면 그 값을 우선한다 (기존 앱 모양)', () => {
    const result: Array<Record<string, unknown>> = [];
    findUserObjects({ rest_id: '5', is_blue_verified: false, verification: { is_blue_verified: true } }, result);

    expect(result[0]!['is_blue_verified']).toBe(false);
  });

  it('verified_type도 verification 안에 있으면 최상위로 올린다', () => {
    const result: Array<Record<string, unknown>> = [];
    findUserObjects({ rest_id: '6', verification: { is_blue_verified: true, verified_type: 'Business' } }, result);

    expect(result[0]!['verified_type']).toBe('Business');
  });

  it('프로필: 핸들·이름·팔로워·자기소개를 읽고, 가입일이 없으면 없는 대로 둔다', () => {
    const users: Array<Record<string, unknown>> = [];
    findUserObjects(XWEB_HOME_USER, users);

    expect(extractProfileEntries(users)).toEqual([{
      userId: '1',
      handle: 'Fadak_One',
      displayName: '이름',
      bio: '자기소개',
      followersCount: 5000,
      followingCount: 30,
    }]);
  });

  it('팔로우: relationship_perspectives.following으로 팔로우·비팔로우를 가른다', () => {
    const users: Array<Record<string, unknown>> = [];
    findUserObjects({
      a: XWEB_HOME_USER,
      b: { ...XWEB_HOME_USER, rest_id: '2', core: { name: '다른', screen_name: 'Other_Two' }, relationship_perspectives: { following: false } },
    }, users);

    expect(extractFollowingFromUsers(users)).toEqual([{ handle: 'fadak_one', path: 'relationship_perspectives.following' }]);
    expect(extractNotFollowingFromUsers(users)).toEqual(['other_two']);
  });
});

describe('isGraphqlRequestUrl (#142)', () => {
  // 상대 주소는 페이지 주소로 해석한다. 시험 환경의 location은 localhost라 X 페이지로 바꿔 둔다
  beforeEach(() => { vi.stubGlobal('location', new URL('https://x.com/home')); });
  afterEach(() => { vi.unstubAllGlobals(); });

  it.each([
    'https://x.com/i/api/graphql/abc/HomeTimeline?variables=%7B%7D',
    '/i/api/graphql/abc/UserByScreenName',
    'https://x.com/i/api/2/timeline/home.json',
    'https://twitter.com/i/api/graphql/abc/HomeTimeline',
    'https://twitter.com/i/api/2/timeline/home.json',
  ])('기존 앱 주소 %s는 가로챈다', (url) => {
    expect(isGraphqlRequestUrl(url)).toBe(true);
  });

  it.each([
    'https://api.x.com/graphql/hash123/HomeTimeline?variables=%7B%7D',
    'https://api.twitter.com/graphql/hash123/whoToFollowListQuery',
    'https://api.x.com/graphql/hash123/Following',
  ])('xweb 주소 %s는 가로챈다', (url) => {
    expect(isGraphqlRequestUrl(url)).toBe(true);
  });

  it.each([
    'https://api.x.com/1.1/jot/client_event.json',
    'https://x.com/graphql/hash123/HomeTimeline',
    'https://video.twimg.com/graphql/abc',
    'https://evil.example/graphql/x',
    'https://api.x.com.evil.example/graphql/x',
    'not a url',
    '',
  ])('그 밖의 주소 %s는 가로채지 않는다', (url) => {
    expect(isGraphqlRequestUrl(url)).toBe(false);
  });

  // 리뷰 r1 S1-6: 경로를 문자열로 포함하는지만 보면 외부 주소의 쿼리·해시·다른 호스트 경로도 잡힌다
  it.each([
    'https://evil.example/collect?next=/i/api/graphql/abc/HomeTimeline',
    'https://evil.example/collect?next=/i/api/2/timeline/home.json',
    'https://evil.example/i/api/graphql/abc/HomeTimeline',
    'https://evil.example/#/i/api/graphql/abc/HomeTimeline',
    'https://x.com/home?redirect=/i/api/graphql/abc/HomeTimeline',
    'https://x.com/i/api/1.1/graphql/abc',
    'https://api.x.com/i/api/graphql/abc/HomeTimeline',
    'https://api.twitter.com/i/api/2/timeline/home.json',
    'https://api.x.com/graphql-v2/abc/HomeTimeline',
    'https://api.x.com/?u=/graphql/abc/HomeTimeline',
  ])('경로가 호스트나 쿼리에 끼어든 주소 %s는 가로채지 않는다', (url) => {
    expect(isGraphqlRequestUrl(url)).toBe(false);
  });

  it('상대 주소는 페이지 호스트로 해석하고, X 호스트가 아니면 가로채지 않는다', () => {
    vi.stubGlobal('location', new URL('https://evil.example/home'));

    expect(isGraphqlRequestUrl('/i/api/graphql/abc/HomeTimeline')).toBe(false);
  });

  it('xweb 페이지(x.com)의 상대 /graphql/ 주소는 호스트가 x.com이라 가로채지 않는다', () => {
    expect(isGraphqlRequestUrl('/graphql/hash123/HomeTimeline')).toBe(false);
  });

  it('xweb Following 오퍼레이션도 팔로잉 목록으로 알아본다', () => {
    expect(isFollowingEndpoint('https://api.x.com/graphql/hash123/Following?variables=%7B%7D')).toBe(true);
    expect(isFollowingEndpoint('https://api.x.com/graphql/hash123/HomeTimeline')).toBe(false);
  });
});

describe('readViewerHandle (#142)', () => {
  it('초기 데이터의 viewerScreenName을 읽는다', () => {
    expect(readViewerHandle({ __INITIAL_DATA__: { viewerScreenName: 'My_Handle', viewerId: '9' } })).toBe('My_Handle');
  });

  it.each([
    [{}],
    [{ __INITIAL_DATA__: null }],
    [{ __INITIAL_DATA__: {} }],
    [{ __INITIAL_DATA__: { viewerScreenName: '' } }],
    [{ __INITIAL_DATA__: { viewerScreenName: 123 } }],
    [{ __INITIAL_DATA__: 'text' }],
  ])('읽을 수 없는 모양 %j은 null이다', (win) => {
    expect(readViewerHandle(win as Record<string, unknown>)).toBeNull();
  });
});

// #142 리뷰 r4 S4-2: 준비 신호 때 다시 보내는 프로필 캐시는 사용자 ID 기준으로 합친다.
// 후속 응답이 값을 가진 필드는 갱신하고, 후속 응답에 없는 필드는 앞선 값을 지킨다
describe('mergeProfileEntry', () => {
  const initial = { userId: '1', handle: 'Fadak_One', displayName: '초기 이름', bio: '' };

  it('앞선 프로필이 없으면 후속 프로필을 그대로 쓴다', () => {
    expect(mergeProfileEntry(undefined, initial)).toEqual(initial);
  });

  it('앞선 프로필에 없던 자기소개·팔로워 수는 후속 값으로 채운다', () => {
    const merged = mergeProfileEntry(initial, { ...initial, bio: '자기소개', followersCount: 5000, followingCount: 30 });

    expect(merged).toEqual({ ...initial, bio: '자기소개', followersCount: 5000, followingCount: 30 });
  });

  it('후속 프로필에 없는 필드는 앞선 값을 지킨다', () => {
    const earlier = { ...initial, bio: '자기소개', createdAt: '2020-01-01', followersCount: 5000 };

    expect(mergeProfileEntry(earlier, initial)).toEqual({ ...earlier, displayName: '초기 이름' });
  });

  it('후속 프로필이 값을 가진 필드는 갱신한다', () => {
    const earlier = { ...initial, displayName: '옛 이름', bio: '옛 소개', followersCount: 10 };

    const merged = mergeProfileEntry(earlier, { ...initial, displayName: '새 이름', bio: '새 소개', followersCount: 20 });

    expect(merged).toEqual({ ...initial, displayName: '새 이름', bio: '새 소개', followersCount: 20 });
  });

  it('후속 프로필에 이름이 비어 있으면 앞선 이름을 지키고 핸들은 후속 값을 쓴다', () => {
    const merged = mergeProfileEntry({ ...initial, displayName: '이름' }, { ...initial, handle: 'fadak_one', displayName: '' });

    expect(merged).toEqual({ ...initial, handle: 'fadak_one', displayName: '이름' });
  });
});
