// src/content/tweet-processing.ts
// DOM-level tweet parsing utilities used by processTweet in content/index.ts

export function extractTweetAuthor(tweetEl: HTMLElement): { handle: string; userId: string } | null {
  const allLinks = tweetEl.querySelectorAll('a[role="link"][href^="/"]');
  for (const link of allLinks) {
    const text = link.textContent ?? '';
    if (/재게시함|Retweeted|reposted/i.test(text)) continue;
    const href = link.getAttribute('href');
    if (!href) continue;
    const handle = href.slice(1).split('/')[0];
    if (!handle || handle === 'i' || handle === 'hashtag' || href.includes('/status/') || href.includes('/photo/')) continue;
    return { handle, userId: handle };
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

export function findQuoteBlock(tweetEl: HTMLElement): HTMLElement | null {
  const allNodes = tweetEl.querySelectorAll('div, span');
  for (const node of allNodes) {
    if (node.childNodes.length === 1 && node.textContent?.trim() === '인용') {
      const next = node.nextElementSibling as HTMLElement | null;
      if (next) return next;
    }
  }
  for (const node of allNodes) {
    if (node.childNodes.length === 1 && node.textContent?.trim() === 'Quote') {
      const next = node.nextElementSibling as HTMLElement | null;
      if (next) return next;
    }
  }
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

/**
 * Reads bio (legacy.description) directly from the React fiber tree attached to the tweet element.
 * This is more reliable than intercepting fetch, since React already has the data by the time
 * MutationObserver fires.
 */
export function extractBioFromFiber(tweetEl: HTMLElement, handle: string): string {
  const lowerHandle = handle.toLowerCase();
  const fiberKey = Object.keys(tweetEl).find(
    (k) => k.startsWith('__reactFiber') || k.startsWith('__reactInternalInstance'),
  );
  if (!fiberKey) return '';

  // Search memoizedProps recursively for an object where screen_name matches and description exists
  const seenProps = new WeakSet<object>();
  function scanProps(obj: unknown, depth: number): string {
    if (!obj || typeof obj !== 'object' || depth > 50 || seenProps.has(obj)) return '';
    seenProps.add(obj);
    const r = obj as Record<string, unknown>;
    if (
      typeof r['screen_name'] === 'string' &&
      r['screen_name'].toLowerCase() === lowerHandle &&
      typeof r['description'] === 'string'
    ) {
      return r['description'];
    }
    if (Array.isArray(obj)) {
      for (const item of obj) {
        const found = scanProps(item, depth + 1);
        if (found !== '') return found;
      }
      return '';
    }
    let keys: string[];
    try { keys = Object.keys(r); } catch { return ''; }
    for (const key of keys) {
      let v: unknown;
      try { v = r[key]; } catch { continue; }
      if (v && typeof v === 'object') {
        const found = scanProps(v, depth + 1);
        if (found !== '') return found;
      }
    }
    return '';
  }

  // Walk fiber nodes (child → sibling), scanning memoizedProps at each node
  const seenFiber = new WeakSet<object>();
  function walkFiber(node: unknown, depth: number): string {
    if (!node || typeof node !== 'object' || depth > 80 || seenFiber.has(node)) return '';
    seenFiber.add(node);
    const fiber = node as Record<string, unknown>;
    try {
      const props = fiber['memoizedProps'];
      if (props && typeof props === 'object') {
        const bio = scanProps(props, 0);
        if (bio !== '') return bio;
      }
      return walkFiber(fiber['child'], depth + 1) || walkFiber(fiber['sibling'], depth + 1);
    } catch {
      return '';
    }
  }

  return walkFiber((tweetEl as unknown as Record<string, unknown>)[fiberKey], 0);
}

export function extractDisplayName(tweetEl: HTMLElement, handle: string): string | null {
  const links = tweetEl.querySelectorAll('a[role="link"]');
  for (const link of links) {
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
 * a verified badge. Used by the keyword collector to avoid collecting non-파딱 accounts
 * that happen to quote a 파딱 (whose badge would otherwise appear inside the same article).
 */
export function hasBadgeInAuthorArea(tweetEl: HTMLElement): boolean {
  const userNameEl = tweetEl.querySelector('[data-testid="User-Name"]');
  return !!(userNameEl ?? tweetEl).querySelector('[data-testid="icon-verified"]');
}

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
