import { describe, it, expect } from 'vitest';
import { findUserObjects, findFollowedHandles } from '../../src/injected/data-extractors';

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

  it('core.user_results.screen_name 폴백', () => {
    const data = {
      user_results: {
        result: {
          core: {
            user_results: { screen_name: 'CoreUser' },
          },
        },
      },
    };
    const result: string[] = [];
    findFollowedHandles(data, result);
    expect(result).toEqual(['coreuser']);
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
