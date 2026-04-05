# Codex Code Review — feat/intelligence-layer

- **날짜**: 2026-04-05
- **브랜치**: `feat/intelligence-layer` (base: `dev`)
- **리뷰어**: OpenAI Codex (via `/codex review`)
- **검증**: Claude Code (소스 직접 확인)
- **변경 규모**: 59 files changed, +3,487 / -860 lines
- **GATE**: FAIL (P1 x 2, P2 x 1)

---

## 요약

이 패치는 몇 가지 기능적 리그레션을 포함하고 있음:
- 필터 팩 변경이 열린 탭에 적용되지 않음
- 일반 `show` 경로가 동일 DOM 노드에 대한 이후 hide를 영구적으로 차단함
- 일별 통계가 사용자의 로컬 날짜가 아닌 UTC 기준으로 기록됨

세 건 모두 사용자에게 직접 영향을 주는 버그이며, 신규 핵심 기능(키워드 필터링, 필터 팩, 대시보드 통계)의 정상 동작에 관련됨.

---

## P1 — showTweet()이 모든 호출에서 expanded 플래그를 설정

| 항목 | 내용 |
|------|------|
| **심각도** | P1 (Critical) |
| **파일** | `src/features/content-filter/tweet-hider.ts:163-166` |
| **관련** | `src/content/tweet-orchestrator.ts:90` |

### 문제

`showTweet()`이 호출될 때마다 `data-bbr-expanded` 속성을 무조건 설정한다. `hideTweet()`은 이 속성이 있으면 즉시 리턴(line 95)하므로, 한번 show된 트윗은 이후 어떤 이유로든 다시 숨길 수 없다.

### 재현 시나리오

1. 프로필 캐시가 없는 상태에서 유료 뱃지 트윗이 타임라인에 로드됨
2. classifier가 바이오 정보 없이 `show`를 반환 → `showTweet()` 호출 → `data-bbr-expanded` 설정
3. `PROFILE_DATA` 메시지로 프로필 캐시 수신 → 바이오에 키워드 매치 발견
4. `reprocessExistingTweets()` 실행 → `hideTweet()` 호출되지만 `EXPANDED_ATTR` 때문에 즉시 리턴
5. 결과: 키워드 필터에 걸려야 할 트윗이 계속 노출됨

### 수정 방향

`showTweet()`에서 `EXPANDED_ATTR` 설정을 제거하고, 사용자가 collapse placeholder를 클릭했을 때만 (hideTweet의 click handler 내부에서) 설정하도록 변경.

```typescript
// Before (tweet-hider.ts:163-166)
export function showTweet(element: HTMLElement): void {
  element.style.display = '';
  element.removeAttribute(ORIGINAL_CONTENT_KEY);
  element.setAttribute(EXPANDED_ATTR, '1');  // ← 문제

// After
export function showTweet(element: HTMLElement): void {
  element.style.display = '';
  element.removeAttribute(ORIGINAL_CONTENT_KEY);
  // EXPANDED_ATTR는 사용자 클릭 시에만 설정 (hideTweet click handler)
```

---

## P1 — filterPacks storage 변경이 열린 탭에 반영되지 않음

| 항목 | 내용 |
|------|------|
| **심각도** | P1 (Critical) |
| **파일** | `src/features/filter-pack/pack-storage.ts:13-15` |
| **관련** | `src/content/storage-listener.ts`, `src/shared/constants/index.ts:22-32` |

### 문제

`pack-storage.ts`의 `writeEntries()`가 `filterPacks` 키로 storage에 쓰지만, `storage-listener.ts`는 이 키의 변경을 감지하지 않는다. `STORAGE_KEYS` 상수에도 `FILTER_PACKS` 항목이 없다.

현재 감지하는 키:
- `CUSTOM_FILTER_LIST` (line 27)
- `DISABLED_FILTER_CATEGORIES` (line 30)
- `filterPacks` — **누락**

### 영향

옵션 페이지에서 필터 팩을 활성화/비활성화/삭제해도, 이미 열린 X 탭에는 변경이 반영되지 않음. 사용자 입장에서 필터 팩 기능이 "작동하지 않는 것"처럼 보임. 페이지를 새로고침해야 적용됨.

### 수정 방향

1. `STORAGE_KEYS`에 `FILTER_PACKS: 'filterPacks'` 추가
2. `storage-listener.ts`에 `filterPacks` 변경 핸들러 추가:

```typescript
if (changes[STORAGE_KEYS.FILTER_PACKS]) {
  void loadFilterRules().then(() => { restoreHiddenTweets(); reprocessExistingTweets(); });
}
```

---

## P2 — 일별 통계가 UTC 기준으로 기록됨

| 항목 | 내용 |
|------|------|
| **심각도** | P2 (Medium) |
| **파일** | `src/features/stats/stats-storage.ts:9-10` |

### 문제

```typescript
function todayKey(): string {
  return KEY_PREFIX + new Date().toISOString().slice(0, 10);
}
```

`toISOString()`은 UTC 기준 날짜를 반환한다. 한국 사용자(UTC+9) 기준으로 매일 오전 9시에 통계 날짜가 바뀜. `오늘` 통계가 자정이 아닌 오전 9시에 리셋되어 혼란을 줌.

### 영향

- 자정~오전 9시 사이에 숨긴 트윗 통계가 "어제"로 기록됨
- 팝업/대시보드의 `오늘` 카운트가 사용자 체감 날짜와 불일치
- 30일 히스토리 차트의 날짜 경계가 어긋남

### 수정 방향

로컬 타임존 기반 날짜 문자열 사용:

```typescript
function todayKey(): string {
  const d = new Date();
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return KEY_PREFIX + `${yyyy}-${mm}-${dd}`;
}
```

---

## 수정 우선순위

| 순서 | 이슈 | 심각도 | 예상 난이도 |
|------|------|--------|------------|
| 1 | showTweet expanded 플래그 | P1 | 낮음 |
| 2 | filterPacks storage listener | P1 | 낮음 |
| 3 | UTC 날짜 키 | P2 | 낮음 |

세 건 모두 수정 난이도가 낮고, 머지 전 반드시 해결이 필요한 이슈임.
