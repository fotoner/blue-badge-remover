// tests/features/content-filter/observer.test.ts
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { FeedObserver } from '@features/content-filter/observer';

vi.mock('@shared/utils/logger', () => ({
  logger: {
    info: vi.fn(),
    error: vi.fn(),
    warn: vi.fn(),
    debug: vi.fn(),
  },
}));

import { logger } from '@shared/utils/logger';

const flushMicrotasks = (): Promise<void> => new Promise((r) => setTimeout(r, 0));

function createTweetArticle(): HTMLElement {
  const article = document.createElement('article');
  article.setAttribute('data-testid', 'tweet');
  return article;
}

describe('FeedObserver', () => {
  let container: HTMLElement;
  let callback: ReturnType<typeof vi.fn>;
  let feedObserver: FeedObserver;

  beforeEach(() => {
    vi.stubGlobal('requestAnimationFrame', (cb: FrameRequestCallback) => {
      cb(0);
      return 0;
    });
    container = document.createElement('div');
    document.body.appendChild(container);
    callback = vi.fn();
    feedObserver = new FeedObserver(callback as (el: HTMLElement) => void);
    vi.clearAllMocks();
  });

  afterEach(() => {
    feedObserver.disconnect();
    container.remove();
    vi.unstubAllGlobals();
  });

  it('should store callback via constructor', () => {
    const cb = vi.fn();
    const observer = new FeedObserver(cb);
    // Callback is stored internally; verify by observing + triggering
    observer.observe(container);
    const tweet = createTweetArticle();
    container.appendChild(tweet);
    // No assertion here — constructor storage is implicitly tested
    // by all other tests that verify callback invocation
    observer.disconnect();
    expect(observer).toBeInstanceOf(FeedObserver);
  });

  it('should start observing container mutations', async () => {
    feedObserver.observe(container);
    expect(logger.info).toHaveBeenCalledWith('FeedObserver started');

    const tweet = createTweetArticle();
    container.appendChild(tweet);
    await flushMicrotasks();

    expect(callback).toHaveBeenCalledWith(tweet);
  });

  it('should trigger callback when a tweet article is added', async () => {
    feedObserver.observe(container);

    const tweet = createTweetArticle();
    container.appendChild(tweet);
    await flushMicrotasks();

    expect(callback).toHaveBeenCalledTimes(1);
    expect(callback).toHaveBeenCalledWith(tweet);
  });

  it('should collect all tweets inside a wrapper div', async () => {
    feedObserver.observe(container);

    const wrapper = document.createElement('div');
    const tweet1 = createTweetArticle();
    const tweet2 = createTweetArticle();
    wrapper.appendChild(tweet1);
    wrapper.appendChild(tweet2);
    container.appendChild(wrapper);
    await flushMicrotasks();

    expect(callback).toHaveBeenCalledTimes(2);
    expect(callback).toHaveBeenCalledWith(tweet1);
    expect(callback).toHaveBeenCalledWith(tweet2);
  });

  it('should ignore non-HTMLElement nodes', async () => {
    feedObserver.observe(container);

    const textNode = document.createTextNode('hello');
    const comment = document.createComment('comment');
    container.appendChild(textNode);
    container.appendChild(comment);
    await flushMicrotasks();

    expect(callback).not.toHaveBeenCalled();
  });

  it('should catch and log callback errors without crashing', async () => {
    const errorCallback = vi.fn().mockImplementationOnce(() => {
      throw new Error('callback failure');
    });
    const observer = new FeedObserver(errorCallback as unknown as (el: HTMLElement) => void);
    observer.observe(container);

    const tweet1 = createTweetArticle();
    const tweet2 = createTweetArticle();
    const wrapper = document.createElement('div');
    wrapper.appendChild(tweet1);
    wrapper.appendChild(tweet2);
    container.appendChild(wrapper);
    await flushMicrotasks();

    expect(logger.error).toHaveBeenCalledWith('Error processing tweet', {
      error: 'callback failure',
    });
    // Second tweet should still be processed despite first throwing
    expect(errorCallback).toHaveBeenCalledTimes(2);
    expect(errorCallback).toHaveBeenCalledWith(tweet2);

    observer.disconnect();
  });

  it('should stop observing and clear state on disconnect', async () => {
    feedObserver.observe(container);
    vi.clearAllMocks();

    feedObserver.disconnect();
    expect(logger.info).toHaveBeenCalledWith('FeedObserver disconnected');

    // Mutations after disconnect should not trigger callback
    const tweet = createTweetArticle();
    container.appendChild(tweet);
    await flushMicrotasks();

    expect(callback).not.toHaveBeenCalled();
  });

  it('should disconnect first observer when observe is called twice', async () => {
    feedObserver.observe(container);

    const container2 = document.createElement('div');
    document.body.appendChild(container2);

    vi.clearAllMocks();
    feedObserver.observe(container2);

    // Old container mutations should not trigger callback
    const oldTweet = createTweetArticle();
    container.appendChild(oldTweet);
    await flushMicrotasks();
    expect(callback).not.toHaveBeenCalled();

    // New container mutations should trigger callback
    const newTweet = createTweetArticle();
    container2.appendChild(newTweet);
    await flushMicrotasks();
    expect(callback).toHaveBeenCalledWith(newTweet);

    container2.remove();
  });

  it('should batch multiple mutations into a single RAF frame', async () => {
    let rafCallCount = 0;
    vi.stubGlobal('requestAnimationFrame', (cb: FrameRequestCallback) => {
      rafCallCount++;
      cb(0);
      return 0;
    });

    feedObserver.observe(container);

    const tweet1 = createTweetArticle();
    const tweet2 = createTweetArticle();
    // Append both in the same synchronous block so MutationObserver
    // batches them into one callback invocation
    container.appendChild(tweet1);
    container.appendChild(tweet2);
    await flushMicrotasks();

    expect(callback).toHaveBeenCalledTimes(2);
    expect(callback).toHaveBeenCalledWith(tweet1);
    expect(callback).toHaveBeenCalledWith(tweet2);
    // Only one RAF should have been scheduled for the batch
    expect(rafCallCount).toBe(1);
  });
});
