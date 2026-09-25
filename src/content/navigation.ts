type NavigateCallback = () => void;

const NAVIGATION_POLL_MS = 500;
const SCROLL_RESTORATION_WINDOW_MS = 2000;

let onNavigateCallback: NavigateCallback = () => {};
let onScrollRestorationEnd: NavigateCallback = () => {};
let restorationEndTimer: ReturnType<typeof setTimeout> | null = null;
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

/** 높이 보존 창이 끝났을 때 호출 — 보존한 높이를 해제하는 데 쓴다 (#43) */
export function setOnScrollRestorationEnd(callback: NavigateCallback): void {
  onScrollRestorationEnd = callback;
}

function clearRestorationEndTimer(): void {
  if (restorationEndTimer !== null) clearTimeout(restorationEndTimer);
  restorationEndTimer = null;
}

function handlePopState(): void {
  scrollRestorationUntil = Date.now() + SCROLL_RESTORATION_WINDOW_MS;
  clearRestorationEndTimer();
  restorationEndTimer = setTimeout(() => {
    restorationEndTimer = null;
    onScrollRestorationEnd();
  }, SCROLL_RESTORATION_WINDOW_MS);
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
  clearRestorationEndTimer();
  listening = false;
}
