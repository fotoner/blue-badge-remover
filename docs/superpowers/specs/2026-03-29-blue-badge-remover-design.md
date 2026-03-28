# Blue Badge Remover — Design Spec

## 목적

X(트위터)에서 Premium 구독(파딱) 파란 뱃지 계정의 콘텐츠를 숨기는 크롬 익스텐션. 팔로우 중인 계정과 수동 화이트리스트는 예외 처리한다.

## 기술 스택

- TypeScript, Chrome Extension (Manifest V3)
- Vite + CRXJS (빌드), Vitest (테스트)
- 바닐라 HTML/CSS (Popup UI)

---

## 1. 아키텍처

### 1.1 컴포넌트 구조

```
┌─────────────────────────────────────────────────┐
│                  Chrome Browser                  │
├──────────┬──────────────────┬────────────────────┤
│ Popup UI │  Content Script  │  Service Worker    │
│          │  (x.com에 주입)   │  (Background)      │
│ - 토글   │  - MutationObs   │  - 토큰 추출       │
│ - 화이트 │  - 뱃지 감지      │  - 팔로우 동기화    │
│   리스트 │  - 콘텐츠 숨김    │  - API 응답 파싱    │
│ - 설정   │                  │  - 설정 변경 알림   │
├──────────┴──────────────────┴────────────────────┤
│              Chrome Storage (local)              │
│  - settings  - followList  - whitelist  - token  │
└─────────────────────────────────────────────────┘
```

### 1.2 역할 분담

| 컴포넌트 | 역할 |
|----------|------|
| Content Script | x.com 페이지에서 DOM 감시, 파딱 트윗 숨김 처리 |
| Service Worker | Bearer 토큰 인터셉트, 팔로우 목록 API 호출/캐시, API 응답에서 파딱 판별 |
| Popup UI | 사용자 설정 화면 (토글, 화이트리스트 관리) |
| Chrome Storage | 모든 상태의 영속 저장소, 컴포넌트 간 데이터 공유 허브 |

### 1.3 Feature-Based 디렉토리 구조

```
src/
├── background/                 # Service Worker 진입점
│   └── index.ts
├── content/                    # Content Script 진입점
│   └── index.ts
├── popup/                      # Popup UI
│   ├── index.html
│   ├── index.ts
│   └── style.css
├── features/
│   ├── badge-detection/        # D1: 파딱 판별 (API 파싱 + SVG 폴백)
│   ├── content-filter/         # D2: 콘텐츠 숨김/표시 처리
│   ├── follow-list/            # D3: 팔로우 & 화이트리스트 관리
│   └── settings/               # D4: 설정 관리
├── shared/                     # 공통 타입, 유틸, 상수
│   ├── types/
│   ├── utils/
│   └── constants/
└── manifest.json
```

### 1.4 의존성 규칙

- 진입점(background/content/popup) → features → shared (단방향)
- feature 간 직접 import 금지 (shared를 통해서만 공유)
- Chrome API 직접 호출은 진입점 또는 shared/utils에서만 허용

---

## 2. 파딱 판별 (D1: Badge Detection)

### 2.1 1차: API 응답 인터셉트

X의 GraphQL API 응답에서 사용자 정보를 파싱하여 파딱을 판별한다.

**판별 기준:**
- `is_blue_verified: true` AND `legacy.verified: false` → **파딱** (Premium 구독자)
- `is_blue_verified: true` AND `legacy.verified: true` → 레거시 인증 → 숨기지 않음
- `verified_type: "Business"` → 기관 계정 → 숨기지 않음

**인터셉트 방식:**
- Service Worker에서 `chrome.webRequest.onCompleted`로 x.com GraphQL 엔드포인트 응답 감지
- 응답 바디에서 트윗에 포함된 사용자 데이터 파싱
- 파딱 판정된 사용자 ID를 Content Script에 메시지로 전달

### 2.2 2차: SVG 폴백

API 인터셉트 실패 시(스키마 변경 등) DOM의 파란 뱃지 SVG 아이콘 존재 여부로 폴백 감지.

- 폴백 모드에서는 Premium vs 레거시 구별 불가 → 파란 뱃지 전부를 파딱으로 간주
- 골드/그레이 뱃지(기관/정부)는 색상으로 구별하여 제외
- Popup에 "제한된 모드로 작동 중" 표시

### 2.3 판별 결과 캐시

- 파딱 판정 결과를 사용자 ID 기준 메모리 Map으로 캐시
- 같은 사용자의 트윗을 반복 판별하지 않음
- 페이지 전환 시에도 캐시 유지 (Content Script 언로드 전까지)

---

## 3. 콘텐츠 필터링 (D2: Content Filtering)

### 3.1 MutationObserver 전략

- 타임라인/검색/답글의 피드 컨테이너 요소에 observer 등록
- `{ childList: true, subtree: true }` 옵션
- 새로 추가된 노드 중 트윗 단위 요소만 필터링하여 처리

### 3.2 트윗 처리 파이프라인

```
새 트윗 노드 감지
  → 사용자 ID/핸들 추출
  → 파딱 캐시 조회 (없으면 SVG 폴백 확인)
  → 파딱 아님 → 스킵
  → 파딱임 →
    → 팔로우 목록에 있음? → 스킵
    → 화이트리스트에 있음? → 스킵
    → 해당 영역(타임라인/답글/검색) 필터링 활성? → 아니면 스킵
    → 숨김 처리 (설정에 따라 완전 제거 or 접힌 상태)
```

### 3.3 인용 트윗 처리

트윗 내부에 인용 블록이 존재하고, 인용된 계정이 파딱인 경우:

| 설정값 | 동작 |
|--------|------|
| `quoteMode: 'quote-only'` | 인용 블록만 숨기고 원래 트윗은 유지 |
| `quoteMode: 'entire'` | 트윗 전체를 숨김 |

### 3.4 숨김 방식

| 설정값 | 동작 |
|--------|------|
| `hideMode: 'remove'` | 트윗 요소를 `display: none`으로 완전 숨김 |
| `hideMode: 'collapse'` | 트윗을 접힌 상태로 표시 ("숨겨진 트윗", 클릭 시 펼침) |

### 3.5 페이지 전환 처리

- X는 SPA이므로 URL 변경을 감지 (`popstate`, `pushState` 감시)
- 타임라인 → 검색 등 전환 시 observer를 새 컨테이너에 재등록
- 이전 observer는 `disconnect()`로 정리

### 3.6 성능 최적화

- MutationObserver 콜백에 `requestAnimationFrame` 또는 microtask batching
- 관찰 범위를 피드 컨테이너로 제한 (document 전체 감시 금지)
- 파딱 판정 결과 메모리 캐시로 중복 판별 방지

---

## 4. 팔로우 & 화이트리스트 (D3: Follow & Whitelist)

### 4.1 토큰 자동 추출

- `chrome.webRequest.onBeforeSendHeaders`로 x.com API 요청의 `Authorization: Bearer ...` 헤더 감지
- 최초 감지 시 `chrome.storage.local`에 저장
- 새 요청에서 다른 토큰이 감지되면 자동 갱신

### 4.2 팔로우 목록 동기화

- 토큰 확보 후 X API로 팔로우 목록 조회
- 결과를 사용자 ID Set으로 `chrome.storage.local`에 캐시
- 팔로우 수가 많을 경우 페이지네이션 처리
- 동기화 시점: 익스텐션 설치 시 최초 1회 + Popup에서 수동 동기화 버튼

### 4.3 계정 전환 처리

- API 응답에서 현재 로그인된 사용자 ID 추출
- 이전 저장된 사용자 ID와 다르면 계정 전환으로 판단
- 전환 시: 팔로우 목록만 새 계정 기준으로 재동기화
- 설정/화이트리스트는 계정 공통으로 유지
- 동기화 완료 전까지 기존 팔로우 목록 유지 (빈 목록으로 초기화하지 않음)

### 4.4 수동 화이트리스트

- Popup UI에서 `@핸들` 입력으로 추가
- 개별 삭제(✕ 버튼)
- `chrome.storage.local`에 핸들 배열로 저장

---

## 5. 설정 (D4: Settings)

### 5.1 Popup UI 레이아웃

```
┌─────────────────────────┐
│  Blue Badge Remover     │
│  ─────────────────────  │
│                         │
│  마스터 ON/OFF    [■■■] │
│                         │
│  ── 필터링 범위 ──────  │
│  타임라인         [■■■] │
│  답글             [■■■] │
│  검색             [■■■] │
│                         │
│  ── 숨김 방식 ────────  │
│  ◉ 완전 제거            │
│  ○ 접힌 상태로 표시     │
│                         │
│  ── 인용 트윗 ────────  │
│  ◉ 인용 부분만 숨김     │
│  ○ 트윗 전체 숨김       │
│                         │
│  ── 팔로우 동기화 ────  │
│  마지막: 2026-03-29     │
│  [🔄 동기화]            │
│                         │
│  ── 화이트리스트 ─────  │
│  [@user1        ✕]     │
│  [@user2        ✕]     │
│  [+ 추가...]           │
│                         │
└─────────────────────────┘
```

### 5.2 설정 데이터 구조

```typescript
interface Settings {
  enabled: boolean;
  filter: {
    timeline: boolean;
    replies: boolean;
    search: boolean;
  };
  hideMode: 'remove' | 'collapse';
  quoteMode: 'quote-only' | 'entire';
}

interface StorageSchema {
  settings: Settings;
  whitelist: string[];          // @핸들 배열
  followList: string[];         // 사용자 ID 배열
  currentUserId: string | null; // 현재 로그인 계정
  token: string | null;         // Bearer 토큰
  lastSyncAt: string | null;    // ISO 8601 타임스탬프
}
```

### 5.3 설정 반영 흐름

1. Popup에서 설정 변경 → `chrome.storage.local`에 즉시 저장
2. Content Script가 `chrome.storage.onChanged`로 변경 감지
3. 변경된 설정에 따라 필터링 로직 즉시 재적용

---

## 6. 에러 처리 & 엣지 케이스

### 6.1 토큰

| 상황 | 동작 |
|------|------|
| x.com 미로그인 (토큰 없음) | 팔로우 예외 없이 파딱 전부 숨김. Popup에 "x.com에 로그인하세요" 안내 |
| 토큰 만료 | API 호출 실패 시 기존 캐시 팔로우 목록 유지. Popup에 재동기화 안내 |
| 토큰 자동 갱신 | 새 API 요청에서 다른 토큰 감지 시 자동 교체 |

### 6.2 API 인터셉트 실패

| 상황 | 동작 |
|------|------|
| GraphQL 스키마 변경 | SVG 폴백 모드로 전환 |
| 폴백 모드 작동 중 | Popup에 "제한된 모드로 작동 중" 표시 |
| SVG 셀렉터도 실패 | 해당 트윗 스킵, 경고 로그. 익스텐션 전체 중단 없음 |

### 6.3 DOM

| 상황 | 동작 |
|------|------|
| 셀렉터 매칭 실패 | 해당 트윗 스킵, 경고 로그 |
| 대량 DOM 변경 | requestAnimationFrame 배칭으로 프레임 드랍 방지 |
| 각 트윗 처리 에러 | try-catch로 격리, 다른 트윗 처리에 영향 없음 |

### 6.4 계정 전환

| 상황 | 동작 |
|------|------|
| 새 계정 감지 | 팔로우 목록 자동 재동기화 |
| 동기화 진행 중 | 기존 팔로우 목록 유지 (빈 목록 방지) |

### 6.5 Chrome Storage

| 상황 | 동작 |
|------|------|
| 저장 실패 | 에러 로그, Popup에 알림 |
| 용량 초과 | 오래된 캐시부터 정리 후 재시도 |

---

## 7. Manifest V3 권한

```json
{
  "manifest_version": 3,
  "permissions": [
    "storage",
    "webRequest"
  ],
  "host_permissions": [
    "https://x.com/*",
    "https://api.x.com/*"
  ],
  "background": {
    "service_worker": "src/background/index.ts"
  },
  "content_scripts": [{
    "matches": ["https://x.com/*"],
    "js": ["src/content/index.ts"]
  }],
  "action": {
    "default_popup": "src/popup/index.html"
  }
}
```

**권한 최소화 원칙:**
- `storage`: 설정/팔로우/화이트리스트 영속 저장
- `webRequest`: Bearer 토큰 인터셉트, API 응답 감지
- `host_permissions`: x.com과 api.x.com만 (다른 사이트 접근 없음)
