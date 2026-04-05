# Pre-Landing Review: feat/intelligence-layer

- **Date**: 2026-04-05
- **Branch**: `feat/intelligence-layer` → `dev`
- **Diff**: 59 files, +3487 / -860 lines
- **Tests**: 294 passed (32 files), tsc clean
- **Reviewers**: Claude structured + Claude adversarial + Testing/Maintainability/Performance specialists

---

## Scope Check: CLEAN

| | |
|---|---|
| **Intent** | Intelligence layer (v1.4.0) — filter packs, stats, dashboard, popup simplification, classifier extraction |
| **Delivered** | 모든 주요 기능 구현 완료 |

주요 변경 요약:
- `tweet-classifier.ts` — 순수 분류 함수 추출 (orchestrator에서 분리)
- `filter-pipeline.ts` — 기본 + 커스텀 + 팩 필터 규칙 병합
- `stats-collector.ts` + `stats-storage.ts` — 숨김 통계 수집 (5초 flush)
- `milestone-banner.ts` — 100/500/1K/5K/10K 축하 배너
- `pack-loader.ts` + `pack-storage.ts` — 필터 팩 CRUD + 자동 업데이트
- Dashboard 페이지 신규 (통계, 설정, 필터 관리)
- Popup 간소화 (토글 + 미니 통계 + 설정 링크)
- `fadak-banner.ts` — 트윗 상세 페이지 배너 추가
- `message-handler.ts` — 캐시 교정 + 선택적 reprocess
- `filter.lists` 필터 스코프 추가

---

## 자동 수정 완료 (3건)

### 1. 화이트리스트 대소문자 불일치

- **파일**: `src/content/tweet-orchestrator.ts:83`
- **문제**: `whitelistSet.has('@' + handle)`로 조회하면서 `toLowerCase()` 미적용. `state.ts`의 `isHandleWhitelisted`는 소문자 변환하므로, 화이트리스트에 `@UserName`으로 등록하고 DOM에서 `username`으로 추출되면 매칭 실패.
- **수정**: `handle.toLowerCase()` 추가

### 2. 매 트윗마다 빈 Set 4개 할당

- **파일**: `src/content/tweet-classifier.ts:65, 80`
- **문제**: `classifyTweet` 호출마다 `new Set<string>()` 4개 생성 (followList, whitelist x2). 스크롤 중 매 트윗에서 불필요한 GC 압력.
- **수정**: 모듈 수준 `EMPTY_SET` 상수로 교체

### 3. expandedSet 미초기화로 영구 필터링 제외

- **파일**: `src/content/tweet-orchestrator.ts:136`
- **문제**: `restoreHiddenTweets()`에서 `_expandedSet`을 초기화하지 않아, 한번 펼친 트윗은 설정 변경 후에도 영구적으로 필터링 제외. 세션 중 무한 성장하여 메모리 누수 가능.
- **수정**: `restoreHiddenTweets()` 시작 시 `getExpandedSet().clear()` 추가

---

## 미해결 이슈 (CRITICAL 3건 + INFORMATIONAL 2건)

### C1. getAllTimeTotal()이 매 5초마다 전체 storage 로드

- **파일**: `src/features/stats/stats-collector.ts:56`
- **심각도**: CRITICAL (confidence: 9/10, multi-source confirmed)
- **원인**: `flushStats` → `onFlushCallback` → `checkMilestone` → `getAllTimeTotal()` → `browser.storage.local.get(null)`. 전체 storage(팔로우 리스트, 설정, 통계, 팩 등)를 5초마다 역직렬화.
- **영향**: 팔로우 수천명 유저에게 메가바이트 급 I/O. 메인 스레드 블로킹으로 스크롤 성능 저하.
- **권장 수정**:
  - `stats-total` 별도 storage key에 누적값 유지
  - flush 시 원자적으로 업데이트
  - `getAllTimeTotal`은 대시보드 로드 시에만 사용

### C2. 자정 경계에서 통계 날짜 오귀속

- **파일**: `src/features/stats/stats-collector.ts:44`
- **심각도**: CRITICAL (confidence: 8/10)
- **원인**: buffer는 생성 시점의 날짜(`2026-04-05`)를 기록하지만, `flushStats`는 `getTodayStats()`로 현재 날짜(`2026-04-06`)의 통계를 읽어 병합. 23:59에 쌓인 카운트가 다음 날로 귀속.
- **영향**: 자정 전후 통계 부정확. 대시보드의 일별 차트에서 날짜 경계 카운트가 왜곡.
- **권장 수정**:
  ```typescript
  // flushStats에서 todayKey() 대신 buffer.date 기준으로 storage key 결정
  const key = KEY_PREFIX + buffer.date;
  const result = await browser.storage.local.get([key]);
  const dayStats = (result[key] as DailyStats | undefined) ?? emptyStats(buffer.date);
  ```

### C3. showTweet이 비숨김 트윗에 불필요한 DOM 조작

- **파일**: `src/content/tweet-orchestrator.ts:89`, `src/features/content-filter/tweet-hider.ts:163`
- **심각도**: CRITICAL (confidence: 8/10)
- **원인**: 팔로우/화이트리스트 파딱의 `classifyTweet` 결과가 `show`일 때 `showTweet(tweetEl)` 호출. 원래 숨겨진 적 없는 트윗에 `EXPANDED_ATTR` 설정 + 모든 자식의 `style.display` 순회.
- **영향**: 스크롤 중 매 팔로우 파딱 트윗마다 불필요한 DOM read/write. Layout thrashing 유발 가능.
- **권장 수정**:
  ```typescript
  if (result.action === 'show') {
    // 이전에 숨겨진 트윗만 복원
    if (tweetEl.hasAttribute('data-bbr-original')) {
      showTweet(tweetEl);
    }
  }
  ```

### I1. filter-section.ts 264줄 dead code

- **파일**: `src/dashboard/filter-section.ts`
- **심각도**: INFORMATIONAL (confidence: 9/10)
- **문제**: `dashboard/index.ts`에서 import하지 않음. dashboard HTML에도 이 모듈이 타겟하는 DOM 요소(`defaultFilterEnabled`, `default-category-list`)가 없음.
- **권장**: 의도적 WIP가 아니면 삭제. 관련 dead exports: `recordShow`, `getStatsRange`, `MilestoneState`, `stopStatsFlush`, `getShareText`.

### I2. 신규 6개 모듈 테스트 커버리지 0%

- **파일**: `stats-collector`, `stats-storage`, `pack-storage`, `pack-loader`, `filter-pipeline`, `milestone-banner`
- **심각도**: INFORMATIONAL (confidence: 9/10)
- **핵심 커버리지 갭**:
  - `pack-loader.ts` — `isNewerVersion` 엣지 케이스 (길이 다른 버전 비교)
  - `stats-storage.ts` — `cleanupOldStats` 경계값 (MAX_DAYS=30)
  - `filter-pipeline.ts` — 팩 로드 실패 시 조용한 무시 경로
  - `stats-collector.ts` — `data-bbr-counted` 중복 방지 + empty buffer 조기 반환
  - `milestone-banner.ts` — 이미 축하한 마일스톤 스킵 로직
  - `pack-storage.ts` — insert/update 분기 + toggleFilterPack guard
- **Prior learning applied**: dashboard-stats-wrong-property-names (confidence 10/10) — 이전에 tsc 없이 커밋해서 P0 크래시 발생한 이력

---

## 추가 참고 사항 (Adversarial Review)

| # | 항목 | 파일 | 위험도 |
|---|------|------|--------|
| A1 | flushStats 멀티탭 race condition (read-modify-write) | stats-collector.ts:41 | Low — 대략적 카운트 허용 시 무시 가능 |
| A2 | pack-storage CRUD 동시성 (read-modify-write) | pack-storage.ts | Low — UI 조작 빈도 낮음 |
| A3 | fetchPack URL 무검증 (CSP로 완화) | pack-loader.ts:22 | Low — Chrome 확장 CSP 제한 |
| A4 | pack rules에 catastrophic backtracking regex 가능 | filter-pipeline.ts | Medium — 악의적 팩 대비 필요 |
| A5 | OPEN_SETTINGS 핸들러가 popup.html 열기 (dashboard.html이어야?) | background.ts:50 | Low — UX 불일치 |
| A6 | 'bbr-update-available' key가 두 파일에 하드코딩 | popup/index.ts, background.ts | Low — shared constant로 이동 권장 |
| A7 | CSS custom properties가 3개 stylesheet에 중복 | popup/dashboard/options style.css | Low — tokens.css 추출 권장 |
| A8 | milestone checkMilestone 매 flush마다 storage 읽기 | milestone-banner.ts | Medium — 메모리 캐시로 최적화 가능 |
| A9 | cleanupOldStats가 pack 알람에 종속 | background.ts:34 | Low — 별도 알람 분리 권장 |

---

## 리뷰 메타

```
ADVERSARIAL REVIEW SYNTHESIS (3487 lines)
════════════════════════════════════════════════
  High confidence (multi-source confirmed):
    - getAllTimeTotal 전체 storage 로드 (performance + adversarial)
    - expandedSet 미초기화 (adversarial) — AUTO-FIXED
    - Empty Set 할당 (performance + adversarial) — AUTO-FIXED

  Unique to Claude structured:
    - 화이트리스트 대소문자 불일치 — AUTO-FIXED
    - filter.lists enum completeness — VERIFIED OK

  Unique to Claude adversarial:
    - flushStats 자정 경계 버그
    - showTweet 비숨김 트윗 DOM 조작
    - filter-section.ts 264줄 dead code
    - pack URL/regex 검증 부재

  Models: Claude structured ✓  Claude adversarial ✓  Codex ✗
════════════════════════════════════════════════

PR Quality Score: 5/10
```
