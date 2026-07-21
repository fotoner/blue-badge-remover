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
});
