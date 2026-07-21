# 아키텍처

## 빌드 시스템

**WXT** (Next-gen Web Extension Framework) — Chrome, Firefox, Edge 멀티 브라우저 빌드.

## 아키텍처 패턴

Feature-Based Architecture

## 구조

기능(feature) 단위로 코드를 분리하고, WXT entrypoint는 진입점 역할만 수행한다.
각 feature는 독립적으로 개발·테스트 가능하며, feature 간 의존은 shared 레이어를 통해서만 허용한다.

```
entrypoints/  (WXT 진입점)
├── background.ts         Service Worker
├── content.ts            Content Script (ISOLATED world)
├── injected.content.ts   Content Script (MAIN world, fetch 인터셉트)
├── popup/                Popup UI
├── dashboard/            Dashboard (설정 + 통계)
├── options/              고급 필터 설정
├── whitelist/            화이트리스트 관리
└── collector/            키워드 수집기

src/
├── content/              Content Script 오케스트레이션
│   ├── index.ts              초기화 + 모듈 연결
│   ├── state.ts              공유 상태 관리
│   ├── message-handler.ts    postMessage 수신 (MAIN → ISOLATED)
│   ├── storage-listener.ts   chrome.storage 변경 감지
│   ├── navigation.ts         SPA 네비게이션 + 복원 윈도우
│   ├── tweet-orchestrator.ts processTweet + 숨김/표시
│   ├── tweet-classifier.ts   순수 함수 판정 로직
│   ├── tweet-processing.ts   트윗 DOM 데이터 추출
│   ├── follow-collector.ts   DOM 팔로우 수집
│   ├── hover-card-observer.ts 호버 카드 바이오 수집
│   ├── filter-pipeline.ts    필터 규칙 로드 (내장+커스텀+팩 병합)
│   ├── milestone-banner.ts   마일스톤 축하 배너
│   ├── collector-buffer.ts   키워드 수집기 버퍼
│   └── fadak-banner.ts       프로필/상세 경고 배너
├── features/
│   ├── badge-detection/      D1: SVG 뱃지 감지
│   ├── content-filter/       D2: 콘텐츠 필터링 (숨김 판정 + DOM 조작)
│   ├── keyword-filter/       D5: 키워드 필터 (매칭, 파서, 캐시)
│   ├── keyword-collector/    키워드 수집기 스토리지
│   ├── filter-pack/          필터 팩 관리 (로더 + 스토리지)
│   ├── stats/                숨김 통계 수집/저장
│   └── settings/             D4: 설정 관리
├── shared/
│   ├── types/                공통 타입 (Settings, FilterRule, etc.)
│   ├── utils/                로거
│   ├── constants/            메시지 타입, 스토리지 키
│   └── i18n.ts               다국어 (ko/en/ja)
└── injected/
    ├── fetch-interceptor.ts      MAIN world에서 X API fetch/XHR 인터셉트
    ├── data-extractors.ts        API 응답 데이터 추출
    └── fiber-follow-observer.ts  React fiber 팔로우 감지
```

## 의존성 규칙

### 불변 원칙

1. **단방향 의존성**: entrypoints → src/content → features → shared
2. **경계 검증**: 시스템 경계(API 응답, 파일 파싱, 사용자 입력)에서 반드시 데이터 검증
3. **동일 레이어/모듈 간 참조 허용**: 같은 수준의 모듈끼리는 상호 참조 가능

### 프로젝트 특화 규칙

4. **Cross-import 금지**: feature 간 직접 import 금지. shared 레이어를 통해서만 공유
5. **Public API**: 각 feature는 `index.ts`를 통해서만 export
6. **브라우저 API 격리**: 브라우저 API 직접 호출은 entrypoint, content 오케스트레이션, 기능별 storage adapter에서만 허용. 순수 판정 모듈에서는 호출 금지
7. **DOM 조작 격리**: DOM 직접 조작은 content/ 모듈과 content-filter feature에서만 허용

### D3 팔로우/화이트리스트 소유권

- `src/injected/`: X API와 React fiber에서 팔로우 신호를 감지한다.
- `src/content/message-handler.ts`, `follow-collector.ts`, `storage-listener.ts`: 신호 검증, DOM 폴백 수집, 탭 상태 동기화를 담당한다.
- `src/features/settings/storage.ts`: 영속 화이트리스트 저장 API를 소유한다.
- 팔로우 판정은 `src/content/state.ts`의 메모리 집합을 사용하며, 순수 분류에는 값으로 전달한다.

## 데이터 흐름

```
[X.com GraphQL API]
       │
       ▼
┌──────────────────────────────────────┐
│  MAIN world (fetch-interceptor.ts)   │
│                                      │
│  fetch/XHR → profiles/follows 추출   │
│  FiberFollowObserver → React fiber의 │
│  팔로우 상태 감지                     │
└──────┬───────────────────────────────┘
       │ window.postMessage
       │ BBR_PROFILE_DATA / BBR_FOLLOW_DATA
       ▼
┌──────────────────────────────────────┐
│  ISOLATED world (content/)           │
│                                      │
│  message-handler.ts                  │
│    → profileCache/followSet 업데이트  │
│    → 관련 작성자 트윗만 재처리         │
│                                      │
│  FeedObserver (MutationObserver)     │
│    → 새 트윗 감지 → processTweet()   │
│                                      │
│  tweet-orchestrator.ts               │
│    1. extractTweetAuthor()           │
│    2. checkFadak() (작성자 SVG)      │
│    3. isFollowed / isWhitelisted     │
│    4. matchesKeywordFilter()         │
│    5. shouldHideTweet() (페이지 스코프)│
│    6. hideTweet() / showTweet()      │
│                                      │
│  storage-listener.ts                 │
│    → 설정 변경 → 필요 범위만 재처리   │
└──────────────────────────────────────┘

[Popup UI] → settings (설정 변경) → Chrome Storage → Content Script (설정 반영)
```

## 플랫폼별 처리

- **데스크톱 (Chrome/Edge/Firefox)**: 팝업에서 설정, 새 탭으로 페이지 열기
- **모바일 (Firefox Android)**: 팝업 대신 새 탭으로 설정 페이지 열기, 프리미엄 버튼을 BBR 설정 바로가기로 교체
- **네비게이션 통일**: `openPage()` — 데스크톱은 새 탭, 모바일은 현재 페이지 교체
