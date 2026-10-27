type NavigateCallback = () => void;

const NAVIGATION_POLL_MS = 500;

let onNavigateCallback: NavigateCallback = () => {};
let originalPushState: typeof history.pushState | null = null;
let originalReplaceState: typeof history.replaceState | null = null;
let navigationPollId: ReturnType<typeof setInterval> | null = null;
let lastHandledUrl: string | null = null;
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
  window.addEventListener('popstate', onNavigate);
  navigationPollId = setInterval(onNavigate, NAVIGATION_POLL_MS);
}

export function stopListeningForNavigation(): void {
  if (originalPushState) history.pushState = originalPushState;
  if (originalReplaceState) history.replaceState = originalReplaceState;
  if (navigationPollId !== null) clearInterval(navigationPollId);
  window.removeEventListener('popstate', onNavigate);
  originalPushState = null;
  originalReplaceState = null;
  navigationPollId = null;
  lastHandledUrl = null;
  listening = false;
}
