# TODOS

## Phase 2-1: content/index.ts 리팩토링 시

### reprocessExistingTweets() 버그 수정
- **What:** `restoreHiddenTweets()`가 quote-only hide를 복원하지 않고, `reprocessExistingTweets()`가 debug label이 있는 트윗을 건너뜀
- **Why:** 설정 변경 시 quote 상태가 고착되고, debug 모드에서 필터링 재평가가 안 됨
- **Pros:** 설정 변경이 모든 트윗에 정확히 반영됨
- **Cons:** reprocessing 로직 복잡도 증가
- **Context:** Codex plan review에서 발견 (2026-04-03). `content/index.ts:227` (restoreHiddenTweets), `content/index.ts:497` (reprocessExistingTweets), `content/index.ts:529`, `tweet-processing.ts:181` (addDebugLabel). 리팩토링 시 tweet-orchestrator.ts로 추출하면서 함께 수정.
- **Depends on:** Phase 2-1 content/index.ts 분해

## Phase 2-2: WXT 전환 시

### public/fetch-interceptor.js 스테일 파일 정리
- **What:** `public/fetch-interceptor.js`와 manifest의 `web_accessible_resources`에서 이 파일 참조 제거
- **Why:** 현재 content script의 `world: "MAIN"`으로 주입하므로 이 파일은 사용되지 않는 유물
- **Pros:** 불필요한 에셋 제거, manifest 정리
- **Cons:** 없음
- **Context:** Codex plan review에서 발견 (2026-04-03). `public/fetch-interceptor.js`, `src/manifest.json:45-49`. WXT 전환 시 manifest가 wxt.config.ts로 이동하므로 자연스럽게 정리.
- **Depends on:** Phase 2-2 WXT 전환
