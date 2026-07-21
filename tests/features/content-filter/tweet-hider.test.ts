// tests/features/content-filter/tweet-hider.test.ts
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { hideTweet, hideQuoteBlock, showTweet, showQuoteBlock } from '@features/content-filter/tweet-hider';

describe('hideTweet', () => {
  let tweetEl: HTMLElement;

  beforeEach(() => {
    tweetEl = document.createElement('article');
    tweetEl.textContent = 'original tweet content';
    document.body.appendChild(tweetEl);
  });

  it('should hide tweet with display:none in remove mode', () => {
    hideTweet(tweetEl, 'remove');
    expect(tweetEl.style.display).toBe('none');
  });

  it('뒤로가기 복원 창의 remove 모드는 원래 높이를 빈 공간으로 보존한다', () => {
    tweetEl.getBoundingClientRect = () => ({ height: 320 }) as DOMRect;

    hideTweet(tweetEl, 'remove', { reason: 'fadak', preserveHeight: true });

    expect(tweetEl.style.display).toBe('');
    expect(tweetEl.style.visibility).toBe('hidden');
    expect(tweetEl.style.minHeight).toBe('320px');
  });

  it('높이 보존된 트윗을 표시하면 임시 레이아웃 스타일을 제거한다', () => {
    tweetEl.getBoundingClientRect = () => ({ height: 240 }) as DOMRect;
    hideTweet(tweetEl, 'remove', { reason: 'fadak', preserveHeight: true });

    showTweet(tweetEl);

    expect(tweetEl.style.visibility).toBe('');
    expect(tweetEl.style.minHeight).toBe('');
  });

  it('뒤로가기 복원 창의 collapse placeholder도 원래 높이를 보존한다', () => {
    tweetEl.getBoundingClientRect = () => ({ height: 180 }) as DOMRect;

    hideTweet(tweetEl, 'collapse', { reason: 'fadak', preserveHeight: true });

    const placeholder = tweetEl.querySelector<HTMLElement>('[data-bbr-collapsed]');
    expect(placeholder?.style.minHeight).toBe('180px');
  });

  it('should replace content with collapsed placeholder in collapse mode', () => {
    hideTweet(tweetEl, 'collapse');
    expect(tweetEl.style.display).not.toBe('none');
    const placeholder = tweetEl.querySelector('[data-bbr-collapsed]');
    expect(placeholder).not.toBeNull();
  });

  it('should restore tweet when showTweet is called', () => {
    hideTweet(tweetEl, 'remove');
    showTweet(tweetEl);
    expect(tweetEl.style.display).not.toBe('none');
  });

  it('should not hide already hidden tweet', () => {
    hideTweet(tweetEl, 'collapse');
    const firstPlaceholder = tweetEl.querySelector('[data-bbr-collapsed]');
    hideTweet(tweetEl, 'collapse');
    const placeholders = tweetEl.querySelectorAll('[data-bbr-collapsed]');
    expect(placeholders.length).toBe(1);
    expect(firstPlaceholder).toBe(placeholders[0]);
  });

  it('should show fadak context in collapse mode', () => {
    hideTweet(tweetEl, 'collapse', { reason: 'fadak', handle: '@fadakuser' });
    const placeholder = tweetEl.querySelector('[data-bbr-collapsed]');
    expect(placeholder?.textContent).toContain('@fadakuser');
    expect(placeholder?.textContent).toContain('파딱');
  });

  it('접힌 카드에는 화이트리스트 버튼을 미리 표시하지 않는다', () => {
    const onWhitelist = vi.fn();
    hideTweet(tweetEl, 'collapse', { reason: 'fadak', handle: '@fadakuser', onWhitelist });

    const placeholder = tweetEl.querySelector('[data-bbr-collapsed]');
    expect(placeholder?.querySelector('.bbr-whitelist-button')).toBeNull();
    expect(onWhitelist).not.toHaveBeenCalled();
  });

  it('펼친 트윗 하단에 화이트리스트와 다시 접기 액션을 표시한다', () => {
    const onWhitelist = vi.fn();
    const onExpandedChange = vi.fn();
    hideTweet(
      tweetEl,
      'collapse',
      { reason: 'fadak', handle: '@fadakuser', onWhitelist },
      onExpandedChange,
    );

    tweetEl.querySelector<HTMLElement>('[data-bbr-collapsed]')?.click();

    const actions = tweetEl.querySelector('[data-bbr-expanded-actions]');
    expect(actions?.querySelector('.bbr-whitelist-button')?.textContent).toContain('화이트리스트');
    expect(actions?.querySelector('.bbr-collapse-button')?.textContent).toBe('다시 접기');
    expect(tweetEl.getAttribute('data-bbr-expanded')).toBe('1');
    expect(onExpandedChange).toHaveBeenCalledWith(tweetEl, true);
  });

  it('펼친 트윗의 화이트리스트 버튼이 콜백을 호출한다', () => {
    const onWhitelist = vi.fn();
    hideTweet(tweetEl, 'collapse', { reason: 'fadak', handle: '@fadakuser', onWhitelist });
    tweetEl.querySelector<HTMLElement>('[data-bbr-collapsed]')?.click();

    tweetEl.querySelector<HTMLButtonElement>('.bbr-whitelist-button')?.click();

    expect(onWhitelist).toHaveBeenCalledOnce();
    expect(tweetEl.hasAttribute('data-bbr-original')).toBe(false);
  });

  it('펼친 트윗의 다시 접기 버튼이 같은 트윗을 접힌 상태로 되돌린다', () => {
    const onExpandedChange = vi.fn();
    hideTweet(tweetEl, 'collapse', { reason: 'fadak', handle: '@fadakuser' }, onExpandedChange);
    tweetEl.querySelector<HTMLElement>('[data-bbr-collapsed]')?.click();

    tweetEl.querySelector<HTMLButtonElement>('.bbr-collapse-button')?.click();

    expect(tweetEl.getAttribute('data-bbr-original')).toBe('collapsed');
    expect(tweetEl.hasAttribute('data-bbr-expanded')).toBe(false);
    expect(tweetEl.querySelector('[data-bbr-expanded-actions]')).toBeNull();
    expect(tweetEl.querySelector('[data-bbr-collapsed]')).not.toBeNull();
    expect(onExpandedChange).toHaveBeenLastCalledWith(tweetEl, false);
  });

  it('should show retweet context in collapse mode', () => {
    hideTweet(tweetEl, 'collapse', { reason: 'retweet', handle: '@fadakuser', retweetedBy: '내 팔로우' });
    const placeholder = tweetEl.querySelector('[data-bbr-collapsed]');
    expect(placeholder?.textContent).toContain('내 팔로우');
    expect(placeholder?.textContent).toContain('@fadakuser');
    expect(placeholder?.textContent).toContain('리트윗');
  });

  it('should show quote-entire context in collapse mode', () => {
    hideTweet(tweetEl, 'collapse', { reason: 'quote-entire', handle: '@fadakuser' });
    const placeholder = tweetEl.querySelector('[data-bbr-collapsed]');
    expect(placeholder?.textContent).toContain('@fadakuser');
    expect(placeholder?.textContent).toContain('인용');
  });

  // --- data-bbr-reason 기록 (A2) ---

  it('remove 모드에서 data-bbr-reason에 context.reason을 기록한다', () => {
    hideTweet(tweetEl, 'remove', { reason: 'quote-entire', handle: '@fadakuser' });
    expect(tweetEl.getAttribute('data-bbr-reason')).toBe('quote-entire');
  });

  it('collapse 모드에서 data-bbr-reason을 기록하고, context 없으면 unknown', () => {
    hideTweet(tweetEl, 'collapse', { reason: 'fadak', handle: '@fadakuser' });
    expect(tweetEl.getAttribute('data-bbr-reason')).toBe('fadak');

    const other = document.createElement('article');
    other.textContent = 'no context';
    document.body.appendChild(other);
    hideTweet(other, 'collapse');
    expect(other.getAttribute('data-bbr-reason')).toBe('unknown');
  });

  it('이미 숨겨진 요소에 다른 reason으로 재호출 시 기존 data-bbr-reason 유지', () => {
    hideTweet(tweetEl, 'collapse', { reason: 'fadak', handle: '@fadakuser' });
    hideTweet(tweetEl, 'collapse', { reason: 'quote-entire', handle: '@fadakuser' });
    expect(tweetEl.getAttribute('data-bbr-reason')).toBe('fadak');
  });

  it('showTweet이 data-bbr-original과 data-bbr-reason을 모두 제거한다', () => {
    hideTweet(tweetEl, 'remove', { reason: 'fadak', handle: '@fadakuser' });
    showTweet(tweetEl);
    expect(tweetEl.hasAttribute('data-bbr-original')).toBe(false);
    expect(tweetEl.hasAttribute('data-bbr-reason')).toBe(false);
    expect(tweetEl.hasAttribute('data-bbr-expanded')).toBe(false);
  });
});

describe('hideQuoteBlock', () => {
  it('should hide quote block and show context', () => {
    const quoteEl = document.createElement('div');
    quoteEl.textContent = 'quoted content';
    document.body.appendChild(quoteEl);

    hideQuoteBlock(quoteEl, { handle: '@fadakuser' });
    const placeholder = quoteEl.querySelector('[data-bbr-collapsed]');
    expect(placeholder).not.toBeNull();
    expect(placeholder?.textContent).toContain('@fadakuser');
    expect(placeholder?.textContent).toContain('인용 트윗이 숨겨졌습니다');
  });

  it('should not hide already hidden quote block', () => {
    const quoteEl = document.createElement('div');
    quoteEl.textContent = 'quoted content';
    hideQuoteBlock(quoteEl, { handle: '@a' });
    hideQuoteBlock(quoteEl, { handle: '@b' });
    const placeholders = quoteEl.querySelectorAll('[data-bbr-collapsed]');
    expect(placeholders.length).toBe(1);
  });
});

describe('showQuoteBlock', () => {
  it('data-bbr-hidden-quote 제거 + placeholder 제거 + 자식 display 복원', () => {
    const quoteEl = document.createElement('div');
    const child = document.createElement('div');
    child.textContent = 'quoted content';
    quoteEl.appendChild(child);
    document.body.appendChild(quoteEl);

    hideQuoteBlock(quoteEl, { handle: '@a' });
    expect(child.style.display).toBe('none');

    showQuoteBlock(quoteEl);
    expect(quoteEl.hasAttribute('data-bbr-hidden-quote')).toBe(false);
    expect(quoteEl.querySelector('[data-bbr-collapsed]')).toBeNull();
    expect(child.style.display).toBe('');
  });
});
