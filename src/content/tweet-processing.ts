// src/content/tweet-processing.ts
// DOM-level tweet parsing utilities used by processTweet in content/index.ts

import { X_HANDLE_PATTERN } from '@shared/constants';

const SOCIAL_CONTEXT_SELECTOR = '[data-testid="socialContext"]';

/**
 * socialContext(재게시/고정 등) 링크 여부 — 로케일 독립.
 * 2026-10 실측: 리트위터 링크가 socialContext를 바깥에서 감싼다 (<a href="/rt"><span data-testid="socialContext">).
 * 링크가 안쪽에 있던 구조도 함께 처리한다.
 */
function isSocialContextLink(link: Element): boolean {
  return link.closest(SOCIAL_CONTEXT_SELECTOR) !== null || link.querySelector(SOCIAL_CONTEXT_SELECTOR) !== null;
}

const USER_NAME_SELECTOR = '[data-testid="User-Name"]';
const TWEET_TEXT_SELECTOR = '[data-testid="tweetText"]';
const QUOTE_CARD_SELECTOR = 'div[role="link"]';
const AUTHOR_LINK_SELECTOR = 'a[role="link"][href^="/"]';

/**
 * 인용 카드 밖 첫 User-Name — 트윗 자신의 작성자 영역 (findAuthorBadge와 같은 기준).
 * 리트위터·고정 문구 링크는 이 안에 없으므로 문구 정규식 없이 작성자 링크를 가려낼 수 있다 (#111).
 */
function findAuthorUserName(tweetEl: HTMLElement): Element | null {
  const userNames = tweetEl.querySelectorAll(USER_NAME_SELECTOR);
  const first = userNames[0];
  if (!first) return null;
  if (userNames.length === 1) {
    // 일반 트윗은 User-Name이 하나뿐이다. findQuoteBlock의 문구 폴백은 트윗 전체를 순회하므로 부르지 않고,
    // 인용 카드 구조(User-Name을 품은 div[role="link"])만 바로 확인한다 (#111)
    // 라벨 폴백 구조(role 없는 인용 카드)도 조상만 확인해 놓치지 않는다
    const card = first.closest(QUOTE_CARD_SELECTOR);
    if (card && tweetEl.contains(card)) return null;
    // 라벨 후보가 있을 때만 findQuoteBlock이 실제로 고르는 블록인지 확인한다(라벨이 여럿이면 우선순위가 다르다, #111 컨실 r3)
    if (!isInsideLabeledQuote(first, tweetEl)) return first;
    return findQuoteBlock(tweetEl)?.contains(first) ? null : first;
  }
  const quoteBlock = findQuoteBlock(tweetEl);
  for (const userName of userNames) {
    if (!quoteBlock?.contains(userName)) return userName;
  }
  return null;
}

function handleFromLink(link: Element): string | null {
  // socialContext 링크는 화면 언어와 무관하게 testid로 제외한다
  if (isSocialContextLink(link)) return null;
  const href = link.getAttribute('href');
  if (!href) return null;
  const handle = href.slice(1).split('/')[0];
  if (!handle || handle === 'i' || handle === 'hashtag' || href.includes('/status/') || href.includes('/photo/')) return null;
  return handle;
}

function authorHandleFromLinks(links: Iterable<Element>): string | null {
  for (const link of links) {
    const handle = handleFromLink(link);
    if (handle) return handle;
  }
  return null;
}

/**
 * User-Name에서 작성자를 못 찾았을 때 트윗 전체 링크에서 찾는 폴백.
 * 인용 카드 안 링크는 건너뛰고, 정확히 `@핸들`인 텍스트의 링크(CNT-4)를 먼저 본다. 본문 멘션은 그 신호가 아니다 (#111).
 */
function fallbackAuthorHandle(tweetEl: HTMLElement): string | null {
  const quoteBlock = findQuoteBlock(tweetEl);
  const candidates: { handle: string; link: Element }[] = [];
  for (const link of tweetEl.querySelectorAll(AUTHOR_LINK_SELECTOR)) {
    if (quoteBlock?.contains(link)) continue;
    const handle = handleFromLink(link);
    if (handle) candidates.push({ handle, link });
  }
  const exact = candidates.find(({ handle, link }) =>
    link.textContent?.trim().toLowerCase() === `@${handle.toLowerCase()}` && !link.closest(TWEET_TEXT_SELECTOR));
  return (exact ?? candidates[0])?.handle ?? null;
}

export function extractTweetAuthor(tweetEl: HTMLElement): { handle: string } | null {
  // 주 경로: 작성자 영역(User-Name) 안 링크. 없으면 트윗 전체 링크에서 찾는다
  const userName = findAuthorUserName(tweetEl);
  const handle = (userName && authorHandleFromLinks(userName.querySelectorAll(AUTHOR_LINK_SELECTOR)))
    ?? fallbackAuthorHandle(tweetEl);
  return handle ? { handle } : null;
}

export function extractTweetStatusPath(tweetEl: HTMLElement): string | null {
  // <time> 요소의 부모 <a>를 사용 — 인용/사진 링크보다 정확
  const timeEls = tweetEl.querySelectorAll('time');
  for (const timeEl of timeEls) {
    const link = timeEl.closest('a');
    const href = link?.getAttribute('href');
    if (!href || !href.includes('/status/')) continue;
    const match = href.match(/\/\w+\/status\/\d+/);
    if (match) return match[0];
  }
  return null;
}

/**
 * 리트위터 표시 이름 — 화면 언어와 무관하게 구조로 읽는다 (#111).
 * 2026-10 실측: socialContext 안 첫 span[dir]이 이름만 담고, "님이 재게시함"·「さんがリポストしました」 같은 문구는 그 바깥 텍스트다.
 * 이름 span이 없는 구조(고정 문구 등)에서는 문구 텍스트에서 이름을 잘라내지 않고 null을 돌려준다.
 */
export function extractRetweeterName(tweetEl: HTMLElement): string | null {
  const socialContext = tweetEl.querySelector(SOCIAL_CONTEXT_SELECTOR);
  if (!socialContext) return null;
  const nameEl = socialContext.querySelector('[dir]') ?? socialContext.querySelector('a[href^="/"]');
  return nameEl?.textContent?.trim() || null;
}

/**
 * socialContext 앵커의 href pathname으로 리트위터 핸들 추출 — 로케일 독립
 * ('재게시함'/'Retweeted' 등 텍스트에 의존하지 않음). 커뮤니티/토픽 링크('/i/...')는 제외.
 */
export function extractRetweeterHandle(tweetEl: HTMLElement): string | null {
  const socialContext = tweetEl.querySelector(SOCIAL_CONTEXT_SELECTOR);
  if (!socialContext) return null;
  const wrapper = socialContext.closest('a[href^="/"]');
  const link = socialContext.querySelector('a[href^="/"]') ?? (wrapper && tweetEl.contains(wrapper) ? wrapper : null);
  const href = link?.getAttribute('href');
  if (!href) return null;
  const handle = href.slice(1).split(/[/?#]/)[0];
  if (!handle || handle === 'i') return null;
  return handle;
}

export function findQuoteBlock(tweetEl: HTMLElement): HTMLElement | null {
  // 구조 우선 (로케일 무관): 인용 카드는 User-Name을 품은 div[role="link"] (2026-10 실측)
  for (const card of tweetEl.querySelectorAll<HTMLElement>('div[role="link"]')) {
    if (card.querySelector('[data-testid="User-Name"]')) return card;
  }
  // 폴백: '인용'/'Quote' 라벨 다음 형제 — 위 구조가 없는 DOM 변형용.
  // 화면 문구에 기대므로 일본어 등에서는 동작하지 않는다. 구조 신호가 없어 남긴다 (#111, tests/harness/ui-text-patterns.test.ts 허용 목록)
  const ownerDoc = tweetEl.ownerDocument;
  const walker = ownerDoc.createTreeWalker(tweetEl, NodeFilter.SHOW_ELEMENT);
  let enFallback: HTMLElement | null = null;
  let node: Node | null;
  while ((node = walker.nextNode())) {
    const el = node as HTMLElement;
    const label = quoteLabelKind(el);
    if (label === 'ko') {
      const next = el.nextElementSibling as HTMLElement | null;
      if (next) return next;
    }
    if (label === 'en' && !enFallback) {
      enFallback = el.nextElementSibling as HTMLElement | null;
    }
  }
  return enFallback;
}

/** findQuoteBlock 폴백이 쓰는 인용 라벨 판정. 화면 문구에 기대는 곳을 한 군데로 모은다 (#111) */
function quoteLabelKind(el: Element): 'ko' | 'en' | null {
  if ((el.tagName !== 'DIV' && el.tagName !== 'SPAN') || el.childNodes.length !== 1) return null;
  const text = el.textContent?.trim();
  if (text === '인용') return 'ko';
  if (text === 'Quote') return 'en';
  return null;
}

/** 요소가 인용 라벨 바로 다음 형제(=findQuoteBlock 폴백이 고르는 인용 블록) 안에 있는지. 조상만 거슬러 올라가 트윗 전체를 순회하지 않는다 */
function isInsideLabeledQuote(el: Element, tweetEl: HTMLElement): boolean {
  for (let node: Element | null = el; node && node !== tweetEl; node = node.parentElement) {
    const prev = node.previousElementSibling;
    if (prev && quoteLabelKind(prev)) return true;
  }
  return false;
}

/**
 * 작성자 영역의 인증 뱃지 요소 탐색 — 인용 카드 내부 User-Name은 제외 (#35 오귀속 방지).
 * boolean 대신 Element를 반환하므로 호출자가 isBlueBadgeElement로 파딱 여부를 판정할 수 있다.
 * User-Name이 하나도 없는 예외적 DOM에서만 요소 전체 폴백 탐색.
 */
export function findAuthorBadge(tweetEl: HTMLElement): Element | null {
  const userNames = tweetEl.querySelectorAll('[data-testid="User-Name"]');
  const quoteBlock = findQuoteBlock(tweetEl);
  if (userNames.length === 0) {
    // User-Name이 전혀 없는 예외적 DOM — 인용 카드 내부 뱃지는 여전히 제외해야 오귀속 방지
    const candidates = tweetEl.querySelectorAll('[data-testid="icon-verified"]');
    for (const candidate of candidates) {
      if (quoteBlock?.contains(candidate)) continue;
      return candidate;
    }
    return null;
  }
  for (const userName of userNames) {
    if (quoteBlock?.contains(userName)) continue;
    // 첫 번째 비인용 User-Name이 작성자 영역 — 뱃지가 없으면 그대로 null (추가 탐색 안 함)
    return userName.querySelector('[data-testid="icon-verified"]');
  }
  // User-Name이 전부 인용 카드 안 → 외부 작성자는 뱃지 없음 (전체 폴백 금지)
  return null;
}

export interface QuoteAuthorInfo {
  handle: string;
  displayName: string | null;
}

const QUOTE_AVATAR_TESTID_PREFIX = 'UserAvatar-Container-';
const QUOTE_AVATAR_SELECTOR = `[data-testid^="${QUOTE_AVATAR_TESTID_PREFIX}"]`;
const UNKNOWN_AVATAR_HANDLE = 'unknown';
const AT_HANDLE_TEXT_PATTERN = /^@([A-Za-z0-9_]{1,15})$/;
const QUOTE_TEXT_AUTHOR_PATTERN = /^(.+?)@([A-Za-z0-9_]+)/;

/** 인용 카드 아바타의 testid(UserAvatar-Container-{handle})에서 핸들을 읽는다 — 표시 이름과 무관 */
function readQuoteHandleFromAvatar(quoteBlock: HTMLElement): string | null {
  const testId = quoteBlock.querySelector(QUOTE_AVATAR_SELECTOR)?.getAttribute('data-testid');
  const handle = testId?.slice(QUOTE_AVATAR_TESTID_PREFIX.length);
  if (!handle || !X_HANDLE_PATTERN.test(handle) || handle.toLowerCase() === UNKNOWN_AVATAR_HANDLE) return null;
  return handle.toLowerCase();
}

/** User-Name 안에서 텍스트가 정확히 @handle인 span을 읽는다. 표시 이름이 @로 시작할 수 있어 마지막 일치를 쓴다 */
function readQuoteHandleFromUserName(quoteBlock: HTMLElement): string | null {
  let handle: string | null = null;
  for (const span of quoteBlock.querySelectorAll(`${USER_NAME_SELECTOR} span`)) {
    const match = span.textContent?.trim().match(AT_HANDLE_TEXT_PATTERN);
    if (match?.[1]) handle = match[1].toLowerCase();
  }
  return handle;
}

export function extractQuoteAuthor(quoteBlock: HTMLElement): QuoteAuthorInfo | null {
  const text = quoteBlock.textContent ?? '';
  const match = text.match(QUOTE_TEXT_AUTHOR_PATTERN);
  const displayName = match?.[1]?.trim() || null;
  // 표시 이름에 @가 들어갈 수 있으므로(예: 名前@C105) 텍스트 정규식은 DOM 신호가 없을 때만 핸들 폴백으로 쓴다 (#110)
  const domHandle = readQuoteHandleFromAvatar(quoteBlock) ?? readQuoteHandleFromUserName(quoteBlock);
  if (domHandle) return { handle: domHandle, displayName };
  if (match?.[1] && match[2]) {
    return { handle: match[2].toLowerCase(), displayName };
  }
  const links = quoteBlock.querySelectorAll('a[href^="/"]');
  for (const link of links) {
    const linkText = link.textContent ?? '';
    if (linkText.startsWith('@')) {
      return { handle: linkText.slice(1).toLowerCase(), displayName: null };
    }
  }
  for (const link of links) {
    const href = link.getAttribute('href') ?? '';
    const handle = href.slice(1).split('/')[0];
    if (handle && !href.includes('/status/') && !href.includes('/photo/')) {
      return { handle: handle.toLowerCase(), displayName: null };
    }
  }
  return null;
}

export function extractTweetText(tweetEl: HTMLElement): string {
  return tweetEl.querySelector('[data-testid="tweetText"]')?.textContent ?? '';
}


function displayNameFromLinks(links: Iterable<Element>, handle: string): string | null {
  for (const link of links) {
    // socialContext 링크는 화면 언어와 무관하게 표시 이름 후보에서 제외
    if (isSocialContextLink(link)) continue;
    if (link.getAttribute('href') !== `/${handle}` || link.textContent?.startsWith('@')) continue;
    // 접미사 문구 제거는 구조 신호가 없어 남긴 폴백이다 (tests/harness/ui-text-patterns.test.ts 허용 목록)
    const name = link.textContent?.trim().replace(/\s*(비공개 계정|인증된 계정)$/g, '').trim();
    if (name) return name;
  }
  return null;
}

export function extractDisplayName(tweetEl: HTMLElement, handle: string): string | null {
  // 주 경로: 작성자 영역(User-Name) 안 링크라 리트윗 문구 링크와 섞이지 않는다 (#111)
  const userName = findAuthorUserName(tweetEl);
  return (userName && displayNameFromLinks(userName.querySelectorAll('a[role="link"]'), handle))
    ?? displayNameFromLinks(tweetEl.querySelectorAll('a[role="link"]'), handle);
}

/**
 * Returns true only if the tweet's own author area ([data-testid="User-Name"]) contains
 * a verified badge. Delegates to findAuthorBadge — quote-card User-Names are excluded,
 * so a non-파딱 account quoting a 파딱 is never treated as badged.
 */
export function formatUserLabel(handle: string, displayName: string | null): string {
  return displayName ? `${displayName}(@${handle})` : `@${handle}`;
}

export interface DebugInfo {
  handle: string;
  isFadak: boolean;
  isRetweet: boolean;
  hasQuote: boolean;
  inFollow: boolean;
  retweeter?: string;
}

export function addDebugLabel(tweetEl: HTMLElement, info: DebugInfo): void {
  if (tweetEl.querySelector('[data-bbr-debug]')) return;
  const parts: string[] = [];
  parts.push(info.handle);
  if (info.isFadak) parts.push('FADAK');
  if (info.inFollow) parts.push('FOLLOW');
  if (info.isRetweet) parts.push(`RT by ${info.retweeter ?? '?'}`);
  if (info.hasQuote) parts.push('QUOTE');

  const color = info.isFadak ? (info.inFollow ? '#00ba7c' : '#f4212e') : '#71767b';
  const label = document.createElement('div');
  label.setAttribute('data-bbr-debug', 'true');
  label.textContent = `[BBR] ${parts.join(' | ')}`;
  label.style.cssText = `font-size:10px;color:${color};padding:2px 8px;background:rgba(0,0,0,0.6);border-radius:4px;position:relative;z-index:10;`;
  tweetEl.prepend(label);
}
