// src/content/reload-probe.ts
// 팝업의 새로고침 확인 메시지에 응답한다 — 이 탭에서 content script와 MAIN world가 제때 시작했는지 알린다 (#121).
import { browser } from 'wxt/browser';
import { MAIN_WORLD_START, MESSAGE_TYPES } from '@shared/constants';
import { parseMainWorldStart, type MainWorldStart, type ReloadProbeResponse } from '@shared/utils/reload-probe';

/** 기록이 없거나, 이전 버전 MAIN world가 남긴 기록이면 null */
export function readMainWorldStart(doc: Document, manifestVersion: string): MainWorldStart | null {
  const root = doc.documentElement;
  const start = parseMainWorldStart({
    readyState: root.getAttribute(MAIN_WORLD_START.READY_STATE_ATTR),
    version: root.getAttribute(MAIN_WORLD_START.VERSION_ATTR),
  });
  return start && start.version === manifestVersion ? start : null;
}

function isReloadProbe(message: unknown): boolean {
  return typeof message === 'object' && message !== null && (message as Record<string, unknown>)['type'] === MESSAGE_TYPES.RELOAD_PROBE;
}

/** init의 첫 await보다 앞에서 부른다 — 초기화가 끝나기 전에 온 확인에도 응답해야 한다 */
export function listenForReloadProbe(): void {
  browser.runtime.onMessage.addListener((message, _sender, sendResponse) => {
    if (!isReloadProbe(message)) return;
    const response: ReloadProbeResponse = {
      mainWorldStart: readMainWorldStart(document, browser.runtime.getManifest().version),
    };
    sendResponse(response);
  });
}
