import { describe, it, expect } from 'vitest';
import {
  findUserObjects,
  findFollowedHandles,
  extractFollowingFromUsers,
  dedupeFollowHandles,
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
