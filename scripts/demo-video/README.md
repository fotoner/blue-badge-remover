# 데모 영상

릴리스 안내 트윗에 붙이는 데모 영상(전체 + 장면별 반복 클립)을 만든다.

```bash
npm run demo-video -- v1.8.0
# → out/demo-video/v1.8.0/ (out/은 gitignore)
#    demo.mp4                 전체 영상 — 장면을 페이드로 잇고 마지막 화면(버전·지원 브라우저)으로 끝난다
#    01-back-navigation.mp4   장면별 반복 클립 — 첫·마지막 프레임이 같아 X에서 끊김 없이 반복된다
#    02-detail-settings.mp4

npm run demo-video -- v1.8.0 --preview 3.2 4.0                  # 특정 순간만 PNG로
npm run demo-video -- v1.8.0 --clip detail-settings              # 클립 하나만
npm run demo-video -- v1.8.0 --clip detail-settings --preview 7.5
```

설치된 Chrome과 ffmpeg로 그린다(`brew install ffmpeg`). 폰트를 Google Fonts에서 받으므로 네트워크가 필요하다. 1280×720 화면을 1.5배로 찍어 1920×1080, 30fps H.264로 만든다.

## 원칙

1.8.0 영상을 만들며 정한 것이다.

- 실제 X 화면을 캡처하지 않는다. X 화면은 `kit.css`로 다시 그리고, 계정은 `sample_`로 시작하는 16자 이상 가상 아이디만 쓴다. X 아이디는 최대 15자라 실존 계정과 겹치지 않는다. `tests/demo-video/sample-handles.test.ts`가 이 규칙을 검사한다.
- 영상 안에 설명 문구를 넣지 않는다. 설명은 트윗 글에서 한다. 전후 비교가 필요하면 버전 표시(`1.7.0` / `1.8.0`)만 둔다.
- 강조용 장식(빨간 테두리, 화살표, 글로우, 튀는 이징)을 넣지 않는다. `docs/DESIGN.md`를 따른다.
- 증상은 실제와 같은 모양으로 재현한다. 1.7.0의 뒤로가기 팝인은 내용 없는 빈 칸이었다(`.empty-slot`). 잘 보이게 시간을 늘리는 건 괜찮다.
- 실제 화면에 없는 것은 그리지 않는다(예: 1.8.1에서 없앤 숨김 칸).
- 예시 내용은 그날 논란이 된 주제를 피한다. 중립적인 일상 내용을 쓴다.
- 장면별 클립은 반복 재생용이다. 마지막에 처음 상태(커서 위치, 토글)로 돌아가게 끝낸다(`loop` 모드).
- 확장 UI 문구(접힘 표시, 버튼, 설정 이름)는 `src/shared/i18n`과 같게 쓴다.

## 새 릴리스 영상 만들기

1. `releases/v1.8.0.html`을 복사해 `releases/v<버전>.html`로 만든다.
2. `ACC`에 예시 계정을, 장면 객체를 정의한다.

   ```js
   {
     id: 'back-navigation',   // 클립 파일 이름에 쓰인다
     width: 776,              // 장면 폭 — 가로 가운데에 놓인다
     duration: 11.0,          // 전체 영상에서의 길이(초)
     loopDuration: 12.0,      // 반복 클립 길이 (없으면 duration)
     mount(el) { … },         // 장면 DOM을 만든다 (render에서는 this.el)
     render(T, { loop }) {    // T: 장면 시작부터의 초, loop: 반복 클립이면 true
       return { cursor: [x, y], press: false }; // cursor가 없으면 커서를 숨긴다
     },
   }
   ```

3. 맨 아래에서 `BBRDemo.run({ version, where, scenes })`를 부른다.
4. `--preview`로 주요 순간을 확인한 뒤 전체를 렌더링한다.

`render`는 `T`에서만 상태를 계산한다. 이전 프레임의 상태를 쌓으면 프레임을 건너뛸 때 결과가 달라진다. 펼쳐지는 칸은 `grow()`처럼 안쪽 요소 높이를 기준으로 잡는다. 바깥 칸의 `scrollHeight`를 쓰면 넘친 장식만큼 매 프레임 높이가 늘어난다.

## 키트

| 이름 | 쓰임 |
|---|---|
| `tweet(acc, text, time)`, `focal(acc, text, time)`, `hiddenRow(acc)` | 트윗, 상세 트윗, 확장의 접힘 표시 HTML |
| `prog`, `ease`, `out`, `clamp` | 시간을 0~1 진행도로 바꾸기, 이징 |
| `cursorAt(points, T)`, `pressed(T, clicks)`, `center(el)` | 커서 경로, 누르는 순간, 요소 중심 좌표 |
| `setSwitch(sw, on)`, `grow(box, amount)` | 토글 스위치, 펼쳐지며 나타나는 칸 |
| `.empty-slot`, `.exp-actions`, `.bbr-banner`, `.dash`·`.children` (`kit.css`) | 숨김 실패 빈 칸, 펼친 트윗 아래 액션, 상세 경고 배너, 대시보드 설정 |
