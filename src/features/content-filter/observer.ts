// src/features/content-filter/observer.ts
import { logger } from '@shared/utils/logger';

type TweetCallback = (tweetElement: HTMLElement) => void;

export class FeedObserver {
  private observer: MutationObserver | null = null;
  private container: Element | null = null;
  private onTweetAdded: TweetCallback;
  private pendingTweets: HTMLElement[] = [];
  private rafScheduled = false;

  constructor(onTweetAdded: TweetCallback) {
    this.onTweetAdded = onTweetAdded;
  }

  observe(container: Element): void {
    this.disconnect();
    this.container = container;
    this.observer = new MutationObserver((mutations) => {
      for (const mutation of mutations) {
        for (const node of mutation.addedNodes) {
          if (!(node instanceof HTMLElement)) continue;
          const tweets = node.querySelectorAll('article[data-testid="tweet"]');
          tweets.forEach((tweet) => this.pendingTweets.push(tweet as HTMLElement));
          if (node.matches?.('article[data-testid="tweet"]')) {
            this.pendingTweets.push(node);
          }
        }
      }
      this.scheduleProcessing();
    });
    this.observer.observe(container, { childList: true, subtree: true });
    logger.info('FeedObserver started');
  }

  /**
   * 같은 컨테이너를 이미 관찰 중이면 연결을 유지한다.
   * 끊었다가 다시 붙이는 사이 추가된 트윗은 숨김 전에 그대로 그려진다 (뒤로가기 팝인).
   */
  ensureObserving(container: Element): void {
    if (this.observer && this.container === container) return;
    this.observe(container);
  }

  private scheduleProcessing(): void {
    if (this.rafScheduled) return;
    this.rafScheduled = true;
    requestAnimationFrame(() => {
      this.processPendingTweets();
      this.rafScheduled = false;
    });
  }

  private processPendingTweets(): void {
    const tweets = this.pendingTweets.splice(0);
    for (const tweet of tweets) {
      try {
        this.onTweetAdded(tweet);
      } catch (err) {
        logger.error('Error processing tweet', {
          error: err instanceof Error ? err.message : String(err),
        });
      }
    }
  }

  disconnect(): void {
    if (this.observer) {
      this.observer.disconnect();
      this.observer = null;
      this.container = null;
      this.pendingTweets = [];
      this.rafScheduled = false;
      logger.info('FeedObserver disconnected');
    }
  }
}
