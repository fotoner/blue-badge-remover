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
- [ ] Edge Add-ons: Microsoft Partner Center → API 키
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

## 향후

### 모바일 QA
- [ ] Firefox Android 실기기 수동 QA (설정 저장, 팔로우 동기화, 필터링 동작)

### 모바일 E2E PoC
- Firefox Android 자동 테스트 접근법 조사 (Appium 등)
