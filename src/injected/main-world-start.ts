// MAIN world 스크립트가 document_start에 제때 시작했는지 <html>에 남긴다 (#121).
// 이미 열린 탭에 늦게 들어오면 이 시점에 readyState가 loading이 아니고, X 응답 일부를 놓친다.
import { MAIN_WORLD_START } from '@shared/constants';

export function recordMainWorldStart(doc: Document, version: string): void {
  const root = doc.documentElement;
  if (!root) return;
  root.setAttribute(MAIN_WORLD_START.READY_STATE_ATTR, doc.readyState);
  root.setAttribute(MAIN_WORLD_START.VERSION_ATTR, version);
}
