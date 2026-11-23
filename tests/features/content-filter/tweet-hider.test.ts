// tests/features/content-filter/tweet-hider.test.ts
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { hideTweet, hideQuoteBlock, showExpandedTweet, showTweet, showQuoteBlock, setTweetHiderLanguage } from '@features/content-filter/tweet-hider';
import { t, type Language } from '@shared/i18n';

describe('hideTweet', () => {
  let tweetEl: HTMLElement;

  beforeEach(() => {
    tweetEl = document.createElement('article');
    tweetEl.textContent = 'original tweet content';
    document.body.appendChild(tweetEl);
  });

  // #102: 8px 칸이 구분선 두 줄로 눈에 띄어 높이를 0으로 접는다 (#74의 8px를 되돌림)
  it('remove 모드는 내용을 감추고 높이 0으로 접는다', () => {
    hideTweet(tweetEl, 'remove');
    expect(tweetEl.style.display).toBe('');
    expect(tweetEl.style.visibility).toBe('hidden');
    expect(tweetEl.style.height).toBe('0px');
    expect(tweetEl.style.overflow).toBe('hidden');
  });

  it('showTweet은 remove 모드의 숨김 스타일을 모두 되돌린다', () => {
    hideTweet(tweetEl, 'remove');
    showTweet(tweetEl);
    expect(tweetEl.style.visibility).toBe('');
    expect(tweetEl.style.height).toBe('');
    expect(tweetEl.style.overflow).toBe('');
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

  it('펼친 트윗 액션을 article 루트가 아닌 X 기본 액션 바 바로 위에 배치한다', () => {
    tweetEl.innerHTML = `
      <div class="tweet-content-column">
        <div class="tweet-actions-wrapper">
          <div role="group"><button data-testid="reply">답글</button></div>
        </div>
      </div>
    `;
    hideTweet(tweetEl, 'collapse', {
      reason: 'fadak',
      handle: '@fadakuser',
      onWhitelist: vi.fn(),
    });

    tweetEl.querySelector<HTMLElement>('[data-bbr-collapsed]')?.click();

    const nativeActions = tweetEl.querySelector('[data-testid="reply"]')?.closest('[role="group"]');
    const bbrActions = tweetEl.querySelector('[data-bbr-expanded-actions]');
    expect(bbrActions?.nextElementSibling).toBe(nativeActions);
    expect(bbrActions?.parentElement).toBe(nativeActions?.parentElement);
    expect(bbrActions?.parentElement).not.toBe(tweetEl);
  });

  it('펼친 트윗의 화이트리스트 버튼이 콜백을 호출한다', () => {
    const onWhitelist = vi.fn();
    hideTweet(tweetEl, 'collapse', { reason: 'fadak', handle: '@fadakuser', onWhitelist });
    tweetEl.querySelector<HTMLElement>('[data-bbr-collapsed]')?.click();

    tweetEl.querySelector<HTMLButtonElement>('.bbr-whitelist-button')?.click();

    expect(onWhitelist).toHaveBeenCalledOnce();
    expect(tweetEl.hasAttribute('data-bbr-original')).toBe(false);
  });

  it('화이트리스트 저장이 실패하면 버튼을 남겨 다시 시도할 수 있게 한다', async () => {
    const onWhitelist = vi.fn().mockRejectedValue(new Error('storage unavailable'));
    hideTweet(tweetEl, 'collapse', { reason: 'fadak', handle: '@fadakuser', onWhitelist });
    tweetEl.querySelector<HTMLElement>('[data-bbr-collapsed]')?.click();

    tweetEl.querySelector<HTMLButtonElement>('.bbr-whitelist-button')?.click();
    await Promise.resolve();

    expect(onWhitelist).toHaveBeenCalledOnce();
    expect(tweetEl.querySelector('.bbr-whitelist-button')).not.toBeNull();
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

  it('재처리된 펼친 트윗에 액션을 한 번만 다시 붙인다', () => {
    const onWhitelist = vi.fn();
    const onExpandedChange = vi.fn();
    const context = { reason: 'fadak', handle: '@fadakuser', onWhitelist };

    showExpandedTweet(tweetEl, context, onExpandedChange);
    showExpandedTweet(tweetEl, context, onExpandedChange);

    expect(tweetEl.getAttribute('data-bbr-expanded')).toBe('1');
    expect(tweetEl.querySelectorAll('[data-bbr-expanded-actions]')).toHaveLength(1);
    expect(tweetEl.querySelector('.bbr-whitelist-button')).not.toBeNull();
    expect(tweetEl.querySelector('.bbr-collapse-button')).not.toBeNull();
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

  // #94: 같은 article이 타임라인(완전 제거)과 상세(접기)를 오가며 다시 쓰이면 숨김 방식을 맞춘다
  it('완전 제거로 숨긴 트윗을 접기로 다시 숨기면 펼칠 수 있는 접힘 표시로 바뀐다', () => {
    hideTweet(tweetEl, 'remove', { reason: 'fadak', handle: '@fadakuser' });
    hideTweet(tweetEl, 'collapse', { reason: 'fadak', handle: '@fadakuser' });
    expect(tweetEl.getAttribute('data-bbr-original')).toBe('collapsed');
    expect(tweetEl.style.visibility).toBe('');
    expect(tweetEl.style.height).toBe('');
    expect(tweetEl.querySelectorAll('[data-bbr-collapsed]').length).toBe(1);
  });

  it('접기로 숨긴 트윗을 완전 제거로 다시 숨기면 접힘 표시를 걷고 높이 0으로 접는다', () => {
    hideTweet(tweetEl, 'collapse', { reason: 'fadak', handle: '@fadakuser' });
    hideTweet(tweetEl, 'remove', { reason: 'fadak', handle: '@fadakuser' });
    expect(tweetEl.getAttribute('data-bbr-original')).toBe('hidden');
    expect(tweetEl.querySelector('[data-bbr-collapsed]')).toBeNull();
    expect(tweetEl.style.visibility).toBe('hidden');
    expect(tweetEl.style.height).toBe('0px');
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

// 리트위터 표시 이름을 읽지 못하면 주어가 빈 문구('님이 …', 'Retweeted by  from …')가 되지 않아야 한다 (#111)
describe('hideTweet — 리트위터 표시 이름이 없을 때', () => {
  let tweetEl: HTMLElement;

  beforeEach(() => {
    tweetEl = document.createElement('article');
    tweetEl.textContent = 'original tweet content';
    document.body.appendChild(tweetEl);
  });

  afterEach(() => {
    setTweetHiderLanguage('ko');
  });

  function collapsedLabel(): string | undefined {
    return tweetEl.querySelector('[data-bbr-collapsed]')?.textContent ?? undefined;
  }

  it.each<Language>(['ko', 'en', 'ja'])('%s: retweetedBy가 없으면 빈 주어 문구 대신 파딱 작성자 문구를 쓴다', (lang) => {
    setTweetHiderLanguage(lang);
    hideTweet(tweetEl, 'collapse', { reason: 'retweet', handle: '@fadakuser' });
    expect(collapsedLabel()).toBe(t('hiddenTweetFadak', lang, { handle: '@fadakuser' }));
    expect(collapsedLabel()).not.toBe(t('hiddenTweetRetweet', lang, { handle: '@fadakuser', retweetedBy: '' }));
  });

  it.each<Language>(['ko', 'en', 'ja'])('%s: retweetedBy가 공백뿐이어도 파딱 작성자 문구를 쓴다', (lang) => {
    setTweetHiderLanguage(lang);
    hideTweet(tweetEl, 'collapse', { reason: 'retweet', handle: '@fadakuser', retweetedBy: '  ' });
    expect(collapsedLabel()).toBe(t('hiddenTweetFadak', lang, { handle: '@fadakuser' }));
  });

  it.each<Language>(['ko', 'en', 'ja'])('%s: retweetedBy가 있으면 리트위트 문구를 그대로 쓴다', (lang) => {
    setTweetHiderLanguage(lang);
    hideTweet(tweetEl, 'collapse', { reason: 'retweet', handle: '@fadakuser', retweetedBy: '@rt_user' });
    expect(collapsedLabel()).toBe(t('hiddenTweetRetweet', lang, { handle: '@fadakuser', retweetedBy: '@rt_user' }));
  });
});

// xweb 실측 픽스처(#142): 반응 버튼이 data-testid 없이 data-engagement-action이다.
// 펼친 트윗의 액션(화이트리스트·접기)은 반응 줄 바로 위에 들어가야 한다. 못 찾으면 내용 가로줄(flex row)에 끼어 옆으로 밀린다
describe('showExpandedTweet — xweb 트윗 (#142)', () => {
  it('액션을 반응 줄(role=group) 바로 앞에 넣는다', () => {
    document.body.innerHTML = readFileSync(resolve(process.cwd(), 'tests/fixtures/x-dom/xweb-quote-tweet.html'), 'utf8');
    const article = document.querySelector<HTMLElement>('[data-href] > article');
    if (!article) throw new Error('fixture has no xweb tweet article');

    showExpandedTweet(article, { reason: 'fadak', handle: '@user_1' }, undefined);

    const actions = article.querySelector('[data-bbr-expanded-actions]');
    const group = article.querySelector('[data-engagement-action="reply"]')?.closest('[role="group"]');
    expect(actions).not.toBeNull();
    expect(group).not.toBeNull();
    expect(actions?.nextElementSibling).toBe(group);
  });
});

// #142 PR 리뷰(CNT-5): xweb은 바깥 [data-href] 칸에 세로 여백과 구분선이 있다. 안쪽 article만 높이 0으로 접으면 숨긴 자리마다 빈 줄이 남는다
describe('hideTweet — xweb 완전 제거 (#142)', () => {
  function xwebArticle(): HTMLElement {
    const article = document.querySelector<HTMLElement>('[data-href]:not([data-slot]) > article');
    if (!article) throw new Error('fixture has no xweb tweet article');
    return article;
  }

  /** 주입한 스타일에서 바깥 칸의 세로 여백·구분선을 0으로 만드는 규칙의 선택자 */
  function containerRuleSelector(): string | null {
    const css = document.querySelector('[data-bbr-styles]')?.textContent ?? '';
    const rule = /([^{}]+)\{[^}]*padding-top:\s*0 !important;[^}]*border-bottom-width:\s*0 !important;[^}]*\}/.exec(css);
    return rule?.[1]?.trim() ?? null;
  }

  beforeEach(() => {
    document.head.querySelectorAll('[data-bbr-styles]').forEach((style) => style.remove());
    document.body.innerHTML = readFileSync(resolve(process.cwd(), 'tests/fixtures/x-dom/xweb-quote-tweet.html'), 'utf8');
  });

  it('숨긴 트윗의 바깥 칸만 세로 여백과 구분선을 접고, 복원하면 규칙에서 빠진다', () => {
    const article = xwebArticle();
    hideTweet(article, 'remove');

    const selector = containerRuleSelector();
    expect(selector).not.toBeNull();
    expect(Array.from(document.querySelectorAll(selector!))).toEqual([article.parentElement]);

    showTweet(article);
    expect(document.querySelectorAll(selector!)).toHaveLength(0);
  });

  it('접기 모드의 자리표시 칸에는 규칙이 맞지 않는다', () => {
    const article = xwebArticle();
    hideTweet(article, 'collapse');

    const selector = containerRuleSelector();
    expect(selector).not.toBeNull();
    expect(document.querySelectorAll(selector!)).toHaveLength(0);
  });
});

