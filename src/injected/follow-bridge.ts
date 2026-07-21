export type FollowSource = 'inline' | 'api-timeline' | undefined;

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
    const queued = this.pending.get(source) ?? new Set<string>();
    for (const handle of normalized) queued.add(handle);
    this.pending.set(source, queued);
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
