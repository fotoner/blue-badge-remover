// 팝업 ↔ content script 새로고침 확인 메시지의 응답 형식과 경계 검증 (#121)

export interface MainWorldStart {
  readyState: DocumentReadyState;
  version: string;
}

export interface ReloadProbeResponse {
  /** MAIN world 스크립트가 시작 시점을 남기지 않았거나 버전이 다르면 null */
  mainWorldStart: MainWorldStart | null;
}

const READY_STATES: readonly string[] = ['loading', 'interactive', 'complete'];

function isRecord(raw: unknown): raw is Record<string, unknown> {
  return typeof raw === 'object' && raw !== null;
}

export function parseMainWorldStart(raw: unknown): MainWorldStart | null {
  if (!isRecord(raw)) return null;
  const { readyState, version } = raw;
  if (typeof readyState !== 'string' || !READY_STATES.includes(readyState)) return null;
  if (typeof version !== 'string' || version === '') return null;
  return { readyState: readyState as DocumentReadyState, version };
}

/** 응답 형식이 아니면 null — 호출한 쪽이 메시지 실패로 다룬다 */
export function parseReloadProbeResponse(raw: unknown): ReloadProbeResponse | null {
  if (!isRecord(raw) || !('mainWorldStart' in raw)) return null;
  if (raw['mainWorldStart'] === null) return { mainWorldStart: null };
  const start = parseMainWorldStart(raw['mainWorldStart']);
  return start ? { mainWorldStart: start } : null;
}
