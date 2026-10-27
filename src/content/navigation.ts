type NavigateCallback = () => void;

const NAVIGATION_POLL_MS = 500;

let onNavigateCallback: NavigateCallback = () => {};
let navigationPollId: ReturnType<typeof setInterval> | null = null;
let navigationTarget: EventTarget | null = null;
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

/**
 * X는 MAIN world에서 history.pushState를 부르므로 content script(ISOLATED world)에서
 * 메서드를 바꿔 끼워서는 못 잡는다. Navigation API 이벤트는 모든 world에 전달되므로
 * 앞으로 가는 이동도 바로 감지된다. API가 없는 브라우저는 popstate + 폴링으로 감지한다.
 */
function getNavigationTarget(): EventTarget | null {
  return (window as Window & { navigation?: EventTarget }).navigation ?? null;
}

export function listenForNavigation(): void {
  if (listening) return;
  listening = true;
  lastHandledUrl = window.location.href;
  navigationTarget = getNavigationTarget();
  navigationTarget?.addEventListener('currententrychange', onNavigate);
  window.addEventListener('popstate', onNavigate);
  navigationPollId = setInterval(onNavigate, NAVIGATION_POLL_MS);
}

export function stopListeningForNavigation(): void {
  navigationTarget?.removeEventListener('currententrychange', onNavigate);
  if (navigationPollId !== null) clearInterval(navigationPollId);
  window.removeEventListener('popstate', onNavigate);
  navigationTarget = null;
  navigationPollId = null;
  lastHandledUrl = null;
  listening = false;
}
