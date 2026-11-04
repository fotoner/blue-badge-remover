---
paths:
  - "tests/**"
  - "e2e/**"
  - "vitest.config.ts"
  - "playwright.config.ts"
---

# 시험을 쓰고 고칠 때

단위 시험(Vitest)과 e2e(Playwright)를 쓰고 고칠 때 지키는 규칙이다. 리뷰는 규칙을 ID로 가리킨다.

## TDD
- **TEST-1** 버그는 실패하는 시험으로 먼저 재현한다. 고친 뒤 같은 시험이 통과하는지 본다. PR 본문에 "수정 전 코드에서 N개 실패"를 적는다.
- **TEST-2** 시험을 지우거나 기대값을 느슨하게 해서 통과시키지 않는다. 계약을 일부러 바꿀 때는 시험 이름도 새 계약으로 바꾸고 PR 본문에 이유를 적는다(예: #120의 리트윗 예외 폐기).

## 위치와 모양
- **TEST-3** 시험은 `tests/`에 소스 구조를 따라 둔다(`src/content/<이름>.ts` → `tests/content/<이름>.test.ts`). 지침·훅 시험은 `tests/harness/`에 둔다.
- **TEST-4** 확장 API는 `vi.mock('wxt/browser')`로 바꾼다. 실제 저장소·탭을 쓰지 않는다.
- **TEST-5** X 화면은 손으로 만든 DOM보다 실제 캡처 픽스처(`tests/fixtures/x-dom/`)를 먼저 쓴다. 큰 데이터를 시험 코드에 인라인하지 않는다.
- **TEST-6** 소스 문자열을 읽는 연결 시험(진입점이 함수를 부르는지)은 행동을 시험하기 어려울 때만 쓴다. 행동 시험이 가능하면 그쪽을 쓴다.

## e2e
- **TEST-7** e2e는 임시 프로필(`launchPersistentContext('')`)로만 띄운다. 사람의 브라우저 프로필을 쓰지 않는다(AGENTS.md SAFE-1).
