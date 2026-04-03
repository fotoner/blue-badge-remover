// tests/content/navigation.test.ts
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { setOnNavigate, onNavigate, listenForNavigation } from '../../src/content/navigation';

describe('navigation', () => {
  let originalPushState: typeof history.pushState;
  let originalReplaceState: typeof history.replaceState;

  beforeEach(() => {
    vi.useFakeTimers();
    originalPushState = history.pushState;
    originalReplaceState = history.replaceState;
    // Reset callback to no-op before each test
    setOnNavigate(() => {});
  });

  afterEach(() => {
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
    it('should trigger callback on history.pushState', () => {
      const callback = vi.fn();
      setOnNavigate(callback);
      listenForNavigation();

      history.pushState({}, '', '/new-page');

      expect(callback).toHaveBeenCalled();
    });

    it('should trigger callback on history.replaceState', () => {
      const callback = vi.fn();
      setOnNavigate(callback);
      listenForNavigation();

      history.replaceState({}, '', '/replaced-page');

      expect(callback).toHaveBeenCalled();
    });

    it('should trigger callback on popstate event', () => {
      const callback = vi.fn();
      setOnNavigate(callback);
      listenForNavigation();

      window.dispatchEvent(new PopStateEvent('popstate'));

      expect(callback).toHaveBeenCalled();
    });

    it('should preserve original pushState behavior', () => {
      const callback = vi.fn();
      setOnNavigate(callback);
      listenForNavigation();

      history.pushState({ key: 'value' }, '', '/preserved');

      expect(window.location.pathname).toBe('/preserved');
      expect(history.state).toEqual({ key: 'value' });
    });

    it('should preserve original replaceState behavior', () => {
      const callback = vi.fn();
      setOnNavigate(callback);
      listenForNavigation();

      history.replaceState({ replaced: true }, '', '/replaced-state');

      expect(window.location.pathname).toBe('/replaced-state');
      expect(history.state).toEqual({ replaced: true });
    });
  });
});
