# TODOS

## 완료

### ~~reprocessExistingTweets() 버그 수정~~ (v1.3.2)
- quote-only hide 복원 안 되던 문제 수정

### ~~public/fetch-interceptor.js 스테일 파일 정리~~ (v1.3.0 WXT 전환)
- WXT 전환 시 자동 제거됨

## 수동 작업 필요

### 스토어 API 키 발급
- [x] Chrome Web Store: 완료
- [x] Firefox AMO: 완료
- [x] Edge Add-ons: 완료
- [ ] GitHub Secrets에 Edge 키 등록 — `release.yml`의 Edge 제출 스텝은 준비됨 (`EDGE_PRODUCT_ID` 설정 시 자동 활성화)

### 웹스토어 페이지 개선
- [x] 영문 설명 작성 — `docs/store/listing-en.md` (스토어 콘솔 반영은 수동)
- [ ] before/after 스크린샷 제작 — `docs/store/screenshots.html`로 생성 (v1.6.0 작업 중 PNG는 삭제됨)
- [ ] Privacy Policy URL 등록 — 현재 `listing-en.md`는 GitHub blob 링크 사용, Pages 승격 여부 결정

## 완료 (v1.3.6)

### ~~TypeScript strict 모드 수정~~ (v1.3.3)
- tsc --noEmit 에러 수정 완료, CI에 타입 체크 복원

### ~~tweet-processing.ts 테스트~~ (v1.3.4)
- DOM 추출 유틸리티 테스트 추가 (5개 런타임 모듈 커버)

### ~~Firefox 설정 저장 호환성~~ (v1.3.6)
- chrome.* → wxt/browser 전환으로 Firefox MV2 storage 호환 수정

## 완료 (v1.4.0)

### ~~fiber 기반 팔로우 감지에서 노딱(금딱/기관) 미인식~~
- isBluePremium 체크 추가, API→SVG 타이밍 경합 시 reprocess로 복원

### ~~SVG 뱃지 감지 안정화~~
- SVG true 캐시 안 함 (금딱 부분 렌더링 오감지 방지)
- handleBadgeData 양방향 reprocess + restore 분리
- restoreHiddenTweets expanded 마커 제거 순서 수정

### ~~펼침 상태 유지~~
- 사용자 펼친 트윗을 메모리(expandedSet)에 기록, 스크롤 후 DOM 재생성 시에도 유지

### ~~트윗 상세 페이지 파딱 배너~~
- 상세 페이지(`/user/status/123`) 메인 트윗 숨기지 않고 빨간 배너 + 화이트리스트 버튼 표시

### ~~showTweet 비숨김 트윗 DOM 조작 방지~~
- `data-bbr-original` 가드 추가, 불필요한 DOM write 제거

### ~~filterPacks storage listener 누락~~
- `FILTER_PACKS` storage key + handler 추가, 열린 탭에 팩 변경 즉시 반영

### ~~통계 시스템 정비~~
- UTC → 로컬 타임존 날짜 키
- 자정 경계 buffer.date 기반 저장
- `stats-total` 별도 key로 분리 (전체 storage 로드 제거)

### ~~regex backtracking 방지~~
- wildcard 5개 초과 시 리터럴 fallback

### ~~dead code 정리~~
- `filter-section.ts` 264줄 삭제

## 완료 (CSO 보안 감사 2026-04-05)

### ~~postMessage targetOrigin 수정~~
- `fetch-interceptor.ts`의 5개 `postMessage`를 `'*'` → `window.location.origin`으로 변경

### ~~innerHTML 이스케이프~~
- `account-list.ts`에서 `fadak.handle`에 `escapeHtml()` 적용

### ~~host_permissions 범위 축소~~
- `raw.githubusercontent.com` host_permission 완전 제거 (팩 자동 업데이트 제거)

### ~~alarms 권한 제거~~
- SW 시작 시 timestamp 체크 방식으로 대체

### ~~기본 필터 팩 제거~~
- 번들 팩 삭제, 사용자 가져오기/내보내기로 관리

## 완료 (v1.4.1 ~ v1.6.1)

### ~~인용 트윗 오탐 (#35)~~ (v1.6.0)
- 뱃지 판정을 작성자 영역으로 스코핑, 상세 배너도 동일 헬퍼 사용

### ~~팔로우/화이트리스트 예외 신뢰성~~ (v1.6.0)
- 화이트리스트 대소문자 정규화 + 마이그레이션, 리스트 타임라인 API 팔로우 감지, 인용/리포스트/본인 예외 강화

### ~~성능·안정성~~ (v1.6.0)
- follow-data 스톰 완화, fiber 스캔 배칭, 뒤로가기 스크롤 보정, 통계 중복 집계 수정

### ~~화이트리스트 일괄 등록 UI 미배포~~ (v1.6.1)
- v1.6.0 마크업이 빌드되지 않는 `src/` 사본에만 적용됨 → `entrypoints/`에 반영, 사본 삭제 + 가드 테스트

### ~~dev 의존성 취약점~~ (v1.6.1)
- `npm audit` 0건 (undici, adm-zip, vitest, postcss 등)

## 향후

### 팔로우 감지 실환경 검증
- [ ] 타임라인 GraphQL 응답의 `following` 플래그 실제 위치 확인 (`data-extractors.ts`가 3개 후보 경로를 관용적으로 검사 중) — 실계정 + debugMode로 리스트 타임라인 확인

### 선택 개선
- [ ] 국기 이모지 키워드 경계 매칭 — 현재 substring 매칭이라 `🇸🇮🇱🇻`(슬로베니아+라트비아)가 `🇮🇱`에 걸림. 🇰🇷·🇺🇸도 같은 한계 (`keyword-matcher.ts`)
- [ ] 인용 작성자 추출을 링크 기반 우선으로 전환 (`extractQuoteAuthor`)
- [ ] API 팔로우 감지 안정화 후 fiber 채널 강등
- [ ] 기부 버튼

### 모바일 QA
- [ ] Firefox Android 실기기 수동 QA (설정 저장, 팔로우 동기화, 필터링 동작)

### 모바일 E2E PoC
- Firefox Android 자동 테스트 접근법 조사 (Appium 등)
