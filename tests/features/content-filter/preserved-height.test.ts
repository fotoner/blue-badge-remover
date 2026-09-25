import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { hideTweet, showTweet } from '@features/content-filter/tweet-hider';
import { releasePreservedHeights } from '@features/content-filter/preserved-height';

const PRESERVED = 'data-bbr-preserved-height';

function makeTweet(height: number): HTMLElement {
  const el = document.createElement('article');
  el.setAttribute('data-testid', 'tweet');
  el.textContent = 'tweet';
  el.getBoundingClientRect = () => ({ height, top: 0, bottom: height }) as DOMRect;
  document.body.appendChild(el);
  return el;
}

// #43: 뒤로가기/모달 닫기 직후 2초 창에서 숨긴 트윗의 높이가 창 종료 후에도 남아 큰 여백이 생기던 문제
describe('보존 높이 표시와 해제', () => {
  beforeEach(() => { document.body.innerHTML = ''; });
  afterEach(() => { vi.restoreAllMocks(); });

  it('remove 모드에서 높이를 보존하면 해제 대상으로 표시한다', () => {
    const tweet = makeTweet(662);
    hideTweet(tweet, 'remove', { reason: 'retweet', preserveHeight: true });
    expect(tweet.hasAttribute(PRESERVED)).toBe(true);
  });

  it('높이를 보존하지 않은 숨김은 표시하지 않는다', () => {
    const tweet = makeTweet(662);
    hideTweet(tweet, 'remove', { reason: 'retweet' });
    expect(tweet.hasAttribute(PRESERVED)).toBe(false);
  });

  it('해제하면 remove 모드 트윗은 display:none으로 바뀌고 높이·표시가 지워진다', () => {
    const tweet = makeTweet(662);
    hideTweet(tweet, 'remove', { reason: 'retweet', preserveHeight: true });

    releasePreservedHeights();

    expect(tweet.style.display).toBe('none');
    expect(tweet.style.minHeight).toBe('');
    expect(tweet.style.visibility).toBe('');
    expect(tweet.style.pointerEvents).toBe('');
    expect(tweet.hasAttribute(PRESERVED)).toBe(false);
    expect(tweet.getAttribute('data-bbr-original')).toBe('hidden');
  });

  it('해제하면 collapse 모드 플레이스홀더의 보존 높이가 지워진다', () => {
    const tweet = makeTweet(480);
    hideTweet(tweet, 'collapse', { reason: 'fadak', preserveHeight: true });
    const placeholder = tweet.querySelector<HTMLElement>('[data-bbr-collapsed]')!;
    expect(placeholder.style.minHeight).toBe('480px');

    releasePreservedHeights();

    expect(placeholder.style.minHeight).toBe('');
    expect(tweet.hasAttribute(PRESERVED)).toBe(false);
    expect(tweet.getAttribute('data-bbr-original')).toBe('collapsed');
  });

  it('showTweet은 보존 표시도 지운다', () => {
    const tweet = makeTweet(662);
    hideTweet(tweet, 'remove', { reason: 'retweet', preserveHeight: true });
    showTweet(tweet);
    expect(tweet.hasAttribute(PRESERVED)).toBe(false);
  });

  // X 타임라인이 셀 크기 변화에 맞춰 스스로 스크롤을 조정한다 — 여기서 또 보정하면 이중 보정으로 맨 위까지 튄다
  it('해제는 스크롤을 직접 조작하지 않는다', () => {
    const hidden = makeTweet(662);
    hideTweet(hidden, 'remove', { reason: 'retweet', preserveHeight: true });
    const below = makeTweet(300);
    below.getBoundingClientRect = () => {
      const top = hidden.style.display === 'none' ? 138 : 800;
      return { top, bottom: top + 300 } as DOMRect;
    };
    const scrollBy = vi.spyOn(window, 'scrollBy').mockImplementation(() => {});
    const scrollTo = vi.spyOn(window, 'scrollTo').mockImplementation(() => {});

    releasePreservedHeights();

    expect(hidden.style.display).toBe('none');
    expect(scrollBy).not.toHaveBeenCalled();
    expect(scrollTo).not.toHaveBeenCalled();
  });

  it('보존된 트윗이 없으면 아무것도 바꾸지 않는다', () => {
    const tweet = makeTweet(300);
    releasePreservedHeights();
    expect(tweet.getAttribute('style')).toBeNull();
  });
});
