// src/content/tweet-rejudge.ts
// 팔로우·화이트리스트가 바뀔 때 다시 판정할 트윗을 고르고, 복원될 숨김 트윗을 숨김 통계 집계에서 되돌린다 (#142 리뷰 r4).
import { unrecordHide } from '@features/stats';
import { TWEET_ARTICLE_SELECTOR } from '@shared/constants';
import { extractTweetStatusPath } from './tweet-processing';

// 숨겼거나(data-bbr-original) 사용자가 펼쳐 둔(data-bbr-expanded) 트윗 요소의 표식. restoreHiddenTweets가 복원하는 대상과 같다
const HIDDEN_TWEET_SELECTOR = '[data-bbr-original], [data-bbr-expanded]';

/** 문서 전체의 숨긴 트윗. <main> 밖(대화상자 등)에 있는 것까지 포함한다 */
export function collectHiddenTweets(): HTMLElement[] {
  return Array.from(document.querySelectorAll<HTMLElement>(HIDDEN_TWEET_SELECTOR))
    .filter((element) => element.matches(TWEET_ARTICLE_SELECTOR));
}

/**
 * 다시 판정할 트윗: <main> 안의 모든 트윗과, <main> 밖이라도 이미 숨긴 트윗.
 * 시한에 숨긴 대화상자 트윗은 작성자가 나중에 팔로우로 알려져도 <main> 안만 훑으면 복원할 길이 없다 (#142 리뷰 r4 S4-3)
 */
export function collectTweetsToRejudge(): HTMLElement[] {
  const feed = document.querySelector('main') ?? document.body;
  const targets = new Set<HTMLElement>(feed.querySelectorAll<HTMLElement>(TWEET_ARTICLE_SELECTOR));
  for (const hidden of collectHiddenTweets()) targets.add(hidden);
  return [...targets];
}

/**
 * 숨겨 둔 트윗을 숨김 통계 집계 버퍼에서 뺀다 (#142 리뷰 r4 S1-1). 숨기지 않은 트윗은 건드리지 않는다.
 * 재판정이 계속 숨기면 applyTweetResult의 recordHide가 다시 세고, 복원하면 빠진 채로 남는다.
 */
export function uncountHiddenTweet(tweet: HTMLElement): void {
  if (!tweet.matches(HIDDEN_TWEET_SELECTOR)) return;
  unrecordHide(tweet, extractTweetStatusPath(tweet));
}
