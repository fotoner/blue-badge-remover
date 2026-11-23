---
paths:
  - "wxt.config.ts"
  - "entrypoints/background.ts"
  - "src/features/reload-notice/**"
  - "src/features/settings/**"
  - "src/shared/constants/**"
  - "tests/manifest-*.test.ts"
  - "tests/background/**"
---

# 매니페스트·background·설치와 업데이트

권한, 설치·업데이트 처리, 설정 기본값, 브라우저별 차이를 고칠 때 지키는 규칙이다. 리뷰는 규칙을 ID로 가리킨다.

## 권한과 매니페스트
- **EXT-1** 권한은 `wxt.config.ts`의 `manifest`에서 정한다. 브라우저별로 달라야 하면 `manifest: ({ browser }) => …` 함수로 바꾼다. 바꾸면 `tests/manifest-permissions.test.ts`와 `docs/PRIVACY.md`의 권한 표를 같이 고친다(AGENTS.md SAFE-6).
- **EXT-2** 설치 경고가 있는 권한을 더하면 업데이트 때 사용자의 확장이 꺼진다. 경고가 없는 권한인지 Chrome 권한 목록에서 확인하고 PR 본문에 근거를 적는다.
- **EXT-3** 매니페스트 버전은 `package.json`의 `version`이다. 릴리스 태그와 다르면 `release.yml`이 멈춘다.
- **EXT-4** Firefox 빌드는 MV2다. Firefox for Android에서 설치하려면 `browser_specific_settings.gecko_android`가 있어야 한다(#87, `tests/manifest-android.test.ts`).

## 설치·업데이트
- **EXT-5** Chrome·Edge는 설치·업데이트 전부터 열려 있던 탭에 새 content script를 넣지 않는다. 그 탭은 새로고침해야 동작한다. 팝업 안내와 설치 직후 여는 환영 페이지(`src/features/reload-notice/`)가 이를 알린다. 열린 탭에 코드를 넣지 않는다(CNT-8, #121). Firefox는 열린 탭에 content script를 다시 넣는다.
- **EXT-6** Firefox for Android는 팝업을 탭으로 연다. 그래서 활성 탭이 팝업 자신이 된다. 아이콘을 누른 탭은 `?sourceTabId=`로 넘긴다(#121).

## 설정과 저장값
- **EXT-7** 새 설정은 `src/shared/constants/index.ts`의 `DEFAULT_SETTINGS`에 기본값을 두고, 저장값과 병합해 읽는다. 업데이트로 기존 사용자의 동작이 바뀌지 않게 새 토글의 기본값은 지금 동작과 같게 둔다(#94).
- **EXT-8** 저장 형식을 바꾸면 업데이트 때 옛 키를 옮기거나 지우는 처리(`onInstalled`)와 그 시험을 같이 둔다(예: 팔로우 목록 v2, #70).
