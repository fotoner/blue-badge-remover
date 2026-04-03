# blue-badge-remover

X(트위터)에서 수익성 목적의 파란 뱃지 계정을 숨기는 크롬 익스텐션. 팔로우 중인 계정과 수동 화이트리스트는 예외 처리.

## 기술 스택

- **Language**: TypeScript
- **Platform**: Chrome Extension (Manifest V3)
- **Build**: Vite + CRXJS
- **Test**: Vitest
- **UI**: 바닐라 HTML/CSS (Popup)
- **API**: Chrome Extensions API, Chrome Storage API, X(Twitter) API

## 아키텍처

Feature-Based Architecture — 기능 단위로 코드를 분리하고, Chrome 컴포넌트(background/content/popup)는 진입점 역할만 수행.

```
background/ (Service Worker) ─┐
content/   (Content Script)  ─┼→ features/ ─→ shared/
popup/     (Popup UI)        ─┘
```

교차 관심사(로깅, HTTP 등)는 유틸리티 모듈을 통해서만 접근.

상세: `docs/ARCHITECTURE.md`

## 핵심 규칙

### TDD 필수
1. 실패하는 테스트 먼저 작성
2. 테스트를 통과하는 최소한의 코드만 구현
3. 리팩토링 시 테스트가 여전히 통과하는지 확인

### 브랜치 전략 (git-flow)
- **`main`**: 릴리스 전용. 태그(v*.*.*) + 웹스토어 배포. 직접 커밋 금지.
- **`dev`**: 일상 개발. feature/fix 브랜치의 PR 머지 대상 (default branch).
- **`feat/*`, `fix/*`, `refactor/*`**: dev에서 분기, dev로 squash merge.
- **`release/v*.*.*`**: dev에서 분기, main으로 머지 후 태그.
- **`hotfix/*`**: main에서 분기, main + dev 양쪽에 머지.
- **squash merge 전 코드 리뷰 필수** (`superpowers:requesting-code-review`)
- 상세: `docs/CONVENTIONS.md`

### 코딩
- 타입 안전성 위반 금지 — 명시적 타입 선언
- 디버그 출력 금지 — 구조화된 로거 사용
- 외부 데이터는 경계에서 검증
- 파일 최대 300줄, 함수 최대 50줄

### 점진적 하네스
- 에이전트가 같은 실수 2회 반복 → 이 파일 또는 QUALITY_RULES.md에 규칙 추가
- 문서 규칙으로도 위반 반복 → 린터/테스트로 승격하여 기계적 강제

## 프로젝트 관리

- **이슈/스프린트**: `docs/cycle/` (마크다운 기반)
- **스프린트**: 1주 단위 (월요일 시작)
- **작업 제목 형식**: `[D{도메인}.{번호}][EARS패턴] 요구사항 설명`
- **스킬**: `/manage-cycle` 로 이슈/스프린트 관리

## 문서 참조

| 문서 | 내용 |
|------|------|
| `docs/ARCHITECTURE.md` | 아키텍처 맵, 의존성 방향 규칙 |
| `docs/REQUIREMENTS.md` | EARS 기반 요구사항 (MECE 도메인별) |
| `docs/QUALITY_RULES.md` | TDD + 코딩 + 아키텍처 제약 규칙 |
| `docs/CONVENTIONS.md` | 작업/커밋/PR 컨벤션 |
| `docs/CODE_REVIEW.md` | 코드 리뷰 필수 규칙, 리뷰 관점 |
| `docs/RELIABILITY.md` | 에러 처리 정책, 데이터 무결성 |
| `docs/SECURITY.md` | 환경 변수 관리, 데이터 보호 |
| `docs/PRIVACY.md` | Privacy Policy (웹스토어 인증용) |
| `docs/STORE_SETUP.md` | 스토어 배포 자동화 설정 (Chrome/Firefox/Edge API 키) |

## 디렉토리 구조

```
entrypoints/                    # WXT 진입점 (빌드 시스템이 관리)
├── background.ts               # Service Worker
├── content.ts                  # Content Script (ISOLATED world)
├── injected.content.ts         # Content Script (MAIN world, fetch 인터셉트)
├── popup/                      # Popup UI
├── options/                    # 고급 필터 설정
├── whitelist/                  # 화이트리스트 관리
└── collector/                  # 키워드 수집기

src/
├── content/                    # Content Script 로직 (6개 모듈)
│   ├── index.ts                # 초기화 + 모듈 연결
│   ├── state.ts                # 공유 상태 관리
│   ├── message-handler.ts      # postMessage 수신
│   ├── storage-listener.ts     # chrome.storage 변경 감지
│   ├── tweet-orchestrator.ts   # processTweet + 숨김/표시
│   ├── tweet-classifier.ts     # 순수 함수 판정 로직
│   └── collector-buffer.ts     # 키워드 수집기 버퍼
├── injected/                   # MAIN world 스크립트
│   └── fetch-interceptor.ts    # X API 응답 파싱 + fiber 팔로우 감지
├── features/
│   ├── badge-detection/        # D1: 뱃지 감지
│   ├── content-filter/         # D2: 콘텐츠 필터링
│   ├── follow-list/            # D3: 팔로우 & 화이트리스트
│   ├── keyword-filter/         # D5: 키워드 필터
│   ├── keyword-collector/      # 키워드 수집기 스토리지
│   └── settings/               # D4: 설정 관리
├── shared/                     # 공통 타입, 유틸, 상수
│   ├── types/
│   ├── utils/
│   └── constants/
├── popup/                      # Popup UI 로직
├── options/                    # Options 페이지 로직
├── whitelist/                  # 화이트리스트 페이지 로직
└── collector/                  # 키워드 수집기 페이지 로직
```
