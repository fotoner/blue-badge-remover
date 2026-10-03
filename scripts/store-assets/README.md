# 스토어 이미지

Chrome 웹 스토어(Edge·AMO 공용) 등록용 이미지를 en/ko/ja로 만든다.

```bash
npm run store-assets
# → out/store-assets/<언어>/ (out/은 gitignore)
#    01~05-*.png              스크린샷 1280×800 (스토어 최대 5장)
#    promo-small-440x280.png  작은 프로모 타일 (필수)
#    promo-marquee-1400x560.png 마키 프로모 타일 (선택, 추천 영역 노출용)
```

설치된 Chrome으로 그린다. 폰트(IBM Plex Sans KR/JP, JetBrains Mono)를 Google Fonts에서 받으므로 네트워크가 필요하다.

## 구성

1. `capture.mjs` — 빌드된 `dist/chrome-mv3` 화면(팝업·대시보드·고급 필터·화이트리스트)을 `chrome.*` 스텁 위에 띄워 3배율로 찍는다. 예시 데이터는 `seed.json`, 계정 아이디는 모두 가상이다.
2. `render.mjs` — `slides.<언어>.json` 문구와 캡처를 `template.html`에 넣어 스토어 규격 크기(1배율)로 그린다. 글이 칸을 넘치면 잘린 이미지 대신 실패한다.

첫 장의 X 타임라인은 확장이 실제로 그리는 숨김 표시와 같은 스타일·문구로 재현한 것이다 (`template.html`의 `.hidden-row`, 문구는 `hiddenTweetFadak`/`hiddenTweetRetweet` 번역과 일치시킨다).

디자인은 `docs/DESIGN.md`를 따른다 — 아이콘 그리드, 알약 뱃지, 둥근 카드, 그라데이션 히어로 같은 장식은 넣지 않는다.

## 문구 고치기

`slides.<언어>.json`만 고치면 된다. `title`은 두 줄(`\n`), `points`는 세 줄. 확장 UI 문구가 바뀌면 다시 빌드해서 캡처부터 새로 만든다.
