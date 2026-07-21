type NavigateCallback = () => void;

const NAVIGATION_POLL_MS = 500;
const SCROLL_RESTORATION_WINDOW_MS = 2000;

let onNavigateCallback: NavigateCallback = () => {};
let originalPushState: typeof history.pushState | null = null;
let originalReplaceState: typeof history.replaceState | null = null;
let navigationPollId: ReturnType<typeof setInterval> | null = null;
let lastHandledUrl: string | null = null;
let scrollRestorationUntil = 0;
let listening = false;

export function setOnNavigate(callback: NavigateCallback): void {
  onNavigateCallback = callback;
}

export function onNavigate(): void {
  const currentUrl = window.location.href;
  if (currentUrl === lastHandledUrl) return;
  lastHandledUrl = currentUrl;
  onNavigateCallback();
}

function handlePopState(): void {
  scrollRestorationUntil = Date.now() + SCROLL_RESTORATION_WINDOW_MS;
  onNavigate();
}

export function isScrollRestorationActive(): boolean {
  return Date.now() < scrollRestorationUntil;
}

export function listenForNavigation(): void {
  if (listening) return;
  listening = true;
  lastHandledUrl = window.location.href;
  originalPushState = history.pushState;
  history.pushState = function (...args: Parameters<typeof history.pushState>) {
    originalPushState?.apply(this, args);
    onNavigate();
  };
  originalReplaceState = history.replaceState;
  history.replaceState = function (...args: Parameters<typeof history.replaceState>) {
    originalReplaceState?.apply(this, args);
    onNavigate();
  };
  window.addEventListener('popstate', handlePopState);
  navigationPollId = setInterval(onNavigate, NAVIGATION_POLL_MS);
}

export function stopListeningForNavigation(): void {
  if (originalPushState) history.pushState = originalPushState;
  if (originalReplaceState) history.replaceState = originalReplaceState;
  if (navigationPollId !== null) clearInterval(navigationPollId);
  window.removeEventListener('popstate', handlePopState);
  originalPushState = null;
  originalReplaceState = null;
  navigationPollId = null;
  lastHandledUrl = null;
  scrollRestorationUntil = 0;
  listening = false;
}
