# 스토어 배포 자동화 설정 가이드

릴리스 워크플로우(`release.yml`)가 태그 push 시 Chrome, Firefox, Edge 3개 스토어에 자동 제출합니다.
스토어 제출은 스토어별 독립 잡(`submit-store.yml`)이라 한 스토어가 실패해도 나머지는 계속 진행됩니다.

## 배포 흐름

```
정식 릴리스: git tag v1.x.x → push → GitHub Actions
  ├─ test + e2e
  ├─ build: 태그 = package.json 버전 확인 → ZIP 4개 (Chrome, Edge, Firefox, Firefox 소스)
  ├─ release: GitHub Release 생성 (ZIP 첨부)
  └─ submit: chrome / firefox / edge 독립 잡 (submit-store.yml)
       └─ 시크릿이 없으면 해당 스토어 잡이 명확한 오류로 실패 (조용히 건너뛰지 않음)

테스트 릴리스: git tag v1.x.x-test → push → GitHub Actions
  ├─ test + e2e + build
  ├─ GitHub Release 생성 (prerelease)
  └─ 스토어 제출 건너뜀
```

---

## 1. Chrome Web Store

### 1-1. Google Cloud 프로젝트 생성

1. https://console.cloud.google.com 접속
2. 새 프로젝트 생성 (이름: "BBR Extension" 등)
3. 좌측 메뉴 → API 및 서비스 → 라이브러리
4. "Chrome Web Store API" 검색 → **사용 설정**

### 1-2. OAuth 동의 화면

1. API 및 서비스 → OAuth 동의 화면
2. 사용자 유형: **외부** → 만들기
3. 앱 이름, 이메일만 입력 → 저장
4. 범위 추가 불필요 → 저장
5. 테스트 사용자에 본인 이메일 추가 → 저장

### 1-3. OAuth 클라이언트 ID 생성

1. API 및 서비스 → 사용자 인증 정보 → **+ 사용자 인증 정보 만들기**
2. **OAuth 클라이언트 ID** 선택
3. 애플리케이션 유형: **데스크톱 앱**
4. 이름: "BBR CI" → 만들기
5. **클라이언트 ID**와 **클라이언트 보안 비밀번호** 복사

→ `CHROME_CLIENT_ID`, `CHROME_CLIENT_SECRET`

### 1-4. Refresh Token 발급

```bash
# 1. 브라우저에서 열기 (YOUR_CLIENT_ID 교체)
open "https://accounts.google.com/o/oauth2/auth?response_type=code&scope=https://www.googleapis.com/auth/chromewebstore&client_id=YOUR_CLIENT_ID&redirect_uri=urn:ietf:wg:oauth:2.0:oob"

# 2. 구글 로그인 → 권한 허용 → 인증 코드 복사

# 3. 코드로 refresh token 교환 (YOUR_* 교체)
curl "https://oauth2.googleapis.com/token" \
  -d "client_id=YOUR_CLIENT_ID" \
  -d "client_secret=YOUR_CLIENT_SECRET" \
  -d "code=YOUR_CODE" \
  -d "grant_type=authorization_code" \
  -d "redirect_uri=urn:ietf:wg:oauth:2.0:oob"

# 4. 응답 JSON에서 refresh_token 복사
```

→ `CHROME_REFRESH_TOKEN`

### 1-5. Extension ID

Chrome Web Store 개발자 대시보드 → 내 확장 프로그램 → **항목 ID** 복사

→ `CHROME_EXTENSION_ID`

### GitHub Secrets

| Secret | 값 |
|---|---|
| `CHROME_EXTENSION_ID` | CWS 항목 ID |
| `CHROME_CLIENT_ID` | `xxx.apps.googleusercontent.com` |
| `CHROME_CLIENT_SECRET` | `GOCSPX-xxx` |
| `CHROME_REFRESH_TOKEN` | `1//0xxx` |

---

## 2. Firefox AMO

### 2-1. 개발자 계정

1. https://addons.mozilla.org 접속, Firefox 계정으로 로그인
2. 우측 상단 → **개발자 허브** (Developer Hub)

### 2-2. 확장 최초 등록 (첫 제출 시)

1. 개발자 허브 → 내 부가 기능 → **새 부가 기능 제출**
2. `blue-badge-remover-firefox-vX.X.X.zip` 업로드
3. 리스팅 정보 입력 (이름, 설명, 카테고리)
4. 제출 → 리뷰 대기 (보통 1-2주)

### 2-3. API 키 발급

1. https://addons.mozilla.org/en-US/developers/addon/api/key/ 접속
2. **Generate new credentials** 클릭
3. **JWT issuer**와 **JWT secret** 복사

→ `FIREFOX_JWT_ISSUER`, `FIREFOX_JWT_SECRET`

### 2-4. Extension ID

개발자 허브 → 내 부가 기능 → 확장 클릭 → 기술 정보 탭 → UUID

→ `FIREFOX_EXTENSION_ID`

### GitHub Secrets

| Secret | 값 |
|---|---|
| `FIREFOX_EXTENSION_ID` | `{uuid}` 또는 `addon@slug` |
| `FIREFOX_JWT_ISSUER` | `user:12345:67` |
| `FIREFOX_JWT_SECRET` | API secret 값 |

---

## 3. Edge Add-ons

### 3-1. Partner Center 등록

1. https://partner.microsoft.com/dashboard 접속 (Microsoft 계정)
2. 개발자 계정 등록 (무료, 개인)
3. 좌측 메뉴 → Edge → 확장 프로그램

### 3-2. 확장 최초 등록

1. 확장 프로그램 → **새 확장 만들기**
2. `blue-badge-remover-edge-vX.X.X.zip` 업로드
3. 스토어 목록 정보 입력 (이름, 설명, 스크린샷, Privacy Policy URL)
4. 제출 → 리뷰 대기

### 3-3. API 키 발급 (Publish API v1.1)

> 2025-01-01에 폐기된 v1.0(Azure AD 클라이언트 비밀 + 토큰 URL) 방식은 더 이상 동작하지 않습니다.
> `EDGE_CLIENT_SECRET`, `EDGE_ACCESS_TOKEN_URL`은 사용하지 않습니다.

1. https://partner.microsoft.com/dashboard/microsoftedge/publishapi 접속
2. **Turn on API** (계정당 1회)
3. **Create API credentials** → 표시되는 **Client ID**와 **API key** 복사
   - API key는 만료일이 있습니다. 만료되면 Edge 제출 잡이 `Edge API 인증 실패 (HTTP 401/403)`로 실패하니, 이 페이지에서 새로 발급해 시크릿을 갱신하세요

### 3-4. Product ID

Partner Center → Edge → Overview → 해당 확장 → **Extension identity**의 `Product ID`

### GitHub Secrets

| Secret | 값 |
|---|---|
| `EDGE_PRODUCT_ID` | `xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx` (Product ID) |
| `EDGE_CLIENT_ID` | Publish API 페이지의 Client ID |
| `EDGE_API_KEY` | Publish API 페이지의 API key |

> Edge Publish API는 이미 게시된 확장의 **업데이트** 전용입니다. 최초 등록은 3-2처럼 Partner Center에서 직접 합니다.

---

## GitHub Secrets 등록 방법

1. https://github.com/fotoner/blue-badge-remover/settings/secrets/actions 접속
2. **New repository secret** 클릭
3. 아래 10개 시크릿을 하나씩 등록

터미널에서는 값이 화면에 남지 않도록 클립보드로 등록할 수 있습니다:

```bash
pbpaste | tr -d '\r\n' | gh secret set EDGE_API_KEY -R fotoner/blue-badge-remover
```

---

## 전체 시크릿 체크리스트

```
# Chrome Web Store (4개)
CHROME_EXTENSION_ID=
CHROME_CLIENT_ID=
CHROME_CLIENT_SECRET=
CHROME_REFRESH_TOKEN=

# Firefox AMO (3개)
FIREFOX_EXTENSION_ID=
FIREFOX_JWT_ISSUER=
FIREFOX_JWT_SECRET=

# Edge Add-ons (3개, Publish API v1.1)
EDGE_PRODUCT_ID=
EDGE_CLIENT_ID=
EDGE_API_KEY=
```

## 검증 (태그 전 인증 점검)

`-test` 태그는 스토어 제출을 건너뛰므로 인증 확인이 되지 않습니다. 대신 **Submit to Store**를 dry-run으로 실행합니다.
기존 Release의 ZIP으로 인증만 확인하고 업로드/제출은 하지 않습니다.

```bash
for store in chrome firefox edge; do
  gh workflow run submit-store.yml -R fotoner/blue-badge-remover -f store=$store -f tag=v1.6.0 -f dry-run=true
done
gh run list -R fotoner/blue-badge-remover --workflow submit-store.yml --limit 3
```

| 스토어 | dry-run이 확인하는 것 |
|---|---|
| Chrome | OAuth refresh token으로 access token 발급 |
| Firefox | JWT로 애드온 상세 조회 |
| Edge | 존재하지 않는 작업 조회로 API key 인증 (401/403이면 실패) — `wxt submit --dry-run`은 Edge 키를 검증하지 않음 |

## 실패한 스토어만 다시 제출

릴리스 후 특정 스토어 잡만 실패했다면 태그를 다시 만들지 말고 해당 스토어만 재제출합니다.
재빌드하지 않고 Release에 첨부된 ZIP을 그대로 씁니다.

```bash
gh workflow run submit-store.yml -R fotoner/blue-badge-remover -f store=firefox -f tag=v1.x.x -f dry-run=false
```

### Firefox AMO 주의사항

- AMO가 `POST /versions/` 응답 전에 10분에서 연결을 끊는 경우가 있습니다(v1.4.1, v1.6.0). 서버에서는 버전이 생성됐을 수 있어(v1.4.1이 그랬음), 제출 스크립트가 3분 뒤 1회 재시도하고 `409 / already exists`면 성공으로 처리합니다
- 재제출 전에 개발자 허브(Manage Status & Versions)에서 해당 버전이 이미 있는지 확인하세요
- Firefox 번들은 minify되어 있어 소스 ZIP(`blue-badge-remover-firefox-sources-<tag>.zip`)을 함께 제출합니다
