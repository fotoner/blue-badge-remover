// tests/content/navigation.test.ts
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  listenForNavigation,
  onNavigate,
  setOnNavigate,
  stopListeningForNavigation,
} from '../../src/content/navigation';

describe('navigation', () => {
  let originalPushState: typeof history.pushState;
  let originalReplaceState: typeof history.replaceState;

  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-07-22T00:00:00Z'));
    stopListeningForNavigation();
    history.replaceState({}, '', '/');
    originalPushState = history.pushState;
    originalReplaceState = history.replaceState;
    // Reset callback to no-op before each test
    setOnNavigate(() => {});
  });

  afterEach(() => {
    stopListeningForNavigation();
    vi.useRealTimers();
    // Restore original history methods to avoid test pollution
    history.pushState = originalPushState;
    history.replaceState = originalReplaceState;
  });

  describe('setOnNavigate / onNavigate', () => {
    it('should store callback and onNavigate invokes it', () => {
      const callback = vi.fn();
      setOnNavigate(callback);

      onNavigate();

      expect(callback).toHaveBeenCalledOnce();
    });

    it('should replace previous callback when called again', () => {
      const first = vi.fn();
      const second = vi.fn();

      setOnNavigate(first);
      setOnNavigate(second);
      onNavigate();

      expect(first).not.toHaveBeenCalled();
      expect(second).toHaveBeenCalledOnce();
    });
  });

  describe('listenForNavigation', () => {
    // X는 MAIN world에서 pushState를 부르므로 content script(ISOLATED world)의 패치로는 못 잡는다.
    // Navigation API 이벤트는 모든 world에 전달된다 (2026-10 실측).
    function stubNavigation(): EventTarget {
      const nav = new EventTarget();
      Object.defineProperty(window, 'navigation', { value: nav, configurable: true });
      return nav;
    }

    afterEach(() => {
      Reflect.deleteProperty(window, 'navigation');
    });

    it('Navigation API의 currententrychange로 이동을 폴링 없이 바로 감지한다', () => {
      const nav = stubNavigation();
      const callback = vi.fn();
      setOnNavigate(callback);
      listenForNavigation();

      originalPushState.call(history, {}, '', '/new-page');
      nav.dispatchEvent(new Event('currententrychange'));

      expect(callback).toHaveBeenCalledOnce();
    });

    it('Navigation API가 없으면 URL 폴링으로 감지한다', () => {
      const callback = vi.fn();
      setOnNavigate(callback);
      listenForNavigation();

      originalPushState.call(history, {}, '', '/polled');
      expect(callback).not.toHaveBeenCalled();
      vi.advanceTimersByTime(500);

      expect(callback).toHaveBeenCalledOnce();
    });

    it('should trigger callback on popstate event', () => {
      const callback = vi.fn();
      setOnNavigate(callback);
      listenForNavigation();
      originalPushState.call(history, {}, '', '/pop-target');

      window.dispatchEvent(new PopStateEvent('popstate'));

      expect(callback).toHaveBeenCalled();
    });

    it('이벤트로 처리한 URL을 폴링이 다시 처리하지 않는다', () => {
      const nav = stubNavigation();
      const callback = vi.fn();
      setOnNavigate(callback);
      listenForNavigation();

      originalPushState.call(history, {}, '', '/deduped');
      nav.dispatchEvent(new Event('currententrychange'));
      vi.advanceTimersByTime(1000);

      expect(callback).toHaveBeenCalledOnce();
    });

    it('URL이 그대로면 currententrychange가 와도 재처리하지 않는다', () => {
      const nav = stubNavigation();
      const callback = vi.fn();
      setOnNavigate(callback);
      listenForNavigation();

      nav.dispatchEvent(new Event('currententrychange'));

      expect(callback).not.toHaveBeenCalled();
    });

    it('리스너를 멈추면 currententrychange를 더 받지 않는다', () => {
      const nav = stubNavigation();
      const callback = vi.fn();
      setOnNavigate(callback);
      listenForNavigation();
      stopListeningForNavigation();

      originalPushState.call(history, {}, '', '/after-stop');
      nav.dispatchEvent(new Event('currententrychange'));

      expect(callback).not.toHaveBeenCalled();
    });

    it('history 메서드를 바꿔 끼우지 않는다', () => {
      listenForNavigation();

      expect(history.pushState).toBe(originalPushState);
      expect(history.replaceState).toBe(originalReplaceState);
    });
  });
});
