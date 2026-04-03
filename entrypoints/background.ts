// entrypoints/background.ts — WXT background service worker
import { logger } from '@shared/utils/logger';
import { MESSAGE_TYPES } from '@shared/constants';

export default defineBackground(() => {
  logger.info('Blue Badge Remover installed');

  const isFirefoxAndroid = navigator.userAgent.includes('Firefox') && navigator.userAgent.includes('Android');

  // content script → 설정 페이지 열기 요청 처리
  chrome.runtime.onMessage.addListener((message, sender) => {
    if (message.type !== MESSAGE_TYPES.OPEN_SETTINGS) return;
    const settingsUrl = chrome.runtime.getURL('/popup.html');
    if (isFirefoxAndroid && sender.tab?.id != null) {
      void chrome.tabs.update(sender.tab.id, { url: settingsUrl });
    } else {
      void chrome.tabs.create({ url: settingsUrl });
    }
  });

  // Firefox for Android: 팝업 대신 새 탭으로 열기
  if (isFirefoxAndroid) {
    chrome.action.setPopup({ popup: '' });
    chrome.action.onClicked.addListener(() => {
      chrome.tabs.create({ url: chrome.runtime.getURL('/popup.html') });
    });
  }
});
