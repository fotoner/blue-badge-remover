// src/features/content-filter/tweet-hider.ts
import { t, type Language, DEFAULT_LANGUAGE } from '@shared/i18n';

const ORIGINAL_CONTENT_KEY = 'data-bbr-original';
const COLLAPSED_ATTR = 'data-bbr-collapsed';
const HIDDEN_QUOTE_ATTR = 'data-bbr-hidden-quote';
const STYLE_INJECTED_ATTR = 'data-bbr-styles';

let currentLanguage: Language = DEFAULT_LANGUAGE;

export function setTweetHiderLanguage(lang: Language): void {
  currentLanguage = lang;
}

export interface HideContext {
  reason: 'fadak' | 'retweet' | 'quote-entire';
  handle?: string;
  retweetedBy?: string;
  quotedBy?: string;
}

export interface HideQuoteContext {
  handle?: string;
}

function injectStyles(): void {
  if (document.querySelector(`[${STYLE_INJECTED_ATTR}]`)) return;
  const style = document.createElement('style');
  style.setAttribute(STYLE_INJECTED_ATTR, 'true');
  style.textContent = `
    .bbr-placeholder {
      display: flex;
      align-items: center;
      justify-content: center;
      gap: 8px;
      width: 100%;
      padding: 0;
      margin: 0;
      background: none;
      border: none;
      border-radius: 0;
      color: #536471;
      font-size: 13px;
      cursor: pointer;
      transition: color 0.15s;
      user-select: none;
      -webkit-user-select: none;
      min-height: 48px;
    }
    .bbr-placeholder:hover {
      color: #1d9bf0;
    }
    .bbr-placeholder-icon {
      flex-shrink: 0;
      width: 16px;
      height: 16px;
      opacity: 0.6;
    }
    .bbr-placeholder:hover .bbr-placeholder-icon {
      opacity: 1;
    }
    .bbr-quote-placeholder {
      display: flex;
      align-items: center;
      justify-content: center;
      gap: 6px;
      width: 100%;
      height: 100%;
      padding: 10px 12px;
      background: none;
      border: none;
      border-radius: 0;
      color: #536471;
      font-size: 12px;
      cursor: pointer;
      transition: color 0.15s;
      user-select: none;
      -webkit-user-select: none;
      min-height: 40px;
    }
    .bbr-quote-placeholder:hover {
      color: #1d9bf0;
    }
  `;
  document.head.appendChild(style);
}

const SHIELD_ICON = `<svg class="bbr-placeholder-icon" viewBox="0 0 16 16" fill="currentColor"><path d="M8 1L2 3.5v4c0 3.5 2.6 6.4 6 7.5 3.4-1.1 6-4 6-7.5v-4L8 1zm0 2.2l4 1.7v2.6c0 2.6-1.9 4.8-4 5.7-2.1-.9-4-3.1-4-5.7V4.9l4-1.7z"/></svg>`;

export function hideTweet(element: HTMLElement, mode: 'remove' | 'collapse', context?: HideContext): void {
  if (element.hasAttribute(ORIGINAL_CONTENT_KEY)) return;

  if (mode === 'remove') {
    element.style.display = 'none';
    element.setAttribute(ORIGINAL_CONTENT_KEY, 'hidden');
    return;
  }

  injectStyles();
  element.setAttribute(ORIGINAL_CONTENT_KEY, 'collapsed');
  const originalChildren = Array.from(element.childNodes);
  originalChildren.forEach((child) => {
    if (child instanceof HTMLElement) {
      child.style.display = 'none';
    }
  });

  const label = buildHideLabel(context);
  const placeholder = document.createElement('div');
  placeholder.setAttribute(COLLAPSED_ATTR, 'true');
  placeholder.className = 'bbr-placeholder';
  placeholder.innerHTML = SHIELD_ICON;

  const textSpan = document.createElement('span');
  textSpan.textContent = label;
  placeholder.appendChild(textSpan);

  placeholder.addEventListener('click', () => showTweet(element), { once: true });
  element.appendChild(placeholder);
}

export function hideQuoteBlock(quoteElement: HTMLElement, context?: HideQuoteContext): void {
  if (quoteElement.hasAttribute(HIDDEN_QUOTE_ATTR)) return;

  injectStyles();
  quoteElement.setAttribute(HIDDEN_QUOTE_ATTR, 'true');
  const originalChildren = Array.from(quoteElement.childNodes);
  originalChildren.forEach((child) => {
    if (child instanceof HTMLElement) {
      child.style.display = 'none';
    }
  });

  const handle = context?.handle ?? '';
  const placeholder = document.createElement('div');
  placeholder.setAttribute(COLLAPSED_ATTR, 'true');
  placeholder.className = 'bbr-quote-placeholder';
  placeholder.innerHTML = SHIELD_ICON;

  const textSpan = document.createElement('span');
  textSpan.textContent = t('hiddenQuoteTweet', currentLanguage, { handle });
  placeholder.appendChild(textSpan);

  placeholder.addEventListener('click', () => showQuoteBlock(quoteElement), { once: true });
  quoteElement.appendChild(placeholder);
}

export function showTweet(element: HTMLElement): void {
  element.style.display = '';
  element.removeAttribute(ORIGINAL_CONTENT_KEY);

  const placeholder = element.querySelector(`[${COLLAPSED_ATTR}]`);
  placeholder?.remove();

  Array.from(element.childNodes).forEach((child) => {
    if (child instanceof HTMLElement) {
      child.style.display = '';
    }
  });
}

function showQuoteBlock(element: HTMLElement): void {
  element.removeAttribute(HIDDEN_QUOTE_ATTR);

  const placeholder = element.querySelector(`[${COLLAPSED_ATTR}]`);
  placeholder?.remove();

  Array.from(element.childNodes).forEach((child) => {
    if (child instanceof HTMLElement) {
      child.style.display = '';
    }
  });
}

function buildHideLabel(context?: HideContext): string {
  if (!context) return t('hiddenTweetClick', currentLanguage);

  switch (context.reason) {
    case 'fadak':
      return t('hiddenTweetFadak', currentLanguage, { handle: context.handle ?? '' });
    case 'retweet':
      return t('hiddenTweetRetweet', currentLanguage, {
        retweetedBy: context.retweetedBy ?? '',
        handle: context.handle ?? '',
      });
    case 'quote-entire':
      return t('hiddenTweetQuoteEntire', currentLanguage, {
        quotedBy: context.quotedBy ?? '',
        handle: context.handle ?? '',
      });
    default:
      return t('hiddenTweetClick', currentLanguage);
  }
}
