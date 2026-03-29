// src/content/navigation.ts

type NavigateCallback = () => void;
let onNavigateCallback: NavigateCallback = () => {};

export function setOnNavigate(callback: NavigateCallback): void {
  onNavigateCallback = callback;
}

export function onNavigate(): void {
  onNavigateCallback();
}

export function listenForNavigation(): void {
  const originalPushState = history.pushState;
  history.pushState = function (...args: Parameters<typeof history.pushState>) {
    originalPushState.apply(this, args);
    onNavigate();
  };
  const originalReplaceState = history.replaceState;
  history.replaceState = function (...args: Parameters<typeof history.replaceState>) {
    originalReplaceState.apply(this, args);
    onNavigate();
  };
  window.addEventListener('popstate', onNavigate);

  // URL polling fallback (X SPA may bypass history API)
  let lastUrl = window.location.href;
  setInterval(() => {
    if (window.location.href !== lastUrl) {
      lastUrl = window.location.href;
      onNavigate();
    }
  }, 500);
}
