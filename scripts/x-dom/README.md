# X 화면 구조 점검 도구

확장은 X의 DOM 구조(`data-testid`, 링크 위치, 배지 SVG 모양)에 기대어 판정한다. X가 구조를 바꾸면 테스트는 통과하는데 실제로는 깨질 수 있어서(#67, #69), 실제 화면에서 점검하고 그 구조를 픽스처로 남긴다.

세 스크립트 모두 Aside 브라우저의 REPL에서 실행한다. Aside에서 x.com에 로그인돼 있고, 점검할 빌드(`dist/chrome-mv3`)가 확장으로 로드돼 있어야 한다.

## smoke.js — 구조 점검

```bash
aside repl "$(cat scripts/x-dom/smoke.js)"
```

`PASS`/`FAIL <항목> <세부>`를 출력한다. 계정 핸들, 트윗·작성자 영역, 상태 링크, 파딱 배지 SVG, 인용 카드, 리트윗 머리글 링크, SPA 이동 시 `main` 유지와 Navigation API 이벤트를 본다. 릴리스 전이나 X가 바뀐 것 같을 때 돌리고, `FAIL`이 나오면 해당 코드와 픽스처를 갱신한다.

## capture-fixtures.js — 픽스처 갱신

```bash
aside repl "$(cat scripts/x-dom/capture-fixtures.js)" > /tmp/x-dom-capture.txt
```

`FIXTURE <이름> <html>` 줄마다 `tests/fixtures/x-dom/<이름>.html`에 맞는 조각이 나온다. 파일 첫 줄의 채취 날짜 주석을 갱신해 저장한 뒤, `tests/content/x-dom-fixtures.test.ts`의 기대값을 확인한다.

공개 저장소이므로 핸들은 `user_N`, 표시 이름은 `표시 이름`, 본문은 `…`로 바뀌고 이미지·영상은 빠진다. 커밋 전에 실제 핸들이나 이름이 남지 않았는지 확인한다.

## back-nav-measure.js — 뒤로가기 측정

```bash
for i in $(seq 1 10); do aside repl "$(cat scripts/x-dom/back-nav-measure.js)" | grep BACKNAV; done
```

홈을 조금씩 내린 뒤 트윗 상세에 갔다가 뒤로가기하고, 숨기기 전에 그려진 파딱 수(`flash`)와 클릭 전 맨 위 트윗의 위치 변화(`anchorShift`, px)를 출력한다. 비율을 보려면 여러 번 반복한다(#72, #73, #74).
