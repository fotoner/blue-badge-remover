import { POPUP_SOURCE_TAB_PARAM } from '@shared/constants';

/** 팝업 주소 쿼리에서 원래 탭 ID를 읽는다 — 없거나 올바른 정수가 아니면 undefined */
export function parseSourceTabId(search: string): number | undefined {
  const raw = new URLSearchParams(search).get(POPUP_SOURCE_TAB_PARAM);
  if (raw === null || !/^\d+$/.test(raw)) return undefined;
  return Number(raw);
}

export function buildPopupUrl(popupUrl: string, sourceTabId: number | undefined): string {
  if (sourceTabId === undefined) return popupUrl;
  const url = new URL(popupUrl);
  url.searchParams.set(POPUP_SOURCE_TAB_PARAM, String(sourceTabId));
  return url.toString();
}
