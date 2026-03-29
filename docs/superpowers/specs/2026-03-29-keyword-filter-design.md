# Keyword Filter (고급 필터) - Design Spec

**Date**: 2026-03-29
**Status**: Beta Feature
**Domain**: D5 (Keyword Filter)

## Context

현재 blue-badge-remover는 파란뱃지(유료 구독) 계정을 무조건 숨기는 방식으로 동작한다. 팔로우 중이거나 화이트리스트에 등록된 계정만 예외 처리된다. 이로 인해 사용자가 보고 싶어할 수도 있는 파딱 계정까지 모두 가려지는 문제가 있다.

키워드 필터 기능을 추가하여, 프로필/계정명에 특정 키워드가 포함된 파딱만 선택적으로 숨길 수 있게 한다. AdGuard와 유사한 필터 리스트 문법을 사용한다.

## Requirements (EARS Format)

### D5.1 Filter Rule Parsing

- **[D5.1.1][Ubiquitous]** 시스템은 줄 단위 필터 리스트 텍스트를 파싱하여 FilterRule 배열로 변환해야 한다.
- **[D5.1.2][When]** `!`로 시작하는 줄이 입력되면, 시스템은 이를 주석으로 무시해야 한다.
- **[D5.1.3][When]** `@@`로 시작하는 줄이 입력되면, 시스템은 이를 예외 규칙(해당 handle은 숨기지 않음)으로 파싱해야 한다.
- **[D5.1.4][When]** `*` 문자가 포함된 줄이 입력되면, 시스템은 이를 와일드카드 패턴으로 파싱해야 한다. (`*`은 임의의 0개 이상 문자와 매칭. 예: `*coin*`은 "bitcoin", "coinbase" 등과 매칭)
- **[D5.1.5][When]** 위 패턴에 해당하지 않는 비어있지 않은 줄이 입력되면, 시스템은 이를 단순 키워드 규칙으로 파싱해야 한다.

### D5.2 Profile Data Collection

- **[D5.2.1][When]** fetch interceptor가 GraphQL 응답에서 userData를 파싱하면, 시스템은 `rest_id`, `legacy.name`(표시명), `legacy.screen_name`(계정명), `legacy.description`(바이오)을 추출하여 프로필 캐시에 저장해야 한다.
- **[D5.2.2][Ubiquitous]** 프로필 캐시는 LRU 정책으로 최대 10,000개 엔트리를 유지해야 한다.
- **[D5.2.3][If...Then]** API 응답에서 프로필 데이터를 추출할 수 없으면, DOM에서 추출 가능한 계정명과 표시명만으로 매칭을 수행해야 한다 (graceful degradation).

### D5.3 Keyword Matching

- **[D5.3.1][When]** 키워드 필터 모드가 활성화된 상태에서 파란뱃지 트윗이 감지되면, 시스템은 해당 계정의 프로필 정보(계정명, 표시명, 바이오)를 필터 규칙과 대조해야 한다.
- **[D5.3.2][When]** 예외 규칙(`@@handle`)에 해당하는 계정이면, 다른 규칙에 관계없이 숨기지 않아야 한다.
- **[D5.3.3][When]** 키워드 또는 와일드카드 규칙이 프로필 정보와 매칭되면, 해당 트윗을 숨겨야 한다.
- **[D5.3.4][Ubiquitous]** 키워드 매칭은 대소문자를 구분하지 않아야 한다.
- **[D5.3.5][When]** 키워드 필터 모드에서 어떤 규칙에도 매칭되지 않는 파딱이면, 트윗을 숨기지 않고 보여야 한다.

### D5.4 Filter Mode Selection

- **[D5.4.1][Ubiquitous]** 시스템은 두 가지 필터 모드를 제공해야 한다: `all` (기존 전체 숨김)과 `keyword` (키워드 매칭만 숨김).
- **[D5.4.2][When]** 사용자가 키워드 필터 베타 기능을 활성화하면, 필터 모드 선택 UI가 표시되어야 한다.
- **[D5.4.3][Ubiquitous]** 키워드 필터 베타 기능은 기본값 OFF로, 기존 동작에 영향을 주지 않아야 한다.

### D5.5 Filter List Management

- **[D5.5.1][Ubiquitous]** 프로젝트는 내장 기본 필터 리스트를 포함해야 한다 (초기: `테슬라`, `년차`).
- **[D5.5.2][When]** 사용자가 옵션 페이지에서 커스텀 필터를 편집하면, Chrome Storage에 저장되어야 한다.
- **[D5.5.3][Ubiquitous]** 최종 활성 규칙은 내장 리스트 + 유저 커스텀 리스트를 합산한 것이어야 한다.
- **[D5.5.4][When]** 필터 리스트에 문법 오류가 있으면, 해당 줄만 무시하고 나머지를 정상 처리해야 한다.

### D5.6 Options Page

- **[D5.6.1][When]** 사용자가 팝업에서 "고급 필터 설정" 버튼을 클릭하면, 옵션 페이지가 새 탭으로 열려야 한다.
- **[D5.6.2][Ubiquitous]** 옵션 페이지는 내장 필터(읽기 전용)와 커스텀 필터(편집 가능) 영역을 분리하여 표시해야 한다.
- **[D5.6.3][Ubiquitous]** 옵션 페이지는 현재 활성 규칙 수와 파싱 에러를 표시해야 한다.

## Architecture

### New Module: `src/features/keyword-filter/`

```
src/features/keyword-filter/
├── index.ts              # Public API
├── filter-rule-parser.ts # 애드가드 문법 파서
├── keyword-matcher.ts    # 프로필 대상 키워드 매칭 엔진
├── profile-cache.ts      # userId → ProfileInfo LRU 캐시
├── default-filters.ts    # 내장 기본 필터 리스트
└── filter-storage.ts     # 유저 커스텀 필터 Chrome Storage CRUD
```

### New Entry Point: `src/options/`

```
src/options/
├── index.html            # 옵션 페이지 HTML
├── index.ts              # 옵션 페이지 로직
└── style.css             # 스타일
```

### Dependency Direction

```
content/index.ts ──→ features/keyword-filter/ ──→ shared/
popup/index.ts   ──→ features/keyword-filter/ ──→ shared/
options/index.ts ──→ features/keyword-filter/ ──→ shared/
```

Cross-feature import 없음. `keyword-filter`는 `badge-detection`, `content-filter` 등을 직접 import하지 않음.

## Constants Changes

```typescript
// shared/constants/index.ts 확장
MESSAGE_TYPES = {
  // ... 기존
  PROFILE_DATA: 'BBR_PROFILE_DATA',  // 프로필 정보 전달
}

STORAGE_KEYS = {
  // ... 기존
  CUSTOM_FILTER_LIST: 'customFilterList',
}
```

## Data Types

```typescript
// shared/types/index.ts 확장
interface Settings {
  // ... 기존 필드
  keywordFilterEnabled: boolean;  // 베타 기능 토글 (기본: false)
  filterMode: 'all' | 'keyword'; // 'all' = 기존, 'keyword' = 키워드만
}

// features/keyword-filter/
interface ProfileInfo {
  handle: string;
  displayName: string;
  bio: string;
}

type FilterRule =
  | { type: 'keyword'; value: string; }
  | { type: 'wildcard'; pattern: RegExp; original: string; }
  | { type: 'exception'; handle: string; }

interface KeywordMatchResult {
  matched: boolean;
  matchedRule?: string;  // 매칭된 규칙 원본 (디버그용)
}
```

### Storage Schema 확장

```typescript
interface StorageSchema {
  // ... 기존 필드
  customFilterList: string;  // 유저 커스텀 필터 텍스트 원본
}
```

## Data Flow

### 프로필 데이터 수집

```
fetch interceptor (injected)
  → userData 파싱 시 {rest_id, name, screen_name, description} 추출
  → window.postMessage({ type: 'PROFILE_DATA', profiles: [...] })
  → content script 수신
  → profileCache.set(userId, { handle, displayName, bio })
```

### 트윗 필터링 결정 (키워드 모드)

```
processTweet(element)
  → 파란뱃지 확인
  → 팔로우/화이트리스트 확인 → 해당하면 통과
  → settings.filterMode === 'keyword'?
    → YES: profileCache에서 프로필 조회
           + DOM에서 handle/displayName 추출 (fallback)
           → matchesKeywordFilter(profile, rules)
           → matched → 숨김
           → not matched → 보임
    → NO ('all'): 기존 로직대로 숨김
```

### 필터 규칙 로딩

```
content script init
  → 내장 필터 로드 (default-filters.ts import)
  → Chrome Storage에서 customFilterList 로드
  → parseFilterList(내장 + 커스텀) → FilterRule[]
  → 메모리에 캐시
  → storage.onChanged 리스너로 변경 감지 → 재파싱
```

## Default Filter List

```
! Blue Badge Remover - 기본 필터 리스트 (Beta)
! 악성 파딱 키워드 필터

테슬라
년차
```

## Popup UI Changes

1. **베타 기능 토글** 추가: `[Beta] 키워드 필터` 체크박스
2. 토글 ON 시 **필터 모드** 라디오 노출:
   - `전체 숨김` (filterMode: 'all')
   - `키워드만 숨김` (filterMode: 'keyword')
3. **"고급 필터 설정"** 버튼 → `chrome.runtime.openOptionsPage()` 또는 `chrome.tabs.create`

## Options Page UI

```
┌─────────────────────────────────────────────────┐
│  Blue Badge Remover - 고급 필터 설정 (Beta)      │
├─────────────────────────────────────────────────┤
│                                                  │
│  📋 내장 필터 (읽기 전용)                          │
│  ┌────────────────────────────────────────────┐  │
│  │ ! 기본 필터 리스트                           │  │
│  │ 테슬라                                      │  │
│  │ 년차                                        │  │
│  └────────────────────────────────────────────┘  │
│                                                  │
│  ✏️ 커스텀 필터                                   │
│  ┌────────────────────────────────────────────┐  │
│  │ (textarea - 편집 가능)                       │  │
│  │                                             │  │
│  │                                             │  │
│  └────────────────────────────────────────────┘  │
│                                                  │
│  [저장]                                          │
│                                                  │
│  ℹ️ 활성 규칙: 2개 | 파싱 에러: 0개               │
│                                                  │
│  📖 문법 가이드                                   │
│  - 한 줄에 하나의 키워드                           │
│  - ! 주석                                        │
│  - * 와일드카드                                   │
│  - @@ 예외 (숨기지 않을 계정)                      │
└─────────────────────────────────────────────────┘
```

## Manifest Changes

```json
{
  "options_page": "src/options/index.html"
}
```

## Error Handling

- 필터 파싱 에러: 해당 줄 무시, warning 로그, UI에 에러 수 표시
- 프로필 캐시 miss: DOM fallback (handle + displayName만 매칭)
- Storage 실패: 기존 캐시된 규칙 유지, error 로그
- 빈 필터 리스트: 키워드 모드에서 아무것도 숨기지 않음 (의도적)

## Testing Strategy

- **filter-rule-parser**: 단위 테스트 — 각 규칙 타입 파싱, 주석/빈줄 무시, 에러 라인 처리
- **keyword-matcher**: 단위 테스트 — 키워드/와일드카드/예외 매칭, 대소문자 무시, fallback
- **profile-cache**: 단위 테스트 — LRU 동작, set/get, 최대 크기 제한
- **filter-storage**: Chrome Storage mock으로 CRUD 테스트
- **content script 통합**: processTweet 호출 시 filterMode에 따른 분기 테스트
- **popup/options**: DOM 조작 테스트

## Verification

1. `npm run test` — 전체 테스트 통과
2. `npm run build` — 빌드 성공, 옵션 페이지 포함
3. 수동 테스트: 확장프로그램 로드 → 베타 토글 ON → 키워드 모드 전환 → X.com에서 키워드 매칭 트윗 숨김 확인
4. 수동 테스트: 옵션 페이지에서 커스텀 필터 추가/저장 → 즉시 반영 확인
