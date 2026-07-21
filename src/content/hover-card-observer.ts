import { TIMINGS } from '@shared/constants';
import type { ProfileInfo, Settings } from '@shared/types';

const HOVER_CARD_SELECTOR = '[data-testid="HoverCard"]';

interface HoverCardData {
  handle: string;
  bio: string;
}

export function shouldObserveHoverCards(settings: Settings, protectedKeywords: readonly string[]): boolean {
  return settings.keywordFilterEnabled || settings.keywordCollectorEnabled || protectedKeywords.length > 0;
}

export function mergeHoverCardBio(
  profile: ProfileInfo | undefined,
  handle: string,
  bio: string,
): ProfileInfo {
  if (profile?.bio) return profile;
  return {
    ...profile,
    handle: profile?.handle ?? handle,
    displayName: profile?.displayName ?? handle,
    bio,
  };
}

function extractHoverCardData(card: HTMLElement): HoverCardData | null {
  const bio = card.querySelector('[data-testid="UserDescription"]')?.textContent?.trim() ?? '';
  const href = card.querySelector('a[role="link"][href^="/"]')?.getAttribute('href') ?? '';
  const handle = href.slice(1).split('/')[0]?.toLowerCase() ?? '';
  if (!bio || !handle || handle === 'i' || href.includes('/status/')) return null;
  return { handle, bio };
}

export class HoverCardObserver {
  private observer: MutationObserver | null = null;
  private readonly innerObservers = new Set<MutationObserver>();
  private readonly timeoutIds = new Set<ReturnType<typeof setTimeout>>();

  constructor(private readonly onBio: (handle: string, bio: string) => void) {}

  sync(enabled: boolean, container: Element): void {
    if (!enabled) {
      this.stop();
      return;
    }
    if (this.observer) return;
    this.observer = new MutationObserver((mutations) => {
      for (const mutation of mutations) {
        for (const node of mutation.addedNodes) this.processNode(node);
      }
    });
    this.observer.observe(container, { childList: true, subtree: true });
  }

  stop(): void {
    this.observer?.disconnect();
    this.observer = null;
    for (const observer of this.innerObservers) observer.disconnect();
    this.innerObservers.clear();
    for (const timeoutId of this.timeoutIds) clearTimeout(timeoutId);
    this.timeoutIds.clear();
  }

  private processNode(node: Node): void {
    if (!(node instanceof HTMLElement)) return;
    const card = node.matches(HOVER_CARD_SELECTOR)
      ? node
      : node.querySelector<HTMLElement>(HOVER_CARD_SELECTOR);
    if (card) this.waitForBio(card);
  }

  private waitForBio(card: HTMLElement): void {
    if (this.emitBio(card)) return;
    const observer = new MutationObserver(() => {
      if (this.emitBio(card)) this.disconnectInner(observer);
    });
    this.innerObservers.add(observer);
    observer.observe(card, { childList: true, subtree: true });
    const timeoutId = setTimeout(() => {
      this.timeoutIds.delete(timeoutId);
      this.disconnectInner(observer);
    }, TIMINGS.HOVER_CARD_TIMEOUT);
    this.timeoutIds.add(timeoutId);
  }

  private emitBio(card: HTMLElement): boolean {
    const data = extractHoverCardData(card);
    if (!data) return false;
    this.onBio(data.handle, data.bio);
    return true;
  }

  private disconnectInner(observer: MutationObserver): void {
    observer.disconnect();
    this.innerObservers.delete(observer);
  }
}
