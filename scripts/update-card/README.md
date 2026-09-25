# 업데이트 안내 카드

X에 올릴 릴리스 안내 이미지(1600×900, 2배 해상도 PNG)를 만든다.

```bash
npm run card -- scripts/update-card/cards/v1.6.2.json
# → out/update-card/v1.6.2.png (out/은 gitignore)
```

설치된 Chrome으로 그린다. 폰트(IBM Plex Sans KR, JetBrains Mono)를 Google Fonts에서 받으므로 네트워크가 필요하다.

## 구성

왼쪽에 대표 변경 하나(`label`·`title`·`desc`)와 고친 것 목록(`fixes`), 오른쪽에 실제 확장 화면 스크린샷(`visual`).
디자인은 `docs/DESIGN.md`를 따른다 — 아이콘 그리드, 알약 뱃지, 둥근 카드, 글로우 같은 장식은 넣지 않는다.

## 새 카드 만들기

1. `cards/v1.6.2.json`을 복사해 `cards/v<버전>.json`으로 만든다.
2. 대표 변경의 실제 화면을 찍어 `assets/`에 넣고 `visual`에 경로를 적는다. 없으면 `visual`을 빼면 된다.
   - 확장 페이지는 `npm run build` 후 `dist/chrome-mv3`를 로컬 서버로 열고, `chrome.storage`를 흉내 낸 값으로 띄워 찍었다 (예시 계정은 가상의 아이디).
   - 폭 460px, 3배율로 찍으면 카드에서 읽을 수 있는 크기가 된다. 칸보다 길면 아래가 잘린다.
3. `title`은 두 줄(`\n`), `fixes`는 세 줄 안팎. 문구가 칸을 넘치면 렌더링이 실패하므로 그때는 줄인다.

휴대폰 타임라인에서는 카드가 약 1/4 크기로 보인다. 제목 외의 글은 짧을수록 좋다.
