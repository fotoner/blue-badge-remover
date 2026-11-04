# AGENTS.md — Blue Badge Remover
<!-- 12KiB 안(scripts/check-docs.mjs가 잰다). "## 안전 불변식" 제목은 scripts/hooks/session-safety.mjs가 찾는다. 규칙 ID는 다시 매기지 않는다. -->

X(트위터)에서 수익 목적의 파란 뱃지(파딱) 계정 트윗을 숨기는 브라우저 확장이다. Chrome·Edge(MV3)와 Firefox·Firefox Android(MV2)에 배포한다. 팔로우와 화이트리스트는 예외로 둔다. 스택은 TypeScript, WXT, Vitest, Playwright, 바닐라 HTML/CSS다.
이 파일은 사람과 모든 에이전트(Claude Code·Codex 등)가 따르는 정본이자 문서 지도다.

## 안전 불변식

사용자 데이터와 스토어 배포를 깨뜨리지 않는다. 어떤 도구로 일하든 늘 지킨다.
- **SAFE-1** 시험·QA에서 사람이 실제로 쓰는 브라우저 프로필에 확장을 새로 설치하거나 지우지 않는다. 설치·업데이트 경로는 임시 프로필(`--user-data-dir=<임시 폴더>`)에서 확인한다.
- **SAFE-2** 로그인된 실제 브라우저로 QA하다가 확장 저장소(`chrome.storage.local`)를 바꿔야 하면, 바꿀 키를 먼저 파일로 백업하고 `finally`에서 되돌린 뒤 전후 값을 대조한다.
- **SAFE-3** 실제 X 계정의 상태를 바꾸지 않는다. QA 중에도 팔로우·언팔로우·게시·좋아요·차단을 누르지 않는다. 팔로우 변화는 확장 저장소의 팔로우 목록을 바꿔 흉내 낸다.
- **SAFE-4** 스토어 제출은 `-test`가 붙지 않은 `v*` 태그 푸시로 일어난다. 정식 릴리스 태그 푸시, `npm run submit`, 스토어 제출 워크플로 실행은 사용자가 직접 한다. `scripts/hooks/guard-bash.mjs`가 에이전트의 이런 명령을 막는다.
- **SAFE-5** `main`에 직접 커밋·푸시하지 않는다. `dev`에도 PR로만 합친다.
- **SAFE-6** 매니페스트 권한(`permissions`·`host_permissions`)을 늘리면 설치 경고가 생기는지 확인하고 PR 본문에 적는다. 경고가 생기는 권한은 업데이트 때 사용자의 확장을 꺼 버린다. 브라우저별 권한은 `tests/manifest-permissions.test.ts`가 고정한다. 권한을 바꾸면 `docs/PRIVACY.md`의 권한 표도 고친다.
- **SAFE-7** 사용자 데이터(팔로우·화이트리스트·설정·통계)를 외부로 보내지 않는다. 바꿔야 하면 `docs/PRIVACY.md`부터 고친다.
- **SAFE-8** 공개 저장소다. 이슈·커밋·PR·문서에 개인 경로(`/Users/…`), 토큰·스토어 API 키, 실제 사용자의 X 계정·스크린샷, 설문 응답 원문의 개인정보를 넣지 않는다. 스토어 비밀값은 GitHub Secrets에만 둔다. `scripts/check.sh --changed`가 추가된 줄에서 개인 경로와 키 모양 문자열을 찾는다.

## 명령

```sh
npm ci                                   # 설치(postinstall이 wxt prepare를 돈다)
scripts/check.sh --quick <패턴>           # 편집 중: 패턴에 맞는 vitest만
scripts/check.sh --changed               # 작업 끝: 바꾼 것에 닿는 검사(지침·비밀값·타입·린트·관련 시험)
scripts/check.sh                         # 전체: 지침·타입·린트·전체 시험·Chrome/Firefox 빌드
npm run build:chrome                     # dist/chrome-mv3/ (build:edge, build:firefox도 있다)
npm run test:e2e                         # Playwright, 빌드 뒤, 임시 프로필
```

## 검증

TDD로 일한다. 버그는 실패하는 시험으로 먼저 재현한 뒤 고친다. 시험을 지우거나 기대값을 느슨하게 해서 통과시키지 않는다.

| 시점 | 명령 |
|---|---|
| 편집 중 | `scripts/check.sh --quick <vitest 패턴>` |
| 작업 끝, PR 전 | `scripts/check.sh --changed` (기준: `origin/dev`와의 merge-base) |
| 설정·의존성 변경, 릴리스 | `scripts/check.sh` |

- `--changed`는 `package.json`·설정 파일·`scripts/check.sh`·`.github/**`가 바뀌면 전체 시험으로 넓힌다. 문서만 바뀌면 지침·비밀값 검사만 돈다.
- CI(`.github/workflows/ci.yml`)는 PR마다 타입·린트·전체 시험·Chrome/Firefox 빌드를 돈다. 지침 검사와 훅 시험은 `tests/harness/`에 있어 전체 시험 안에서 돈다.
- 화면·런타임 동작을 바꿨으면 실제 브라우저에서 확인한다(스킬 `browser-qa`). 모킹된 시험 통과는 화면 동작의 증거가 아니다.
- 결과는 추측하지 않는다. 실행한 명령과 통과·실패 수로 보고한다. 돌리지 않은 것은 돌리지 않았다고 쓴다.

## 지도

| 알고 싶은 것 | 볼 곳 |
|---|---|
| 구조·의존성 방향·데이터 흐름 | `docs/ARCHITECTURE.md` |
| 요구사항(EARS, 도메인 D1~D5) | `docs/REQUIREMENTS.md` |
| 디자인 시스템(색·글꼴·border/radius) | `docs/DESIGN.md` |
| 이슈·라벨·PR 본문 | `docs/issues.md` |
| 릴리스·테스트 릴리스·dev 동기화 | `docs/releasing.md`, `docs/STORE_SETUP.md` |
| 개인정보 처리방침(스토어 제출용) | `docs/PRIVACY.md` |
| 신규 고확산(어그로) 필터 | `docs/AGGRESSOR_FILTER.md` |
| X 화면 DOM 픽스처 캡처 | `scripts/x-dom/README.md` |
| 스토어 이미지·데모 영상 | `scripts/store-assets/README.md`, `scripts/demo-video/README.md` |

경로별 규칙은 `.claude/rules/`에 있다. 그 경로를 고치기 전에 읽는다. Claude Code는 알아서 싣는다.

| 파일 | ID | 다루는 것 |
|---|---|---|
| `content.md` | CNT | content script, X 화면 해석·숨김, MAIN world |
| `extension.md` | EXT | 매니페스트·권한, background, 설치·업데이트, 브라우저별 차이 |
| `ui.md` | UI | 팝업·대시보드·설정 화면, 번역, X 화면에 넣는 요소 |
| `tests.md` | TEST | 단위·e2e 시험, 픽스처 |
| `harness.md` | HAR | 지침·검사 스크립트·훅·CI |

- 스킬 `browser-qa`: 실제 브라우저 QA. 임시 프로필에서 설치·업데이트를 확인하는 방법과 로그인된 브라우저에서 저장소를 백업·복원하며 확인하는 방법이 있다.
- 리뷰어 `.claude/agents/reviewer.md`: 읽기 전용으로 정확성 버그와 안전 규칙 위반만 본다.

## 구조

`entrypoints/` → `src/content`·`src/<화면>` → `src/features/<기능>` → `src/shared`. 기능끼리는 서로 import하지 않고 `src/shared`로 공유한다. `src/injected`(MAIN world)는 `src/shared`만 쓴다. `eslint.config.js`의 `no-restricted-imports`가 이 방향을 검사한다. 화면 HTML은 `entrypoints/*/index.html`에만 둔다(`tests/shared/entrypoint-html-location.test.ts`).

## 코드 규칙

- 파일 300줄·함수 50줄(빈 줄·주석 제외), `any` 금지, `console` 금지는 ESLint가 강제한다. 로그는 `src/shared/utils/logger.ts`를 쓴다. `src/injected/**`만 `debugMode`로 묶인 `console`을 쓴다.
- 외부 데이터(X API 응답, `postMessage`, 저장소 값, 가져오기 파일)는 경계에서 검증한다.
- 화면 문구는 `src/shared/i18n/`의 ko·en·ja에 같은 키로 넣는다. 코드에 한국어 문구를 직접 쓰지 않는다(`tests/shared/page-source-i18n.test.ts`).
- 주석은 한국어로 쓰고, 무엇이 아니라 왜를 적는다. 이슈 번호를 붙인다(예: `(#121)`).

## 저장소 규칙

- 브랜치: `main`은 릴리스, `dev`는 통합(기본 브랜치)이다. 작업 브랜치는 `dev`에서 따고 이슈 번호를 앞에 둔다(`fix/100-…`, `feat/121-…`). 이슈가 없는 정리는 `chore/…`다. PR로 squash merge한다.
- 커밋·squash 제목: `타입: 한국어 설명 (#이슈)`. 타입은 `feat`·`fix`·`docs`·`test`·`refactor`·`chore`다. 마침표를 찍지 않는다.
- 커밋·푸시·PR·머지는 요청받은 단계까지만 한다.
- 할 일·조사·계획은 GitHub 이슈로 관리한다(`docs/issues.md`). 저장소에 계획 문서를 따로 만들지 않는다.
- PR 본문은 문제부터 쓴다: 무엇이 불편했고 이제 어떻게 되는지 → 변경 → 확인(명령과 수치, 실제 브라우저 결과) → 미검증. 틀은 `.github/pull_request_template.md`이고, `## 확인` 절은 `.github/workflows/pr-body.yml`이 검사한다.
- 머지 전에 PR의 Codex 리뷰 봇과, 작성자와 다른 모델의 리뷰를 받는다. 리뷰 뒤 동작을 바꿨으면 바뀐 부분을 다시 리뷰받는다.
