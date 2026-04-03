import { logger } from '@shared/utils/logger';
import { MESSAGE_TYPES } from '@shared/constants';

chrome.runtime.onInstalled.addListener(() => {
  logger.info('Blue Badge Remover installed');
});

const isFirefoxAndroid = navigator.userAgent.includes('Firefox') && navigator.userAgent.includes('Android');

// content script → 설정 페이지 열기 요청 처리
// Firefox Android: 현재 탭을 설정 페이지로 전환 (뒤로가기로 복귀 가능)
// 그 외: 새 탭으로 열기
chrome.runtime.onMessage.addListener((message, sender) => {
  if (message.type !== MESSAGE_TYPES.OPEN_SETTINGS) return;
  const settingsUrl = chrome.runtime.getURL('src/popup/index.html');
  if (isFirefoxAndroid && sender.tab?.id != null) {
    void chrome.tabs.update(sender.tab.id, { url: settingsUrl });
  } else {
    void chrome.tabs.create({ url: settingsUrl });
  }
});

// Firefox for Android: 팝업 대신 새 탭으로 열기
// Firefox 모바일에서는 팝업 내 버튼 클릭 시 탭 이동이 비정상적으로 동작하는 문제가 있음
if (navigator.userAgent.includes('Firefox') && navigator.userAgent.includes('Android')) {
  chrome.action.setPopup({ popup: '' });
  chrome.action.onClicked.addListener(() => {
    chrome.tabs.create({ url: chrome.runtime.getURL('src/popup/index.html') });
  });
}
