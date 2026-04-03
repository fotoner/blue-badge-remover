// src/injected/data-extractors.ts
// fetch-interceptor에서 사용하는 순수 데이터 추출 함수.
// MAIN world에서 번들링되므로 @shared 경로 사용 불가 — 로컬 import만 허용.

export function findUserObjects(obj: unknown, result: Array<Record<string, unknown>>): void {
  if (obj === null || typeof obj !== 'object') return;

  const record = obj as Record<string, unknown>;
  if ('rest_id' in record && 'is_blue_verified' in record) {
    result.push({
      rest_id: record['rest_id'],
      is_blue_verified: record['is_blue_verified'],
      verified_type: record['verified_type'],
      legacy: record['legacy'],
      core: record['core'],
    });
  }

  for (const value of Object.values(record)) {
    if (Array.isArray(value)) {
      value.forEach((item) => findUserObjects(item, result));
    } else if (typeof value === 'object') {
      findUserObjects(value, result);
    }
  }
}

export function findFollowedHandles(obj: unknown, result: string[]): void {
  if (obj === null || typeof obj !== 'object') return;
  const record = obj as Record<string, unknown>;

  // X Following API 응답에서 screen_name 추출
  if ('user_results' in record) {
    const userResults = record['user_results'] as Record<string, unknown> | null;
    const userResult = userResults?.['result'] as Record<string, unknown> | undefined;
    if (userResult) {
      // screen_name은 legacy 또는 core에 있음
      const legacy = userResult['legacy'] as Record<string, unknown> | undefined;
      const core = (userResult['core'] as Record<string, unknown> | undefined)?.['user_results'] as Record<string, unknown> | undefined;
      const screenName = legacy?.['screen_name'] ?? core?.['screen_name'];
      if (typeof screenName === 'string') {
        result.push(screenName.toLowerCase());
      }
    }
  }

  for (const value of Object.values(record)) {
    if (Array.isArray(value)) {
      value.forEach((item) => findFollowedHandles(item, result));
    } else if (typeof value === 'object') {
      findFollowedHandles(value, result);
    }
  }
}
