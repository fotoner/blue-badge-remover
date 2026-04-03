# TODOS

## 완료

### ~~reprocessExistingTweets() 버그 수정~~ (v1.3.2)
- quote-only hide 복원 안 되던 문제 수정

### ~~public/fetch-interceptor.js 스테일 파일 정리~~ (v1.3.0 WXT 전환)
- WXT 전환 시 자동 제거됨

## 수동 작업 필요

### 스토어 API 키 발급
- [ ] Chrome Web Store: Google Cloud Console → OAuth → client ID/secret/refresh token
- [ ] Firefox AMO: addons.mozilla.org → 개발자 허브 → API 키 (JWT issuer/secret)
- [ ] Edge Add-ons: Microsoft Partner Center → API 키
- [ ] GitHub Secrets에 등록 후 release.yml의 자동 제출 활성화

### 웹스토어 페이지 개선
- [ ] 영문 설명 작성/개선
- [ ] before/after 스크린샷 제작
- [ ] Privacy Policy URL 등록 (docs/PRIVACY.md → GitHub Pages 또는 raw URL)

## 향후

### 모바일 E2E PoC
- Firefox Android 자동 테스트 접근법 조사
- Appium 또는 실기기 기반 테스트 가능성 검토

### TypeScript strict 모드 수정
- tsc --noEmit 에러 6개 수정
- CI에 타입 체크 복원

### tweet-processing.ts 테스트
- DOM 추출 유틸리티 15-20개 테스트 (extractTweetAuthor, findQuoteBlock 등)
