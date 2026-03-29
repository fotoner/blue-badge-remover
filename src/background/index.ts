import { logger } from '@shared/utils/logger';

chrome.runtime.onInstalled.addListener(() => {
  logger.info('Blue Badge Remover installed');
});
