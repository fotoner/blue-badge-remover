# 업데이트 안내 카드

X에 올릴 릴리스 안내 이미지(1600×900, 2배 해상도 PNG)를 만든다.

```bash
npm run card -- scripts/update-card/cards/v1.6.2.json
# → out/update-card/v1.6.2.png (out/은 gitignore)
```

설치된 Chrome으로 그린다. 폰트(Pretendard)를 CDN에서 받으므로 네트워크가 필요하다.

## 새 카드 만들기

1. `cards/v1.6.2.json`을 복사해 `cards/v<버전>.json`으로 만든다.
2. `title`·`subtitle`·`items`를 고친다. 항목은 4개(2×2)가 기본이다.
   - `icon`: `user-plus`, `fold-vertical`, `settings`, `zap`, `languages`, `shield-check`, `filter`, `eye-off` (`template.html`의 `ICONS`)
   - `kind`: `new`(새 기능, 파랑) · `fix`(수정, 초록) · 생략하면 뱃지 없음
3. 렌더링한다. 문구가 길어 칸을 넘치면 실패하므로, 그때는 문구를 줄인다.

휴대폰 타임라인에서는 카드가 약 1/4 크기로 보인다. 항목 제목은 10자 안팎, 설명은 두 줄 안에서 끝내야 읽힌다.

`template.html`을 브라우저로 바로 열면 예시 데이터로 레이아웃을 미리 볼 수 있다.
