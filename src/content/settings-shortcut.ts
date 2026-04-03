import { MESSAGE_TYPES } from '@shared/constants';

const INJECTED_ATTR = 'data-bbr-settings-btn';
const PREMIUM_SELECTOR = 'a[href="/i/premium_sign_up"]';

export function injectSettingsShortcut(): void {
  const link = document.querySelector<HTMLAnchorElement>(PREMIUM_SELECTOR);
  if (!link || link.hasAttribute(INJECTED_ATTR)) return;

  link.setAttribute(INJECTED_ATTR, 'true');
  link.removeAttribute('href');
  link.setAttribute('role', 'button');
  link.title = 'Blue Badge Remover';

  link.style.display = 'flex';
  link.style.alignItems = 'center';
  link.style.justifyContent = 'center';

  link.innerHTML = '';
  const img = document.createElement('img');
  img.src = chrome.runtime.getURL('icons/icon48.png');
  img.alt = 'BBR';
  img.style.cssText = 'width:26px;height:26px;border-radius:50%;';
  link.appendChild(img);

  link.addEventListener('click', (e) => {
    e.preventDefault();
    void chrome.runtime.sendMessage({ type: MESSAGE_TYPES.OPEN_SETTINGS });
  });
}

let observer: MutationObserver | null = null;

export function observeSettingsShortcut(): void {
  if (!navigator.userAgent.includes('Firefox') || !navigator.userAgent.includes('Android')) return;
  injectSettingsShortcut();
  if (observer) return;
  observer = new MutationObserver(() => {
    injectSettingsShortcut();
  });
  observer.observe(document.body, { childList: true, subtree: true });
}
