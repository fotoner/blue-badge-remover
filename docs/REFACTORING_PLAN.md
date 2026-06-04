# 리팩터링 수정 계획

작성일: 2026-06-04

## 목적

전체 저장소 검토 결과, 즉시 차단되는 correctness 이슈는 없지만 일부 파일이 여러 책임을 동시에 갖고 있어 유지보수 비용이 커지고 있다. 이 계획은 기능 동작을 유지하면서 파일 크기, 책임 분리, 테스트 가독성, 아키텍처 문서와 구현의 불일치를 줄이는 것을 목표로 한다.

## 원칙

- 기능 변경 없이 구조만 정리한다.
- 한 PR/브랜치에는 하나의 리팩터링 의도만 담는다.
- 각 단계는 기존 테스트 통과를 완료 기준으로 한다.
- DOM/X API 관련 코드는 false positive/false negative 회귀 위험이 높으므로 테스트를 먼저 보강한다.
- 문서의 아키텍처 규칙과 실제 구현이 다르면, 구현을 바꾸기 전에 규칙을 유지할지 완화할지 먼저 결정한다.

## 핵심 처리 흐름

리팩터링 중 함수와 파일 이름은 바뀔 수 있지만 아래 데이터 흐름과 side effect 경계는 유지한다.

### Injected interceptor

```text
X GraphQL fetch/XHR
        |
        v
src/injected/network-interceptor.ts
  - patch fetch
  - patch XMLHttpRequest
  - clone/parse JSON response
        |
        +------------------------------+
        |                              |
        v                              v
profile-extractor.ts              fiber-follow-detector.ts
  - findUserObjects                  - observe tweet article nodes
  - build ProfileEntry[]             - walk React fiber props
  - cache profiles                   - extract followed handle
        |                              |
        +--------------+---------------+
                       |
                       v
window.postMessage to ISOLATED content script
  - BBR_BADGE_DATA
  - BBR_PROFILE_DATA
  - BBR_FOLLOW_DATA
```

Boundary:
- `src/injected/**`는 local relative import만 사용한다.
- shared constants와 duplicated constants는 테스트로 동기화한다.
- parse 실패는 content script fallback 동작을 막지 않는다.

### Tweet processing

```text
FeedObserver detects article
        |
        v
processTweet(tweetEl)
        |
        v
buildTweetContext()
  - author/status/displayName/text/profile
  - current user/follow/whitelist/settings
        |
        v
shouldSkipTweet()
  - profile page
  - current user's own tweet
  - user-expanded tweet
  - main tweet on detail page
        |
        v
classifyTweet(context)
        |
        +----------------+----------------+
        |                |                |
        v                v                v
apply show         apply hide        apply skip restore
  - showTweet        - hideTweet       - showTweet if previously hidden
  - no stat write    - recordHide      - no stat write
        |
        v
processQuoteBlock() when global filtering is enabled
```

Boundary:
- classifier는 판정만 담당한다.
- DOM 변경과 통계 기록은 action 적용 단계에만 둔다.
- 상세 페이지 메인 트윗과 사용자 펼침 상태는 숨김보다 먼저 예외 처리한다.

### Options and settings

```text
options/index.ts
  - find DOM nodes
  - load initial settings/custom filters/storage state
  - wire events
        |
        +-------------------+------------------+------------------+
        |                   |                  |                  |
        v                   v                  v                  v
categories.ts        rule-stats.ts      filter-pack-list.ts  export-modal.ts
  - render builtin     - count builtin     - render packs       - collect metadata
  - toggle category    - count custom      - toggle/remove      - download JSON
  - persist disabled   - count pack        - import sanitized
        |                   |                  |                  |
        +-------------------+------------------+------------------+
                            |
                            v
storage and feature APIs
  - settings storage
  - keyword-filter storage
  - filter-pack storage
```

Boundary:
- Options UI 모듈은 DOM 이벤트와 렌더링을 담당한다.
- feature storage module이 WXT `browser.storage` 접근을 담당한다.
- 파일 import는 허용된 FilterPack 필드만 추출해 저장한다.

## 선행 결정: Storage 접근 경계 정리

### 대상

- `docs/ARCHITECTURE.md`
- `src/features/settings/storage.ts`
- `src/features/stats/stats-storage.ts`
- `src/features/filter-pack/pack-storage.ts`
- `src/features/keyword-filter/filter-storage.ts`
- `src/features/keyword-collector/collector-storage.ts`
- `src/content/follow-collector.ts`
- `src/content/filter-pipeline.ts`
- `src/content/milestone-banner.ts`
- `src/shared/types/index.ts`
- `src/shared/constants/index.ts`

### 문제

- `docs/ARCHITECTURE.md`는 Chrome API 직접 호출을 entrypoints 또는 shared/utils로 제한하지만, 실제 구현은 feature/content에서 WXT `browser.storage`를 직접 사용한다.
- 현재 구조가 반드시 잘못된 것은 아니지만 문서와 구현이 불일치한다.
- 이 결정을 뒤로 미루면 앞 단계에서 분리한 새 모듈들이 나중에 adapter 도입 여부에 따라 다시 바뀔 수 있다.

### 결정

- feature storage module에서는 WXT `browser.storage` 사용을 허용한다고 `docs/ARCHITECTURE.md`에 명시한다.
- content module은 storage change listener처럼 브라우저 이벤트를 직접 다루는 경우를 예외로 허용한다.
- `StorageSchema`와 `STORAGE_KEYS`를 동기화한다.
  - `followCache`
  - `collectedFadaks`
  - `disabledFilterCategories`
  - `filterPacks`
- `src/shared/storage.ts` adapter는 지금 도입하지 않는다. storage mock 중복이나 브라우저별 storage 차이가 실제 반복 비용이 될 때 별도 리팩터링으로 검토한다.

### 검증

- 문서만 변경할 경우 별도 테스트는 생략 가능하다.
- `StorageSchema`를 수정하는 경우 `npm test`와 Chrome/Firefox/Edge 빌드를 실행한다.
- storage 호출부를 함께 수정하는 경우 `npm test`, `npm run build`, `npm run build:firefox`를 실행한다.
- CI에서는 Chrome/Firefox/Edge 빌드를 모두 검증한다.

## 우선순위 1: Options 페이지 분리

### 대상

- `src/options/index.ts`

### 문제

- 392줄로 프로젝트 파일 크기 기준 300줄을 초과한다.
- 초기화, 내장 카테고리 렌더링, rule count 계산, 필터팩 목록, 파일 import, export modal 생성이 한 파일에 섞여 있다.
- `renderCategories`, `createPackItem`, `showExportModal` 등 50줄 이상 함수가 다수 존재한다.

### 수정 방향

- `src/options/categories.ts`
  - 카테고리 렌더링
  - 카테고리 toggle 저장
- `src/options/rule-stats.ts`
  - builtin/custom/pack rule count 계산
  - DOM 반영
- `src/options/filter-pack-list.ts`
  - 필터팩 목록 렌더링
  - enable/remove 이벤트
- `src/options/export-modal.ts`
  - export modal 생성
  - JSON download 처리
- `src/features/filter-pack/pack-parser.ts`
  - 외부 JSON을 `FilterPack`으로 검증/정규화하는 순수 함수
  - Options 파일 import와 `pack-loader.ts`가 같은 parser를 재사용
- `src/options/index.ts`
  - DOM 조회, 초기 데이터 로드, 이벤트 연결만 담당

### 사전 테스트 보강

- `tests/options/categories.test.ts`
  - 내장 필터 활성 상태에서 카테고리와 keyword chip 렌더링
  - 내장 필터 비활성 상태에서 disabled 안내 렌더링
  - 카테고리 toggle 시 disabled category storage write
- `tests/options/rule-stats.test.ts`
  - builtin/custom/pack rule count 계산
  - filter pack 로드 실패 시 count update가 깨지지 않음
- `tests/options/filter-pack-list.test.ts`
  - pack enable/remove 이벤트
  - empty state 렌더링
- `tests/options/export-modal.test.ts`
  - 기본 metadata로 JSON 다운로드 생성
  - cancel/overlay close 동작
- `tests/features/filter-pack/pack-parser.test.ts`
  - 필수 필드 `id`, `name`, `rules` 누락 시 실패
  - 문자열 길이 제한과 optional field 정규화
  - `homepage`는 `https://`만 허용
- `pack-loader.test.ts`는 remote JSON 파싱이 공통 parser를 통과하는지 확인
- Options import 테스트를 추가하는 경우 잘못된 pack 파일은 저장하지 않는지 확인

### 검증

- `npm test`
- `npm run build`

## 우선순위 2: Injected interceptor 책임 분리

### 대상

- `src/injected/fetch-interceptor.ts`

### 문제

- fetch patch, XHR patch, profile extraction/cache, React fiber 탐색, tweet article observer가 한 파일에 섞여 있다.
- `extractBadgeData`와 `extractArticleDataFromFiber`가 길고, React fiber 탐색은 X UI 변경에 취약하다.
- MAIN world 제약 때문에 shared import가 제한되므로 변경 시 상수 동기화와 테스트가 중요하다.

### 수정 방향

- `src/injected/**` 모듈은 page `MAIN` world 번들에 포함되므로 local relative import만 사용한다.
  - 허용: `./data-extractors`, `./profile-extractor` 같은 injected 내부 relative import
  - 금지: `@shared/*`, `@features/*`, `wxt/browser`, `chrome.*`, `browser.*`
- `src/injected/network-interceptor.ts`
  - fetch/XHR patch
  - GraphQL endpoint 감지
- `src/injected/data-extractors.ts`
  - GraphQL JSON payload 순회
  - `maxDepth`, `maxNodes` budget으로 깊거나 큰 payload에서 main thread 점유와 stack overflow 방지
- `src/injected/profile-extractor.ts`
  - user object -> profile 변환
  - cache replay
- `src/injected/fiber-follow-detector.ts`
  - article에서 React fiber 탐색
  - followed handle 추출
- `src/injected/fetch-interceptor.ts`
  - 위 모듈을 연결하는 bootstrap만 담당

### 사전 테스트 보강

- injected 모듈이 `@shared`, `@features`, `wxt/browser`, `chrome.*`, `browser.*`를 import하지 않는지 확인하는 boundary test
- `tests/injected/network-interceptor.test.ts`
  - fetch GraphQL response에서 badge/profile data 처리
  - XHR GraphQL response에서 동일 payload 처리
  - JSON parse 실패 시 원본 response 흐름 유지
- `tests/injected/data-extractors.test.ts`
  - 정상 nested payload에서 user/follow handle 추출 유지
  - depth budget을 넘는 payload는 stack overflow 없이 중단
  - node budget을 넘는 큰 payload는 main thread 장시간 점유 없이 중단
- `tests/injected/profile-extractor.test.ts`
  - user object -> profile mapping
  - malformed user skip
  - profile cache max size와 eviction
  - `BBR_CONTENT_READY` 수신 시 cached profiles replay
- `tests/injected/fiber-follow-detector.test.ts`
  - React fiber props에서 followed handle 추출
  - depth guard와 cycle guard
  - following이 false이면 postMessage 없음
  - Business/legacy badge여도 팔로우 예외 처리를 위해 followed handle은 추출
- `MESSAGE_TYPES`, `X_GRAPHQL_ENDPOINTS`가 shared constants와 동기화되어 있는지 확인하는 기존 테스트 유지

### 검증

- `npm test`
- `npm run build`
- 가능하면 `npm run build:firefox`

## 우선순위 3: Tweet orchestration 축소

### 대상

- `src/content/tweet-orchestrator.ts`
- `src/content/message-handler.ts`

### 문제

- `processTweet`가 추출, 예외 판단, 키워드 수집, classifier 호출, DOM 조작, 통계 기록을 모두 수행한다.
- false positive 이슈 대응 시 어느 단계에서 판단이 잘못됐는지 분리하기 어렵다.

### 수정 방향

- `buildTweetContext(tweetEl)`
  - author, statusPath, displayName, tweetText, profile, pageType 수집
- `shouldSkipTweet(context)`
  - 프로필 페이지, 본인 트윗, 펼친 트윗, 상세 메인 트윗 예외 처리
- `applyTweetAction(tweetEl, result, context)`
  - show/hide/skip DOM 처리
  - 통계 기록
- `processQuoteBlock(...)`
  - 현재 함수 유지하되 입력 context를 명확히 정리
- `reprocessExistingTweets()`
  - `TIMINGS.REPROCESS_CHUNK_SIZE`를 실제 사용해 frame 단위 chunk 처리
  - 한 프레임에서 모든 article을 처리하지 않도록 분할
- `scheduleProfileReprocess(updatedHandles)`
  - `PROFILE_DATA` 수신 시 전체 feed를 즉시 재스캔하지 않고 handle set을 누적
  - 연속 payload는 하나의 queue로 병합해 중복 순회를 줄임
  - `TIMINGS.REPROCESS_CHUNK_SIZE` 단위로 frame마다 대상 article을 처리

### 사전 테스트 보강

- 상세 페이지 메인 트윗은 숨기지 않는 케이스
- 사용자가 펼친 트윗은 재숨김하지 않는 케이스
- quote 전체 숨김과 quote block 숨김의 분기 케이스
- profile cache가 있으면 displayName/bio를 context에 반영하는 케이스
- retweet context가 hide metadata에 반영되는 케이스
- `result.action === "skip"`이고 이전에 숨겨진 트윗이면 복원하는 케이스
- hide action은 `recordHide`를 한 번만 호출하는 케이스
- keyword collector는 author area에 badge가 있을 때만 buffer하는 케이스
- quote hide-quote는 `hideQuoteBlock`, quote hide-entire는 `hideTweet`을 호출하는 케이스
- `reprocessExistingTweets()`는 `TIMINGS.REPROCESS_CHUNK_SIZE` 단위로 처리하고 다음 frame에 이어서 처리하는 케이스
- `reprocessExistingTweets()`가 이미 예약된 동안 중복 예약하지 않는 케이스
- `PROFILE_DATA`가 연속으로 들어오면 updated handle set을 병합하고 한 번만 재처리 예약하는 케이스
- profile 재처리는 `TIMINGS.REPROCESS_CHUNK_SIZE` 단위로 article을 처리하는 케이스
- profile 재처리 중 기존 debug label 제거와 `processTweet` error guard가 유지되는 케이스
- 테스트 setup이 커지면 `tests/content/tweet-orchestrator.fixture.ts`로 DOM/mock helper를 분리한다.

### 검증

- `npm test`
- `npm run build`

## 우선순위 4: Fadak banner 공통화

### 대상

- `src/content/fadak-banner.ts`
- `src/features/badge-detection/svg-fallback.ts`
- `src/features/badge-detection/index.ts`

### 문제

- profile banner와 detail banner가 동일한 흐름을 반복한다.
- whitelist 버튼 처리, 성공 상태 전환, observer retry, timeout cleanup 로직이 중복된다.
- `fadak-banner.ts`의 badge element 판정 로직이 `detectBadgeSvg`와 중복된다.

### 수정 방향

- `src/features/badge-detection/svg-fallback.ts`
  - `detectBlueBadgeElement(badgeEl)` 추가
  - `detectBadgeSvg(tweetElement)`는 badge element를 찾은 뒤 `detectBlueBadgeElement`를 호출
- `createWhitelistBanner(options)` 내부 헬퍼 도입
- `observeUntilInserted(observerRef, target, tryInsert)` 내부 헬퍼 도입
- profile/detail 차이는 다음 값으로만 표현
  - banner id
  - message translation key
  - badge target 탐색 함수
  - page guard
- `fadak-banner.ts`는 자체 `isBlueBadge`를 제거하고 badge-detection feature API를 사용

### 검증

- `npm test`
- `npm run build`

### 사전 테스트 보강

- `tests/features/badge-detection/svg-fallback.test.ts`
  - `detectBlueBadgeElement`가 파딱/금딱/회딱/부분 렌더링을 `detectBadgeSvg`와 동일하게 판정
- `tests/content/fadak-banner.test.ts`
  - profile/detail banner가 금딱/회딱에는 표시되지 않음
  - whitelist 성공 상태와 observer cleanup 유지

## 우선순위 5: i18n 데이터 분리

### 대상

- `src/shared/i18n.ts`

### 문제

- key union과 3개 언어 데이터가 한 파일에 있어 325줄로 커졌다.
- 문자열 추가 시 diff가 커지고, 번역 누락 검토가 어렵다.

### 수정 방향

- `src/shared/i18n.ts`는 유지한다.
  - `t`
  - `getTranslations`
  - `DEFAULT_LANGUAGE`
  - 기존 `@shared/i18n` import 경로 보존
- `src/shared/i18n-locales/types.ts`
  - `Language`
  - `TranslationKey`
  - `Translations`
- `src/shared/i18n-locales/ko.ts`
- `src/shared/i18n-locales/en.ts`
- `src/shared/i18n-locales/ja.ts`
- `src/shared/i18n-locales/index.ts`
  - locale registry

### 주의

- `src/shared/i18n.ts`를 디렉터리로 바꾸지 않는다. file-to-directory rename은 Vite/Vitest/TS/mock resolution 리스크가 커서 이번 리팩터링 목표에 비해 이득이 작다.
- `public/_locales/*/messages.json`와 중복되는 키는 별도 정리 대상으로 남긴다.

### 사전 테스트 보강

- `src/shared/i18n.test.ts`
  - `ALL_TRANSLATION_KEYS` 또는 locale registry 기반으로 ko/en/ja 전체 key parity 확인
  - `getTranslations`가 지원 언어별 registry를 반환하는지 확인
  - 알 수 없는 언어 입력은 기본 언어 ko로 fallback 되는지 확인
  - placeholder 치환은 복수 parameter를 처리하는지 확인
- `public/_locales/*/messages.json`의 `extName`, `extDescription`과 runtime i18n 값의 정합성은 별도 정리 대상으로 남기되, 이번 단계에서 건드릴 경우 parity test에 포함한다.

### 검증

- `npm test`
- `npm run build`

## 우선순위 6: 테스트 파일 분리

### 대상

- `tests/content/message-handler.test.ts`
- `tests/content/tweet-processing.test.ts`

### 문제

- `message-handler.test.ts`는 431줄이며 origin guard, badge no-op, profile payload, follow payload를 모두 포함한다.
- 실패 시 원인 파악이 느리고 mock setup이 커진다.

### 수정 방향

- `tests/content/message-handler.guard.test.ts`
- `tests/content/message-handler.profile.test.ts`
- `tests/content/message-handler.follow.test.ts`
- 공통 mock/helper는 `tests/content/message-handler.fixture.ts` 또는 `tests/helpers/`로 이동

### 검증

- `npm test`

## 우선순위 7: Debug logging 정리

### 대상

- `src/content/index.ts`
- `src/content/message-handler.ts`
- `src/content/tweet-orchestrator.ts`
- `src/injected/fetch-interceptor.ts`

### 문제

- debug mode에서 직접 `console.log` / `console.error`가 남아 있다.
- 품질 문서는 구조화된 logger 사용을 요구한다.
- injected MAIN world에서는 shared logger import가 어렵다.

### 수정 방향

- content script 쪽은 `debugLog(settings, message, data)` / `debugError(settings, message, data)` 같은 gate helper를 둔다.
  - helper 내부에서만 `logger`를 호출한다.
  - `settings.debugMode`가 꺼져 있으면 출력하지 않는다.
- injected script 쪽은 로컬 `debugLog(...args)` 헬퍼를 만들고 `bbrDebugMode` guard를 중앙화한다.
- 이 변경은 동작보다 관찰성 정리이므로 별도 브랜치에서 작게 진행한다.

### 사전 테스트 보강

- content debug helper는 `debugMode: false`일 때 logger를 호출하지 않는다.
- content debug helper는 `debugMode: true`일 때 구조화된 logger를 호출한다.
- injected debug helper는 `bbrDebugMode`가 false일 때 console을 호출하지 않는다.

### 검증

- `npm test`
- `npm run build`

## 실행 순서 제안

1. Storage 경계 문서 정리
2. Options 페이지 분리
3. Fadak banner 공통화
4. Tweet orchestration 축소
5. Injected interceptor 분리
6. i18n 데이터 분리
7. 테스트 파일 분리
8. Debug logging 정리

## 각 단계 공통 완료 기준

- 변경 전후 기능 동작이 동일하다.
- 새 파일은 300줄 이하를 유지한다.
- 새 함수는 50줄 이하를 목표로 한다.
- 기존 테스트가 모두 통과한다.
- DOM/X API 의존 로직을 바꾸는 경우 관련 regression test를 먼저 추가한다.
- 최종 확인:

```bash
npm test
npm run build
npm run build:firefox
npm run build:edge
```

문서만 수정하는 단계는 테스트를 생략할 수 있다. 코드, WXT entrypoint, manifest, import alias, shared module을 수정하는 단계는 Chrome/Firefox/Edge 빌드를 모두 확인한다.

## 테스트 커버리지 지도

```text
CODE PATHS                                           USER FLOWS
[+] Storage boundary                                 [+] Settings/filter changes propagate
  ├── [GAP] StorageSchema matches STORAGE_KEYS         ├── [★★ TESTED] settings storage
  └── [GAP] architecture rule allows feature storage   └── [GAP] disabled categories schema covered

[+] Options split                                    [+] Configure advanced filters
  ├── [GAP] categories render/toggle                   ├── [GAP] toggle builtin category persists
  ├── [GAP] rule stats count builtin/custom/pack       ├── [GAP] custom filter save refreshes counts
  ├── [GAP] filter pack list enable/remove             ├── [GAP] invalid pack import does not save
  └── [GAP] export modal JSON download                 └── [GAP] valid pack import saves sanitized pack

[+] Injected interceptor split                       [+] X data reaches content script
  ├── [★★ TESTED] data extractor pure traversal        ├── [GAP] fetch GraphQL posts badge/profile data
  ├── [GAP] fetch/XHR network interception             ├── [GAP] XHR GraphQL posts same data
  ├── [GAP] profile mapping/cache replay               └── [GAP] CONTENT_READY replays cached profiles
  ├── [GAP] data extractor depth/node budget
  └── [GAP] fiber follow detection guard paths

[+] Tweet orchestration                              [+] Timeline/detail filtering behavior
  ├── [★★ TESTED] basic hide/show                      ├── [★★ TESTED] hide unfollowed blue badge tweet
  ├── [GAP] detail main tweet skip                     ├── [GAP] expanded tweet is not hidden again
  ├── [GAP] expanded tweet restore                     ├── [GAP] quote-only hides quote block
  ├── [GAP] recordHide exactly once                    └── [GAP] quote-entire hides parent tweet
  ├── [GAP] keyword collector author-badge guard
  └── [GAP] PROFILE_DATA reprocess coalesce/chunk

[+] Fadak banner                                     [+] Profile/detail warning banner
  ├── [★★ TESTED] profile whitelist button             ├── [★★ TESTED] profile whitelist add
  ├── [GAP] detail banner                              ├── [GAP] detail banner whitelist add
  ├── [GAP] gold/grey badge suppression                └── [GAP] observer cleanup after insert/timeout
  └── [GAP] shared badge element detection

[+] i18n split                                       [+] Runtime translation lookup
  ├── [★★ TESTED] sample key lookup                    ├── [GAP] every key exists in ko/en/ja
  ├── [★★ TESTED] sample placeholder replacement       └── [GAP] unknown language falls back to ko
  └── [GAP] locale registry parity

[+] Debug logging                                    [+] Debug mode observability
  ├── [GAP] content debug helper gate                  ├── [GAP] debug off emits no logs
  └── [GAP] injected debug helper gate                 └── [GAP] debug on emits structured logs
```

Legend:
- `★★ TESTED`: existing behavior test covers the main path.
- `GAP`: add or update tests before implementing that refactoring step.

## NOT in scope

- `src/shared/storage.ts` adapter 도입: 현재 storage 접근 불일치는 문서와 schema 정리로 먼저 해결한다. adapter는 mock 중복이나 브라우저별 차이가 반복 비용으로 확인될 때 별도 작업으로 둔다.
- `public/_locales/*/messages.json`와 runtime i18n 전체 통합: i18n 파일 분리와 key parity가 먼저다. 웹스토어 locale metadata 정리는 별도 배포 문맥에서 처리한다.
- Options 페이지 UI 재설계: 이번 단계는 책임 분리와 검증 가능한 parser 재사용이 목적이다. 화면 구조나 스타일 변경은 하지 않는다.
- Firefox Android 자동 E2E 구축: 가치가 있지만 현재 리팩터링의 직접 완료 조건은 아니다. 기존 `TODOS.md`의 모바일 QA/PoC 항목으로 유지한다.
- `stats-storage.ts` reset/cleanup의 `get(null)` 최적화: 사용자 상호작용 핫패스가 아니며 v1.4.0에서 전체 통계 조회 경로는 이미 분리되어 있다.

## 이미 존재하는 구현과 재사용 대상

- `FeedObserver`는 mutation burst를 RAF 단위로 묶는다. 신규 timeline 관찰 로직을 만들지 말고 `reprocessExistingTweets()`와 `PROFILE_DATA` 재처리만 chunk queue로 보강한다.
- `TIMINGS.REPROCESS_CHUNK_SIZE`는 이미 상수로 존재한다. 새 batch size 상수를 만들지 말고 이 값을 재사용한다.
- `detectBadgeSvg`는 SVG 기반 파딱 판정의 기준 구현이다. Fadak banner는 자체 `isBlueBadge`를 유지하지 말고 badge-detection feature API를 재사용한다.
- `parseCategories`, `parseFilterList`, `buildActiveRules`는 필터 rule 계산의 기준 구현이다. Options 분리 후 `rule-stats.ts`는 이 함수들을 감싸는 얇은 UI helper로 유지한다.
- `pack-loader.ts`와 Options import는 같은 `pack-parser.ts`를 공유한다. 외부 JSON sanitizer를 두 군데에 다시 구현하지 않는다.
- `ProfileCache`, `BadgeCache`, `collectorBuffer`는 기존 state/cache 레이어다. refactor 중 cache semantics를 바꾸지 말고 테스트로 eviction/backfill 동작만 고정한다.

## 구현 중 유지할 다이어그램

- `docs/REFACTORING_PLAN.md`의 Injected, Tweet processing, Options 흐름 다이어그램은 각 단계 PR에서 실제 파일명과 함수명이 달라지면 함께 갱신한다.
- `src/content/tweet-orchestrator.ts`가 `buildTweetContext` / `shouldSkipTweet` / `applyTweetAction`으로 분리되면 파일 상단에 간단한 처리 순서 주석을 유지한다.
- `src/injected/fetch-interceptor.ts`가 bootstrap으로 줄어든 뒤에는 MAIN world boundary 주석만 남기고, 상세 순회/observer 다이어그램은 새 모듈 테스트에 둔다.

## 실패 모드와 커버리지

| 영역 | 현실적인 실패 모드 | 테스트/처리 계획 |
|------|--------------------|------------------|
| Storage boundary | `StorageSchema`와 `STORAGE_KEYS` 불일치로 특정 저장값이 타입 밖에서만 존재 | schema/key parity 테스트와 Chrome/Firefox/Edge 빌드 |
| Options pack import | 악성/깨진 JSON 파일이 저장되어 필터 로딩이 실패 | `pack-parser.test.ts`에서 필수 필드, 길이 제한, https homepage, invalid file no-save 검증 |
| Injected network parsing | GraphQL JSON parse 실패가 원본 fetch/XHR 흐름까지 깨뜨림 | network interceptor 테스트에서 parse 실패 후 원본 response 유지 검증 |
| Injected traversal | 깊거나 큰 payload가 stack overflow 또는 긴 main-thread 점유를 유발 | data extractor depth/node budget 테스트 |
| Fiber follow detection | React fiber 구조 변경으로 followed handle을 못 찾거나 무한 순회 | depth/cycle guard와 following false no-postMessage 테스트 |
| Tweet orchestration | 상세 메인 트윗, 펼친 트윗, quote hide 분기가 false positive를 만듦 | 상세/expanded/quote 분기 regression 테스트 |
| Reprocess queue | 설정 변경이나 profile data 연속 수신이 한 frame에서 전체 feed를 처리 | `reprocessExistingTweets`와 profile reprocess chunk/coalesce 테스트 |
| Fadak banner | 금딱/회딱에 warning banner가 표시되거나 observer가 남음 | shared badge element detection, gold/grey suppression, observer cleanup 테스트 |
| i18n split | 언어 파일 분리 후 특정 key 누락이 런타임 undefined로 노출 | ko/en/ja key parity와 unknown language fallback 테스트 |
| Debug logging | debug off 상태에서 console noise가 남거나 injected에서 shared logger import로 번들 경계가 깨짐 | content/injected debug helper gate 테스트와 injected import boundary 테스트 |

Critical silent gap:
- 현재 계획 반영 후에는 테스트 없이 조용히 실패하는 P1급 gap은 남기지 않는다. 구현 시 위 테스트 중 하나라도 생략하면 해당 단계 PR을 완료하지 않는다.

## 병렬 작업 전략

| Step | Modules touched | Depends on |
|------|-----------------|------------|
| Storage boundary | `docs/`, `src/shared/`, `src/features/*/storage`, `src/content/` storage users | - |
| Options split | `src/options/`, `src/features/filter-pack/`, `tests/options/` | Storage boundary |
| Fadak banner commonization | `src/content/`, `src/features/badge-detection/`, `tests/content/`, `tests/features/badge-detection/` | Storage boundary |
| Tweet orchestration | `src/content/`, `tests/content/` | Fadak banner commonization 권장 |
| Injected split | `src/injected/`, `tests/injected/` | Storage boundary |
| i18n split | `src/shared/`, `public/_locales/` if touched, shared tests | Storage boundary |
| Test file split | `tests/content/`, `tests/helpers/` | Tweet orchestration 이후 권장 |
| Debug logging | `src/content/`, `src/injected/`, shared logger tests | Tweet orchestration and Injected split 이후 권장 |

Parallel lanes:
- Lane A: Storage boundary 먼저 단독 진행.
- Lane B: Options split. Storage boundary 이후 독립 진행 가능.
- Lane C: Fadak banner commonization -> Tweet orchestration -> Test file split -> Debug logging. `src/content/`를 공유하므로 순차 진행한다.
- Lane D: Injected split. Storage boundary 이후 Lane B/C와 병렬 가능.
- Lane E: i18n split. Storage boundary 이후 독립 진행 가능.

Conflict flags:
- Lane C와 Debug logging은 `src/content/`를 같이 만지므로 같은 worktree에서 순차 처리한다.
- Injected split과 Debug logging은 `src/injected/fetch-interceptor.ts`를 같이 만질 수 있으므로 Injected split을 먼저 끝낸 뒤 debug helper를 얹는다.
- Options split과 i18n split은 화면 문자열을 건드리면 충돌할 수 있다. i18n runtime key 변경이 필요한 경우 Options PR 머지 후 진행한다.

## Eng review completion summary

- Step 0: Scope Challenge — full 8-step roadmap accepted as-is.
- Architecture Review: 5 issues reflected.
- Code Quality Review: 4 issues reflected.
- Test Review: coverage map produced, 27 gaps captured.
- Performance Review: 3 issues reflected.
- NOT in scope: written.
- What already exists: written.
- TODOS.md updates: 0 new items proposed. The refactoring work is captured in this plan; existing mobile/store TODOs remain separate.
- Failure modes: 0 critical silent gaps left after planned tests.
