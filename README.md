# Blue Badge Remover

<p align="center">
  <img src="public/icons/icon.svg" alt="Blue Badge Remover" width="96">
</p>

<p align="center">
  <strong>X(Twitter)에서 수익성 파란 뱃지(Premium) 계정을 숨기는 브라우저 확장</strong><br>
  팔로우 중인 계정과 화이트리스트는 예외 처리됩니다
</p>

<p align="center">
  <a href="https://chromewebstore.google.com/detail/cjhmbgfnddpcdfmoicfcocekmainhhdm?utm_source=item-share-cb"><img alt="Chrome Web Store" src="https://img.shields.io/badge/Chrome_Web_Store-v1.3.2-4285F4?logo=googlechrome&logoColor=white"></a>
  <img alt="Manifest V3" src="https://img.shields.io/badge/Manifest-V3-blue">
  <img alt="TypeScript" src="https://img.shields.io/badge/TypeScript-strict-3178c6">
  <img alt="License" src="https://img.shields.io/badge/License-MIT-green">
  <a href="https://x.com/Fotoner_P/status/2037977299191251444"><img alt="Featured on X" src="https://img.shields.io/badge/Featured_on_X-10K+_retweets-000000?logo=x&logoColor=white"></a>
</p>

## Screenshots

<p align="center">
  <img src="docs/img/screen.png" alt="Popup UI" width="340">
</p>

## Features

| 기능 | 설명 |
|------|------|
| **파딱 감지** | GraphQL API 응답 기반 판별 + SVG 뱃지 폴백 (금딱/기관 계정 제외) |
| **숨김 범위** | 타임라인, 트윗 상세(답글), 검색 결과, 북마크 (각각 토글) |
| **숨김 방식** | 완전 제거 또는 접힌 상태로 표시 (방패 아이콘 + 클릭하여 펼치기) |
| **리트윗 필터** | 팔로우가 파딱 트윗을 리트윗한 경우 숨김 (토글) |
| **인용 필터** | 필터링 안 함 / 인용 부분만 숨기기 / 트윗 전체 숨기기 |
| **키워드 필터** | 특정 키워드를 포함하는 파딱만 선별 숨김 (AdGuard식 문법) |
| **카테고리 필터** | 내장 키워드를 카테고리별(정치, 경제, 욕설 등) 개별 토글 |
| **팔로우 예외** | 타임라인 fiber 자동 감지 + Following 페이지 수동 동기화, 계정별 캐시 |
| **화이트리스트** | 별도 관리 페이지에서 @아이디 추가, 프로필 배너에서 원클릭 추가 |
| **계정 전환** | 계정별 팔로우 캐시 자동 전환, 즉시 재필터링 |
| **다국어** | 한국어 / English / 日本語 |
| **멀티 브라우저** | Chrome + Firefox + Edge (WXT 기반 빌드) |
| **모바일 지원** | Firefox Android (설정 바로가기, 탭 내 페이지 이동) |
| **디버그 모드** | 트윗별 처리 라벨 + 콘솔 로그 |

## Install

### Chrome Web Store

[**Chrome Web Store에서 설치**](https://chromewebstore.google.com/detail/cjhmbgfnddpcdfmoicfcocekmainhhdm?utm_source=item-share-cb)

### Firefox / Edge

[GitHub Releases](https://github.com/fotoner/blue-badge-remover/releases)에서 ZIP 다운로드 후 수동 설치.
(스토어 등록 준비 중)

### 개발 빌드

```bash
npm install
npm run build          # Chrome
npm run build:firefox  # Firefox
npm run build:edge     # Edge
npm test               # 204 tests
```

1. `chrome://extensions` 접속 (Edge: `edge://extensions`)
2. **개발자 모드** 활성화
3. **압축 해제된 확장 프로그램을 로드합니다** 클릭
4. `dist/chrome-mv3/` 또는 `dist/firefox-mv2/` 또는 `dist/edge-mv3/` 폴더 선택

## Usage

1. **x.com 또는 twitter.com에 로그인**
2. 익스텐션 아이콘 클릭 -> Popup에서 설정
3. **팔로우 동기화**: 타임라인에서 자동 감지 + "팔로잉 페이지 열기"로 전체 수집
4. **화이트리스트**: 별도 관리 페이지에서 @아이디 추가, 또는 파딱 프로필 배너에서 바로 추가
5. **키워드 필터**: 팝업에서 키워드 필터 활성화 -> 고급 필터 설정에서 카테고리별 토글/커스텀 규칙 편집

### 숨김 동작

| 상황 | 동작 |
|------|------|
| 파딱의 직접 트윗 | 숨김 (팔로우/화이트리스트 제외) |
| 팔로우가 파딱을 리트윗 | retweetFilter ON이면 숨김 |
| 누군가 파딱을 인용 | quoteMode 설정에 따라 처리 |
| 팔로우의 직접 트윗 | 파딱이어도 표시 |
| 북마크 페이지 | 기본적으로 표시 (설정에서 변경 가능) |
| 본인 트윗 | 본인이 파딱이어도 항상 표시 |

## Tech Stack

- **TypeScript** (strict mode)
- **Chrome Extension** Manifest V3
- **WXT** (Next-gen Web Extension Framework, Chrome + Firefox + Edge)
- **Vitest** (204 tests) + **Playwright** (E2E)

## Project Structure

```
entrypoints/                  # WXT 진입점
├── background.ts             # Service Worker
├── content.ts                # Content Script (ISOLATED world)
├── injected.content.ts       # fetch/XHR 인터셉터 (MAIN world)
├── popup/                    # Popup UI
├── options/                  # 고급 필터 설정
├── whitelist/                # 화이트리스트 관리
└── collector/                # 키워드 수집 분석

src/
├── content/                  # Content Script 로직 (6개 모듈)
├── injected/                 # MAIN world 스크립트
├── features/
│   ├── badge-detection/      # 뱃지 감지 (API + SVG)
│   ├── content-filter/       # 트윗 필터링 (Observer + Hider)
│   ├── keyword-filter/       # 키워드 필터 (파서 + 매처 + 카테고리)
│   ├── keyword-collector/    # 키워드 수집 (토크나이저 + 통계)
│   ├── follow-list/          # 팔로우 동기화
│   └── settings/             # Chrome Storage 래퍼
├── shared/
│   ├── types/                # Settings, BadgeInfo, FilterRule
│   ├── constants/            # 기본값, 스토리지 키
│   ├── utils/                # 구조화 로거
│   └── i18n.ts               # 다국어 번역 (ko/en/ja)
├── popup/                    # Popup 로직
├── options/                  # Options 로직
├── whitelist/                # 화이트리스트 로직
└── collector/                # 수집기 로직

public/
├── icons/                    # 익스텐션 아이콘
└── _locales/                 # Chrome i18n (ko, en, ja)
```

## Privacy

- 수집하는 데이터: 없음
- 외부 서버 통신: 없음 (모든 처리가 로컬)
- 인증 토큰 저장: 안 함
- 권한: `storage` + `x.com`/`twitter.com` host permission만 사용
- 상세: [docs/PRIVACY.md](docs/PRIVACY.md)

## Disclaimer

> This extension modifies the user's local browser display only. It does not access, modify, or interfere with X's servers or API.

## License

[MIT](LICENSE)

## Author

[@fotoner_p](https://x.com/fotoner_p)
