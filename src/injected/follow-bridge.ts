export type FollowSource = 'inline' | 'api-timeline' | 'api-not-following' | undefined;

// 이 출처로 온 핸들만 팔로우 안 함이고, 나머지 출처는 모두 팔로우 중이라는 뜻이다
const NOT_FOLLOWING_SOURCE: FollowSource = 'api-not-following';

type FollowEmitter = (handles: string[], source: FollowSource, account: string) => void;

export class FollowBridge {
  private ready = false;
  private account: string | null = null;
  private readonly pending = new Map<FollowSource, Set<string>>();

  constructor(private readonly emit: FollowEmitter) {}

  send(handles: string[], source?: FollowSource, requestAccount?: string | null): void {
    const normalized = [...new Set(handles.map((handle) => handle.toLowerCase()))];
    if (normalized.length === 0) return;
    if (this.ready) {
      const account = requestAccount ?? this.account;
      if (account) this.emit(normalized, source, account);
      return;
    }
    this.queue(normalized, source);
  }

  // 초기 데이터처럼 먼저 도착한 값보다 오래된 출처는 계정 확정 전 대기열에 이미 있는 핸들을 건드리지 않고 없는 핸들만 더한다 (#142 리뷰 r7 S7-2).
  // 팔로잉 목록 응답의 사용자 객체에는 팔로우 여부 필드가 없을 수 있어, 응답 쪽 기록만으로는 목록에 든 핸들을 지킬 수 없다
  sendIfUnqueued(handles: string[], source?: FollowSource, requestAccount?: string | null): void {
    if (this.ready) {
      this.send(handles, source, requestAccount);
      return;
    }
    const queued = new Set([...this.pending.values()].flatMap((set) => [...set]));
    this.send(handles.filter((handle) => !queued.has(handle.toLowerCase())), source, requestAccount);
  }

  // 계정이 확정되기 전에는 같은 핸들의 팔로우 여부 중 나중에 들어온 값이 앞선 값을 대체한다 (#142 리뷰 r4 S4-1).
  // 초기 데이터(오래된 false)와 GraphQL(최신 true)이 모두 준비 전에 도착해도 오래된 값이 먼저 적용되지 않게 하기 위해서다.
  // 같은 여부로 거듭 도착한 핸들은 지금처럼 출처마다 쌓는다.
  // 출처가 없는 팔로우 목록은 다른 사람의 목록일 수 있어(content 쪽은 본인 목록만 받는다) 대기 중인 값을 지우지 않는다 (#142 리뷰 r5 S5-2).
  // 반대로 뒤이은 명시적 팔로우 안 함은 앞선 목록에서도 그 핸들을 지운다. 목록이 먼저 나가면 content 쪽이 최근 팔로우로 보고 삭제를 건너뛰기 때문이다 (#142 리뷰 r6 S6-2)
  private queue(handles: string[], source: FollowSource): void {
    if (source !== undefined) this.dropOppositeQueued(handles, source === NOT_FOLLOWING_SOURCE);
    const queued = this.pending.get(source) ?? new Set<string>();
    for (const handle of handles) queued.add(handle);
    this.pending.set(source, queued);
  }

  private dropOppositeQueued(handles: string[], incomingNotFollowing: boolean): void {
    for (const [queuedSource, queuedHandles] of this.pending) {
      if ((queuedSource === NOT_FOLLOWING_SOURCE) === incomingNotFollowing) continue;
      for (const handle of handles) queuedHandles.delete(handle);
      if (queuedHandles.size === 0) this.pending.delete(queuedSource);
    }
  }

  markReady(account: string): void {
    this.account = account;
    if (this.ready) return;
    this.ready = true;
    for (const [source, handles] of this.pending) {
      this.emit([...handles], source, account);
    }
    this.pending.clear();
  }

  getAccount(): string | null {
    return this.account;
  }
}
