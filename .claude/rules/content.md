---
paths:
  - "src/content/**"
  - "src/injected/**"
  - "src/features/content-filter/**"
  - "src/features/badge-detection/**"
  - "entrypoints/content.ts"
  - "entrypoints/injected.content.ts"
  - "tests/content/**"
  - "tests/injected/**"
---

# X 화면을 읽고 숨길 때

content script(ISOLATED world)와 MAIN world 스크립트를 고칠 때 지키는 규칙이다. 리뷰는 규칙을 ID로 가리킨다.

## 판정과 DOM
- **CNT-1** 판정은 순수 함수(`src/content/tweet-classifier.ts`)에 두고, DOM에서 값을 뽑는 일(`src/content/tweet-processing.ts`)과 섞지 않는다. 판정을 바꾸면 분류 시험부터 고친다.
- **CNT-2** X 화면 구조는 자주 바뀐다. 셀렉터를 바꾸면 실제 화면을 캡처한 픽스처(`tests/fixtures/x-dom/`, 캡처는 `scripts/x-dom/README.md`)로 회귀 시험을 더한다.
- **CNT-3** 새 판정은 화면 언어에 기대지 않는다. `data-testid`·`href`·API 데이터로 판정한다. 한국어 문구 정규식에 기댄 곳은 일본어·영어 화면에서 깨진다(#111).
- **CNT-4** 표시 이름은 핸들이 아니다. 「名前@C105」처럼 `@`가 들어간 이름이 있다. 핸들은 아바타의 `data-testid`나 정확히 `@handle`인 텍스트에서 읽는다(#110).
- **CNT-5** '완전 제거'로 숨긴 자리는 높이 0으로 접는다. 보이는 틈을 다시 만들지 않는다(#102).
- **CNT-6** 팔로우·화이트리스트·설정이 바뀌면 이미 그려진 트윗과 인용 카드도 다시 판정한다(#100). 새 예외를 더하면 재판정 대상에도 넣는다.

## MAIN world와 메시지
- **CNT-7** MAIN world(`src/injected/`)에는 확장 API가 없다. ISOLATED와는 `postMessage`로만 주고받고, 받는 쪽(`src/content/message-handler.ts`)에서 형식을 검증한다.
- **CNT-8** MAIN world의 fetch 가로채기는 `document_start`에 시작해야 X 응답을 놓치지 않는다. 이미 열린 탭에 content script를 다시 주입해 해결하지 않는다(#121).

## X 계정
- **CNT-10** 확장은 X에 글·좋아요·팔로우 요청을 보내지 않는다. 읽기만 한다.
