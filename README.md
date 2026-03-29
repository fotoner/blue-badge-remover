# Blue Badge Remover

<p align="center">
  <img src="public/icons/icon.svg" alt="Blue Badge Remover" width="96">
</p>

<p align="center">
  <strong>X(Twitter)에서 수익성 파란 뱃지(Premium) 계정을 숨기는 크롬 익스텐션</strong><br>
  팔로우 중인 계정과 화이트리스트는 예외 처리됩니다
</p>

<p align="center">
  <img alt="Manifest V3" src="https://img.shields.io/badge/Manifest-V3-blue">
  <img alt="TypeScript" src="https://img.shields.io/badge/TypeScript-strict-3178c6">
  <img alt="License" src="https://img.shields.io/badge/License-MIT-green">
</p>

<p align="center">
  <img src="docs/img/twitter-stat.png" alt="730K impressions, 10.1K retweets, 5.98K likes" width="520">
</p>

---

## Screenshots

<p align="center">
  <img src="docs/img/screen.png" alt="Popup UI" width="340">
</p>

## Features

| 기능 | 설명 |
|------|------|
| **파딱 감지** | GraphQL API 응답 기반 판별 + SVG 뱃지 폴백 (레거시/기관 계정 제외) |
| **숨김 범위** | 타임라인, 트윗 상세(답글), 검색 결과 (각각 토글) |
| **숨김 방식** | 완전 제거 또는 접힌 상태로 표시 (클릭하여 펼치기) |
| **리트윗 필터** | 팔로우가 파딱 트윗을 리트윗한 경우 숨김 (토글) |
| **인용 필터** | 필터링 안 함 / 인용 부분만 숨기기 / 트윗 전체 숨기기 |
| **팔로우 예외** | Following 페이지 방문 시 자동 수집, 계정별 캐시 |
| **화이트리스트** | @핸들 직접 추가로 예외 처리 |
| **계정 전환** | 계정별 팔로우 캐시 자동 전환 |
| **다국어** | 한국어 / English / 日本語 |
| **디버그 모드** | 트윗별 처리 라벨 + 콘솔 로그 |

## Install

### Chrome Web Store

> TODO: 출시 후 링크 추가

### 개발 빌드

```bash
npm install
npm run build
npm run test
```

1. `chrome://extensions` 접속
2. **개발자 모드** 활성화
3. **압축 해제된 확장 프로그램을 로드합니다** 클릭
4. `dist/` 폴더 선택

## Usage

1. **x.com에 로그인**
2. 익스텐션 아이콘 클릭 -> Popup에서 설정
3. **팔로우 동기화**: "팔로잉 페이지 열기" -> 스크롤하면 자동 수집
4. **화이트리스트**: 예외 처리할 계정의 @핸들 추가

### 숨김 동작

| 상황 | 동작 |
|------|------|
| 파딱의 직접 트윗 | 숨김 (팔로우/화이트리스트 제외) |
| 팔로우가 파딱을 리트윗 | retweetFilter ON이면 숨김 |
| 누군가 파딱을 인용 | quoteMode 설정에 따라 처리 |
| 팔로우의 직접 트윗 | 파딱이어도 표시 |

## How It Works

```
x.com 페이지 로드
  |
  +-- fetch interceptor 주입 (XHR 패치)
  |     +-- GraphQL 응답에서 뱃지 데이터 추출 (is_blue_verified + legacy.verified)
  |     +-- Following API 응답에서 팔로우 핸들 추출 (core.screen_name)
  |
  +-- MutationObserver로 새 트윗 감지
  |     +-- 작성자 핸들 추출 (socialContext 링크 건너뜀)
  |     +-- 파딱 판별 (API 캐시 -> SVG 폴백)
  |     +-- 팔로우/화이트리스트 예외 체크
  |     +-- 숨김 처리 (remove / collapse + 맥락 정보)
  |
  +-- 인용 트윗: "인용" 텍스트 기반 블록 감지
  +-- SPA 네비게이션: pushState/popstate 감지 -> 기존 트윗 재처리
```

## Tech Stack

- **TypeScript** (strict mode)
- **Chrome Extension** Manifest V3
- **Vite** + **CRXJS**
- **Vitest**

## Project Structure

```
src/
├── background/              # Service Worker
├── content/                 # Content Script (메인 로직)
├── popup/                   # Popup UI (설정)
├── features/
│   ├── badge-detection/     # 뱃지 감지 (API + SVG)
│   ├── content-filter/      # 트윗 필터링 (Observer + Hider)
│   ├── follow-list/         # 팔로우 동기화
│   └── settings/            # Chrome Storage 래퍼
├── shared/
│   ├── types/               # Settings, BadgeInfo
│   ├── constants/           # 기본값, 스토리지 키
│   ├── utils/               # 구조화 로거
│   └── i18n.ts              # 다국어 번역
public/
├── fetch-interceptor.js     # 페이지 컨텍스트 주입 스크립트
├── icons/                   # 익스텐션 아이콘
└── _locales/                # Chrome i18n (ko, en, ja)
```

## Privacy

- 수집하는 데이터: 없음
- 외부 서버 통신: 없음 (모든 처리가 로컬)
- 인증 토큰 저장: 안 함
- 권한: `storage` + `x.com` host permission만 사용
- 상세: [PRIVACY_POLICY.md](PRIVACY_POLICY.md)

## License

MIT

## Author

[@fotoner_p](https://x.com/fotoner_p)
