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
- [ ] GitHub Secrets에 Edge 키 등록 후 release.yml의 자동 제출 활성화

### 웹스토어 페이지 개선
- [ ] 영문 설명 작성/개선
- [ ] before/after 스크린샷 제작
- [ ] Privacy Policy URL 등록 (docs/PRIVACY.md → GitHub Pages 또는 raw URL)

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
- `wxt.config.ts`의 `raw.githubusercontent.com/*` → `fotoner/blue-badge-remover/*`로 스코핑

## 향후

### 모바일 QA
- [ ] Firefox Android 실기기 수동 QA (설정 저장, 팔로우 동기화, 필터링 동작)

### 모바일 E2E PoC
- Firefox Android 자동 테스트 접근법 조사 (Appium 등)
