// entrypoints/background.ts — WXT background service worker
import { browser } from 'wxt/browser';
import { logger } from '@shared/utils/logger';
import { MESSAGE_TYPES } from '@shared/constants';
import { shouldUpdate, updateAllPacks } from '@features/filter-pack';
import { cleanupOldStats } from '@features/stats';

const UPDATE_NOTI_FLAG = 'bbr-update-available';

export default defineBackground(() => {
  logger.info('Blue Badge Remover installed');

  const isFirefoxAndroid = navigator.userAgent.includes('Firefox') && navigator.userAgent.includes('Android');

  // MV2/MV3 호환: browser.action (MV3) 또는 browser.browserAction (MV2)
  const actionApi = browser.action ?? (browser as unknown as Record<string, unknown>).browserAction as typeof browser.action | undefined;

  // 확장 설치/업데이트 감지
  browser.runtime.onInstalled.addListener((details) => {
    if (details.reason === 'update') {
      if (!isFirefoxAndroid) {
        void browser.storage.local.set({ [UPDATE_NOTI_FLAG]: true });
      }
    }
  });

  // SW 시작 시 팩 업데이트 체크 + 통계 정리 (alarms 불필요)
  void shouldUpdate().then((needed) => {
    if (needed) void updateAllPacks();
  });
  void cleanupOldStats();

  // content script → 설정 페이지 열기 요청 처리
  browser.runtime.onMessage.addListener((message, sender) => {
    if ((message as Record<string, unknown>).type !== MESSAGE_TYPES.OPEN_SETTINGS) return;
    const settingsUrl = browser.runtime.getURL('/popup.html');
    if (isFirefoxAndroid && sender.tab?.id != null) {
      void browser.tabs.update(sender.tab.id, { url: settingsUrl });
    } else {
      void browser.tabs.create({ url: settingsUrl });
    }
  });

  // Firefox for Android: 팝업 대신 새 탭으로 열기
  if (isFirefoxAndroid && actionApi) {
    actionApi.setPopup({ popup: '' });
    actionApi.onClicked.addListener(() => {
      void browser.tabs.create({ url: browser.runtime.getURL('/popup.html') });
    });
  }
});
