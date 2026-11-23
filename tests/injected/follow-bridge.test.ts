import { describe, expect, it, vi } from 'vitest';
import { FollowBridge } from '../../src/injected/follow-bridge';

describe('FollowBridge', () => {
  it('content 준비 전 신호를 보관했다가 준비 후 출처별로 전달한다', () => {
    const emit = vi.fn();
    const bridge = new FollowBridge(emit);

    bridge.send(['alice'], 'api-timeline');
    bridge.send(['bob']);
    expect(emit).not.toHaveBeenCalled();

    bridge.markReady('myaccount');

    expect(emit).toHaveBeenCalledWith(['alice'], 'api-timeline', 'myaccount');
    expect(emit).toHaveBeenCalledWith(['bob'], undefined, 'myaccount');
  });

  it('준비 후에는 즉시 전달하고 중복 핸들을 합친다', () => {
    const emit = vi.fn();
    const bridge = new FollowBridge(emit);
    bridge.send(['Alice', 'alice'], 'inline');

    bridge.markReady('myaccount');

    expect(emit).toHaveBeenCalledOnce();
    expect(emit).toHaveBeenCalledWith(['alice'], 'inline', 'myaccount');

    bridge.send(['bob'], 'api-timeline');
    expect(emit).toHaveBeenLastCalledWith(['bob'], 'api-timeline', 'myaccount');
  });

  it('요청 시작 시점 계정을 지정하면 이후 계정 전환 뒤에도 그 계정을 유지한다', () => {
    const emit = vi.fn();
    const bridge = new FollowBridge(emit);
    bridge.markReady('account_a');
    const requestAccount = bridge.getAccount();
    bridge.markReady('account_b');

    bridge.send(['alice'], 'api-timeline', requestAccount);

    expect(emit).toHaveBeenCalledWith(['alice'], 'api-timeline', 'account_a');
  });
  // #142 리뷰 r4 S4-1: 계정 확정 전에는 같은 핸들의 팔로우 여부 중 나중에 들어온 값이 앞선 값을 대체한다.
  // 초기 데이터(false)와 GraphQL(true)이 모두 준비 전에 도착해도 오래된 false가 먼저 적용돼 숨김 기록이 남는 일이 없어야 한다
  describe('계정 확정 전 같은 핸들의 팔로우 여부 (#142 리뷰 r4 S4-1)', () => {
    it('앞선 팔로우 안 함을 뒤이은 팔로우가 대체한다: 팔로우 하나만 나간다', () => {
      const emit = vi.fn();
      const bridge = new FollowBridge(emit);

      bridge.send(['alice', 'carol'], 'api-not-following');
      bridge.send(['alice'], 'api-timeline');
      bridge.markReady('myaccount');

      expect(emit).toHaveBeenCalledWith(['alice'], 'api-timeline', 'myaccount');
      expect(emit).toHaveBeenCalledWith(['carol'], 'api-not-following', 'myaccount');
      const notFollowingCalls = emit.mock.calls.filter((call) => call[1] === 'api-not-following');
      expect(notFollowingCalls.flatMap((call) => call[0] as string[])).toEqual(['carol']);
    });

    it('앞선 팔로우를 뒤이은 팔로우 안 함이 대체한다: 팔로우 안 함 하나만 나간다', () => {
      const emit = vi.fn();
      const bridge = new FollowBridge(emit);

      bridge.send(['alice', 'inline_one'], 'api-timeline');
      bridge.send(['inline_one'], 'inline');
      bridge.send(['alice', 'inline_one'], 'api-not-following');
      bridge.markReady('myaccount');

      expect(emit).toHaveBeenCalledOnce();
      expect(emit).toHaveBeenCalledWith(['alice', 'inline_one'], 'api-not-following', 'myaccount');
    });

    it('핸들 대소문자와 상관없이 같은 핸들로 본다', () => {
      const emit = vi.fn();
      const bridge = new FollowBridge(emit);

      bridge.send(['Alice'], 'api-not-following');
      bridge.send(['ALICE'], 'api-timeline');
      bridge.markReady('myaccount');

      expect(emit).toHaveBeenCalledOnce();
      expect(emit).toHaveBeenCalledWith(['alice'], 'api-timeline', 'myaccount');
    });

    it('같은 여부로 거듭 도착한 핸들은 지금처럼 출처마다 전달한다 (팔로우 목록 출처 구분 유지)', () => {
      const emit = vi.fn();
      const bridge = new FollowBridge(emit);

      bridge.send(['alice'], 'api-timeline');
      bridge.send(['alice'], undefined);
      bridge.markReady('myaccount');

      expect(emit).toHaveBeenCalledWith(['alice'], 'api-timeline', 'myaccount');
      expect(emit).toHaveBeenCalledWith(['alice'], undefined, 'myaccount');
    });

    it('계정이 확정된 뒤의 전송은 대체 없이 도착 순서대로 나간다', () => {
      const emit = vi.fn();
      const bridge = new FollowBridge(emit);
      bridge.markReady('myaccount');

      bridge.send(['alice'], 'api-not-following');
      bridge.send(['alice'], 'api-timeline');

      expect(emit.mock.calls).toEqual([
        [['alice'], 'api-not-following', 'myaccount'],
        [['alice'], 'api-timeline', 'myaccount'],
      ]);
    });

    // #142 리뷰 r5 S5-2: 출처가 없는 팔로우 목록은 다른 사람의 목록일 수 있다(content 쪽은 본인 목록만 받는다).
    // 그 목록이 대기 중인 명시적 팔로우 안 함을 지우면, content 쪽이 목록을 무시할 때 오래된 팔로우 캐시가 남는다
    it('출처가 없는 팔로우 목록은 대기 중인 팔로우 안 함을 지우지 않는다', () => {
      const emit = vi.fn();
      const bridge = new FollowBridge(emit);

      bridge.send(['alice'], 'api-not-following');
      bridge.send(['alice'], undefined);
      bridge.markReady('myaccount');

      expect(emit).toHaveBeenCalledWith(['alice'], 'api-not-following', 'myaccount');
      expect(emit).toHaveBeenCalledWith(['alice'], undefined, 'myaccount');
    });

    // #142 리뷰 r6 S6-2: 오래된 본인 팔로잉 목록이 먼저 나가면 content 쪽이 그 핸들을 최근 팔로우로 표시해,
    // 뒤이은 팔로우 안 함의 삭제를 건너뛴다. 나중에 확인한 명시적 팔로우 안 함은 앞선 목록에서 그 핸들을 지운다
    it('뒤이어 들어온 명시적인 팔로우 안 함은 대기 중인 출처 없는 목록에서 그 핸들을 지운다', () => {
      const emit = vi.fn();
      const bridge = new FollowBridge(emit);

      bridge.send(['alice', 'bob'], undefined);
      bridge.send(['alice'], 'api-not-following');
      bridge.markReady('myaccount');

      expect(emit.mock.calls).toEqual([
        [['bob'], undefined, 'myaccount'],
        [['alice'], 'api-not-following', 'myaccount'],
      ]);
    });
  });

  // #142 리뷰 r7 S7-2: 초기 데이터처럼 먼저 도착한 값보다 오래된 출처는 대기열에 이미 있는 핸들을 건드리지 않는다
  describe('대기열에 없는 핸들만 더하기 (#142 리뷰 r7 S7-2)', () => {
    it('계정 확정 전에는 어느 출처로든 대기 중인 핸들을 빼고 나머지만 쌓는다', () => {
      const emit = vi.fn();
      const bridge = new FollowBridge(emit);

      bridge.send(['alice'], undefined);
      bridge.sendIfUnqueued(['Alice', 'carol'], 'api-not-following');
      bridge.markReady('myaccount');

      expect(emit.mock.calls).toEqual([
        [['alice'], undefined, 'myaccount'],
        [['carol'], 'api-not-following', 'myaccount'],
      ]);
    });

    it('계정이 확정된 뒤에는 그대로 바로 보낸다', () => {
      const emit = vi.fn();
      const bridge = new FollowBridge(emit);
      bridge.markReady('myaccount');

      bridge.sendIfUnqueued(['alice'], 'api-timeline');

      expect(emit).toHaveBeenCalledWith(['alice'], 'api-timeline', 'myaccount');
    });
  });
});
