// tests/content/follow-collector.test.ts
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { collectFollowsFromDOM, getMyHandle } from '../../src/content/follow-collector';
import type { FollowCollectorDeps } from '../../src/content/follow-collector';

// Mock chrome.storage.local
const mockChromeStorage: Record<string, unknown> = {};
vi.stubGlobal('chrome', {
  storage: {
    local: {
      get: vi.fn(async (keys: string[]) => {
        const result: Record<string, unknown> = {};
        for (const key of keys) {
          if (key in mockChromeStorage) {
            result[key] = mockChromeStorage[key];
          }
        }
        return result;
      }),
      set: vi.fn(async (data: Record<string, unknown>) => {
        Object.assign(mockChromeStorage, data);
      }),
    },
  },
});

function setPath(path: string): void {
  Object.defineProperty(window, 'location', {
    value: { ...window.location, pathname: path, href: `https://x.com${path}` },
    writable: true,
    configurable: true,
  });
}

function createProfileLink(handle: string): void {
  const link = document.createElement('a');
  link.setAttribute('data-testid', 'AppTabBar_Profile_Link');
  link.setAttribute('href', `/${handle}`);
  document.body.appendChild(link);
}

describe('getMyHandle', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
  });

  it('should return null when no profile link exists', () => {
    expect(getMyHandle()).toBeNull();
  });

  it('should return lowercase handle from profile link', () => {
    createProfileLink('MyHandle');
    expect(getMyHandle()).toBe('myhandle');
  });
});

describe('collectFollowsFromDOM - guard: myHandle !== pathUser', () => {
  let deps: FollowCollectorDeps;

  beforeEach(() => {
    document.body.innerHTML = '';
    deps = {
      getCurrentSettings: () => ({
        enabled: true,
        filter: { timeline: true, replies: true, search: true },
        hideMode: 'remove',
        retweetFilter: true,
        quoteMode: 'off',
        debugMode: false,
        language: 'ko',
        keywordFilterEnabled: false,
        keywordCollectorEnabled: false,
        defaultFilterEnabled: true,
      }),
      setFollowSet: vi.fn(),
    };
  });

  it('should not collect when on another user following page', () => {
    // My handle is "myhandle", but we're on /otheruser/following
    createProfileLink('myhandle');
    setPath('/otheruser/following');

    // collectFollowsFromDOM should return early without creating an observer
    const observeSpy = vi.spyOn(document.body, 'addEventListener');
    collectFollowsFromDOM(deps);

    // No MutationObserver should be set up (we can't directly check this,
    // but we can verify no follow handles are saved)
    expect(deps.setFollowSet).not.toHaveBeenCalled();
  });

  it('should not collect when not on a /following page', () => {
    createProfileLink('myhandle');
    setPath('/home');

    collectFollowsFromDOM(deps);
    expect(deps.setFollowSet).not.toHaveBeenCalled();
  });

  it('should allow collection on own /following page', () => {
    createProfileLink('myhandle');
    setPath('/myhandle/following');

    // This should not return early (observer will be created)
    // We just verify it doesn't throw
    collectFollowsFromDOM(deps);
  });
});
