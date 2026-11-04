---
paths:
  - "entrypoints/popup/**"
  - "entrypoints/dashboard/**"
  - "entrypoints/options/**"
  - "entrypoints/whitelist/**"
  - "entrypoints/collector/**"
  - "entrypoints/welcome/**"
  - "src/popup/**"
  - "src/dashboard/**"
  - "src/options/**"
  - "src/whitelist/**"
  - "src/collector/**"
  - "src/welcome/**"
  - "src/shared/i18n/**"
  - "src/content/milestone-banner.ts"
  - "src/content/fadak-banner.ts"
  - "src/content/settings-shortcut.ts"
---

# 확장 화면과 X 화면에 넣는 요소

팝업·대시보드·설정·환영 화면과, X 화면에 넣는 배너를 고칠 때 지키는 규칙이다. 리뷰는 규칙을 ID로 가리킨다.

## 확장 화면
- **UI-1** 색·글꼴·간격·border/radius는 `docs/DESIGN.md`를 따른다. border가 있으면 radius 0, radius가 있으면 border 없음이다.
- **UI-2** 화면 HTML은 `entrypoints/*/index.html`에만 둔다. `src/<화면>/`에는 로직과 스타일만 둔다. WXT는 `entrypoints/`만 빌드하므로, `src/`의 옛 HTML 사본만 고쳐 배포 화면이 안 바뀐 일이 두 번 있었다(`tests/shared/entrypoint-html-location.test.ts`).
- **UI-3** 화면은 레이아웃으로 설명한다. 설명 문단, 라벨을 되풀이하는 툴팁, 장식(색 띠·알약 뱃지·아이콘 상자)을 새로 넣지 않는다. 오류·빈 상태 문구와 아이콘 버튼의 접근성 이름은 넣는다. 그래도 넣은 안내 문구는 PR 본문에 개수와 이유를 적는다.

## 번역
- **UI-4** 문구는 `src/shared/i18n/`의 ko·en·ja에 같은 키로 넣는다. 키가 하나라도 빠지면 시험이 실패한다. en·ja의 X 기능 이름은 그 언어 X 화면의 실제 이름을 쓴다(예: For you, おすすめ).
- **UI-5** HTML의 기본 텍스트(`data-i18n`)는 ko 값과 같게 둔다. 번역이 늦게 적용될 때 보이는 글이다.

## X 화면에 넣는 요소
- **UI-6** X 화면에 넣는 요소는 X의 테마(기본·어둡게·검게)를 따르고, 닫을 수 있어야 한다. 사용자가 요청하지 않은 알림은 기본으로 끈다(마일스톤 배너는 설문에서 불만이 있었다).
- **UI-7** X 화면에 넣는 요소는 shadow DOM이나 고유 id로 X 스타일과 섞이지 않게 하고, 같은 요소를 두 번 넣지 않는다.
