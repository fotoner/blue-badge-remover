---
name: browser-qa
description: 확장의 화면·런타임 동작을 실제 브라우저에서 확인할 때 쓴다. 설치·업데이트 경로를 임시 프로필에서 재현하는 스크립트(scripts/qa/install-check.mjs), 로그인된 브라우저에서 확장 저장소를 백업·복원하며 확인하는 절차, 결함으로 오인하기 쉬운 정상 동작, 보고 형식이 있다.
---

# 실제 브라우저 QA

모킹된 시험 통과는 화면 동작의 증거가 아니다. 바뀐 사용자 경로마다 "조건 → 통과 기준"을 먼저 적고, 실제 브라우저에서 본 것만 통과로 쓴다. 안전 규칙은 AGENTS.md SAFE-1~3이다.

## 1. 설치·업데이트 경로 — 임시 프로필

Chrome·Edge는 설치·업데이트 전부터 열린 탭에 새 content script를 넣지 않는다(EXT-5). 이 경로는 사람의 프로필이 아니라 임시 프로필에서 본다.

```sh
npm run build:chrome   # 메인 체크아웃이면 먼저 아래 주의를 본다
node scripts/qa/install-check.mjs dist/chrome-mv3 ko light   # 언어: ko·en·ja, 테마: light·dark
```

- 주의: 로그인된 브라우저(2절)가 메인 체크아웃의 `dist/chrome-mv3`를 압축 해제 확장으로 읽고 있으면, 빌드가 그 브라우저의 확장 파일을 바꾼다. 브랜치 빌드는 worktree에서 한다.

- x.com(로그아웃 화면)을 먼저 열고 CDP `Extensions.loadUnpacked`로 새로 설치한다. 그래서 `onInstalled`의 `install`이 실제로 일어난다.
- 출력: 열린 환영 페이지의 언어·보이는 단계·새로고침 버튼 문구, 캡처 경로(데스크톱·390px·새로고침 뒤), 버튼을 누른 뒤 X 탭의 MAIN world 시작 시점. 종료 코드 0이 통과다.
- 릴리스 ZIP을 확인할 때는 새 빈 폴더에 풀어 그 폴더를 넘긴다.
- 업데이트(`update`)는 확장을 다시 로드해 일으킨다(2절). 스토어를 거친 업데이트는 정식 릴리스 뒤에만 볼 수 있다.

## 2. 로그인된 브라우저 — 판정·화면 확인

팔로우·리트윗·인용 판정처럼 로그인한 타임라인이 필요한 것은 사람이 쓰는 로그인된 브라우저에서 본다. 그 브라우저에 압축 해제로 로드한 개발용 확장 폴더를 브랜치 빌드로 바꿔 넣고, 확장 페이지에서 `chrome.runtime.reload()`로 다시 로드한다.

1. 바꿀 키(`settings`, `whitelist`, `followListV2`, `followCacheV2`)를 확장 페이지에서 읽어 파일로 백업한다.
2. 시나리오마다 `try { 바꾸기 → 확인 } finally { 백업으로 되돌리기 }`로 한다.
3. 끝나면 지금 값과 백업을 키별로 대조하고, 원래 빌드로 되돌려 다시 로드한다.

```js
// 확장 페이지(대시보드)에서
const backup = await chrome.storage.local.get(['settings', 'whitelist', 'followListV2', 'followCacheV2']);
try {
  await chrome.storage.local.set({ settings: { ...backup.settings, keywordFilterEnabled: false, aggressorFilterEnabled: false } });
  // 확인
} finally {
  await chrome.storage.local.set(backup);
}
```

- 팔로우를 흉내 낼 때 팔로우하지 않는 계정을 팔로우 목록에 넣으면, X API의 '팔로우 안 함' 응답이 바로 지운다(#63). 실제로 팔로우 중인 계정을 빼는 것(언팔로우 흉내)만 성립한다.
- 판정 근거가 필요하면 설정의 `debugMode`를 잠깐 켠다. 트윗마다 `[BBR] @handle | FADAK | RT by …` 표시가 붙는다.
- 숨긴 트윗은 셀에 `data-bbr-reason`(예: `retweet`, `quote-entire`, `fadak`)이, 숨긴 인용 카드는 `data-bbr-hidden-quote`가 붙는다. 개수는 이 속성으로 센다.

## 3. 결함으로 오인하기 쉬운 정상 동작

- 선별 필터(키워드·신규 고확산)를 켜면 조건에 맞지 않는 파딱 트윗과 리트윗은 보인다. 리트윗 숨기기를 확인하려면 두 선별 필터를 끈다.
- 금색(공식 단체) 뱃지 계정은 숨기지 않는다.
- '완전 제거'로 숨긴 셀은 높이가 0이다(테두리 때문에 1px로 잴 수 있다).
- 새로 연 탭에는 팝업의 새로고침 안내가 나오지 않는다. 확장을 설치·업데이트하기 전부터 열려 있던 탭에만 나온다. 환영 페이지는 새로 설치할 때만 열린다.

## 4. 보고

| 항목 | 조건 → 통과 기준 | 결과 | 증거 |
|---|---|---|---|

- 증거 등급을 붙인다: 실제 브라우저에서 봄, 임시 프로필에서 봄, 코드·시험만.
- 미검증 목록에는 무엇을 어떻게 보면 통과인지 적는다.
- 캡처에 실제 계정이 보이면 PR·이슈에 올리지 않는다(SAFE-8).
