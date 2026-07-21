// src/content/tweet-processing.ts
// DOM-level tweet parsing utilities used by processTweet in content/index.ts

export function extractTweetAuthor(tweetEl: HTMLElement): { handle: string } | null {
  const allLinks = tweetEl.querySelectorAll('a[role="link"][href^="/"]');
  for (const link of allLinks) {
    // socialContext(재게시/고정 등) 내부 링크는 로케일과 무관하게 제외; 텍스트 정규식은 testid 없는 DOM 변형 폴백
    if (link.closest('[data-testid="socialContext"]')) continue;
    const text = link.textContent ?? '';
    if (/재게시함|Retweeted|reposted/i.test(text)) continue;
    const href = link.getAttribute('href');
    if (!href) continue;
    const handle = href.slice(1).split('/')[0];
    if (!handle || handle === 'i' || handle === 'hashtag' || href.includes('/status/') || href.includes('/photo/')) continue;
    return { handle };
  }
  return null;
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

export function extractRetweeterName(tweetEl: HTMLElement): string | null {
  const socialContext = tweetEl.querySelector('[data-testid="socialContext"]');
  if (!socialContext) return null;
  const link = socialContext.querySelector('a[href^="/"]');
  if (link) {
    return link.textContent?.trim() ?? null;
  }
  const text = socialContext.textContent ?? '';
  return text.replace(/\s*(Retweeted|reposted|님이\s*재게시함|님이\s*리트윗함|님이\s*리포스트함|님이\s*리트윗.*|님이\s*리포스트.*).*/i, '').trim() || null;
}

/**
 * socialContext 앵커의 href pathname으로 리트위터 핸들 추출 — 로케일 독립
 * ('재게시함'/'Retweeted' 등 텍스트에 의존하지 않음). 커뮤니티/토픽 링크('/i/...')는 제외.
 */
export function extractRetweeterHandle(tweetEl: HTMLElement): string | null {
  const socialContext = tweetEl.querySelector('[data-testid="socialContext"]');
  if (!socialContext) return null;
  const link = socialContext.querySelector('a[href^="/"]');
  const href = link?.getAttribute('href');
  if (!href) return null;
  const handle = href.slice(1).split(/[/?#]/)[0];
  if (!handle || handle === 'i') return null;
  return handle;
}

export function findQuoteBlock(tweetEl: HTMLElement): HTMLElement | null {
  const ownerDoc = tweetEl.ownerDocument;
  const walker = ownerDoc.createTreeWalker(tweetEl, NodeFilter.SHOW_ELEMENT);
  let enFallback: HTMLElement | null = null;
  let node: Node | null;
  while ((node = walker.nextNode())) {
    const el = node as HTMLElement;
    if ((el.tagName !== 'DIV' && el.tagName !== 'SPAN') || el.childNodes.length !== 1) continue;
    const text = el.textContent?.trim();
    if (text === '인용') {
      const next = el.nextElementSibling as HTMLElement | null;
      if (next) return next;
    }
    if (text === 'Quote' && !enFallback) {
      enFallback = el.nextElementSibling as HTMLElement | null;
    }
  }
  return enFallback;
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

export function extractQuoteAuthor(quoteBlock: HTMLElement): QuoteAuthorInfo | null {
  const text = quoteBlock.textContent ?? '';
  const match = text.match(/^(.+?)@([A-Za-z0-9_]+)/);
  if (match?.[1] && match[2]) {
    return { handle: match[2].toLowerCase(), displayName: match[1].trim() || null };
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


export function extractDisplayName(tweetEl: HTMLElement, handle: string): string | null {
  const links = tweetEl.querySelectorAll('a[role="link"]');
  for (const link of links) {
    // socialContext 내부 링크는 로케일과 무관하게 표시 이름 후보에서 제외
    if (link.closest('[data-testid="socialContext"]')) continue;
    const href = link.getAttribute('href') ?? '';
    if (href === `/${handle}` && !link.textContent?.startsWith('@')) {
      const name = link.textContent?.trim();
      if (name && !/재게시함|Retweeted|reposted/i.test(name)) {
        return name.replace(/\s*(비공개 계정|인증된 계정)$/g, '').trim() || null;
      }
    }
  }
  return null;
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
