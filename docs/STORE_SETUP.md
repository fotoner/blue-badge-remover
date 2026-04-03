# 스토어 배포 자동화 설정 가이드

릴리스 워크플로우(`release.yml`)가 태그 push 시 Chrome, Firefox, Edge 3개 스토어에 자동 제출합니다.
각 스토어의 API 키를 GitHub Secrets에 등록하면 활성화됩니다.

## 배포 흐름

```
git tag v1.x.x → push → GitHub Actions
  ├─ 빌드 (Chrome + Firefox + Edge)
  ├─ GitHub Release 생성 (3개 ZIP 첨부)
  └─ 스토어 자동 제출 (secrets 등록된 스토어만)
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

### 3-3. API 키 발급 (Azure AD)

1. https://portal.azure.com → **Azure Active Directory** → 앱 등록
2. **새 등록**:
   - 이름: "BBR Edge Publish"
   - 리디렉션 URI: `https://login.microsoftonline.com/common/oauth2/nativeclient`
3. 등록 후:
   - **애플리케이션(클라이언트) ID** 복사 → `EDGE_CLIENT_ID`
   - **인증서 및 비밀** → 새 클라이언트 비밀 → **값** 복사 → `EDGE_CLIENT_SECRET`
   - **토큰 엔드포인트** 복사 → `EDGE_ACCESS_TOKEN_URL`
     - 형식: `https://login.microsoftonline.com/{tenant-id}/oauth2/v2.0/token`
4. Partner Center에서 이 앱에 **"Microsoft Edge 확장 게시자"** 역할 부여

### 3-4. Product ID

Partner Center → Edge → 확장 프로그램 → 해당 확장 → URL에서 `productId` 복사

→ `EDGE_PRODUCT_ID`

### GitHub Secrets

| Secret | 값 |
|---|---|
| `EDGE_PRODUCT_ID` | `xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx` |
| `EDGE_CLIENT_ID` | `xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx` |
| `EDGE_CLIENT_SECRET` | Azure AD 비밀 값 |
| `EDGE_ACCESS_TOKEN_URL` | `https://login.microsoftonline.com/{tenant}/oauth2/v2.0/token` |

---

## GitHub Secrets 등록 방법

1. https://github.com/fotoner/blue-badge-remover/settings/secrets/actions 접속
2. **New repository secret** 클릭
3. 위 11개 시크릿을 하나씩 등록

등록된 스토어만 자동 제출됩니다. 등록하지 않은 스토어는 스킵 (에러 없음).

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

# Edge Add-ons (4개)
EDGE_PRODUCT_ID=
EDGE_CLIENT_ID=
EDGE_CLIENT_SECRET=
EDGE_ACCESS_TOKEN_URL=
```

## 검증

시크릿 등록 후 테스트:

```bash
git tag v1.x.x-test
git push origin v1.x.x-test
```

GitHub Actions → Release Extension 워크플로우에서 각 스토어 제출 스텝 확인.
테스트 후 태그 삭제:

```bash
git tag -d v1.x.x-test
git push origin :refs/tags/v1.x.x-test
```
