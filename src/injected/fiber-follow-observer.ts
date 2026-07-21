const TWEET_SELECTOR = 'article[data-testid="tweet"]';
const MAX_PROP_DEPTH = 20;
const MAX_FIBER_DEPTH = 40;
const MAX_REPORTED_HANDLES = 5000;

export interface ArticleFollowData {
  handle: string;
  following: boolean;
}

function scanProps(
  value: unknown,
  depth: number,
  seen: WeakSet<object>,
): ArticleFollowData | null {
  if (!value || typeof value !== 'object' || depth > MAX_PROP_DEPTH || seen.has(value)) return null;
  seen.add(value);
  const record = value as Record<string, unknown>;
  if (typeof record['screen_name'] === 'string' && typeof record['following'] === 'boolean') {
    return { handle: record['screen_name'], following: record['following'] };
  }
  for (const child of Object.values(record)) {
    const result = scanProps(child, depth + 1, seen);
    if (result) return result;
  }
  return null;
}

function walkFiber(
  value: unknown,
  depth: number,
  seen: WeakSet<object>,
): ArticleFollowData | null {
  if (!value || typeof value !== 'object' || depth > MAX_FIBER_DEPTH || seen.has(value)) return null;
  seen.add(value);
  const fiber = value as Record<string, unknown>;
  try {
    const result = scanProps(fiber['memoizedProps'], 0, new WeakSet<object>());
    if (result) return result;
    return walkFiber(fiber['child'], depth + 1, seen)
      ?? walkFiber(fiber['sibling'], depth + 1, seen);
  } catch {
    return null;
  }
}

export function extractArticleDataFromFiber(article: HTMLElement): ArticleFollowData | null {
  const fiberKey = Object.getOwnPropertyNames(article).find(
    (key) => key.startsWith('__reactFiber') || key.startsWith('__reactInternalInstance'),
  );
  if (!fiberKey) return null;
  const fiber = (article as unknown as Record<string, unknown>)[fiberKey];
  return walkFiber(fiber, 0, new WeakSet<object>());
}

export class FiberFollowObserver {
  private observer: MutationObserver | null = null;
  private readonly pendingArticles = new Set<HTMLElement>();
  private scannedArticles = new WeakSet<HTMLElement>();
  private readonly reportedHandles = new Set<string>();
  private rafId: number | null = null;
  private contentReady = false;

  constructor(private readonly onHandles: (handles: string[]) => void) {}

  start(container: Element): void {
    this.stop();
    this.collectArticles(container);
    this.observer = new MutationObserver((mutations) => {
      for (const mutation of mutations) {
        for (const node of mutation.addedNodes) this.collectArticles(node);
      }
      this.schedule();
    });
    this.observer.observe(container, { childList: true, subtree: true });
    this.schedule();
  }

  markContentReady(): void {
    this.contentReady = true;
    this.schedule();
  }

  markReported(handles: Iterable<string>): void {
    if (!this.contentReady) return;
    for (const handle of handles) this.rememberHandle(handle.toLowerCase());
  }

  stop(): void {
    this.observer?.disconnect();
    this.observer = null;
    if (this.rafId !== null && typeof cancelAnimationFrame === 'function') {
      cancelAnimationFrame(this.rafId);
    }
    this.rafId = null;
    this.pendingArticles.clear();
    this.scannedArticles = new WeakSet<HTMLElement>();
  }

  private collectArticles(node: Node): void {
    if (!(node instanceof HTMLElement)) return;
    const ancestor = node.closest<HTMLElement>(TWEET_SELECTOR);
    if (ancestor) {
      this.scannedArticles.delete(ancestor);
      this.pendingArticles.add(ancestor);
    }
    if (node.matches(TWEET_SELECTOR)) this.pendingArticles.add(node);
    node.querySelectorAll<HTMLElement>(TWEET_SELECTOR).forEach((article) => {
      this.pendingArticles.add(article);
    });
  }

  private schedule(): void {
    if (!this.contentReady || this.pendingArticles.size === 0 || this.rafId !== null) return;
    this.rafId = requestAnimationFrame(() => {
      this.rafId = null;
      this.processPending();
    });
  }

  private processPending(): void {
    const handles = new Set<string>();
    for (const article of this.pendingArticles) {
      if (this.scannedArticles.has(article)) continue;
      const data = extractArticleDataFromFiber(article);
      if (!data) continue;
      this.scannedArticles.add(article);
      const handle = data?.following ? data.handle.toLowerCase() : null;
      if (handle && !this.reportedHandles.has(handle)) handles.add(handle);
    }
    this.pendingArticles.clear();
    if (handles.size === 0) return;
    for (const handle of handles) this.rememberHandle(handle);
    this.onHandles([...handles]);
  }

  private rememberHandle(handle: string): void {
    if (this.reportedHandles.has(handle)) return;
    if (this.reportedHandles.size >= MAX_REPORTED_HANDLES) {
      const oldest = this.reportedHandles.values().next().value;
      if (oldest !== undefined) this.reportedHandles.delete(oldest);
    }
    this.reportedHandles.add(handle);
  }
}
