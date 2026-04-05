# Design System — Blue Badge Remover (파딱 제거기)

## Product Context
- **What this is:** X(트위터)에서 유료 파란 뱃지 계정을 필터링하는 크롬 익스텐션
- **Who it's for:** 한국 트위터 유저 (en/ja 지원)
- **Space/industry:** 브라우저 익스텐션, 콘텐츠 필터링, X/Twitter 생태계
- **Project type:** Chrome Extension (Popup 340px + Dashboard 600px + Options 600px)

## Aesthetic Direction
- **Direction:** Industrial/Utilitarian
- **Decoration level:** Minimal — 타이포그래피와 레이아웃 밀도로 차별화
- **Mood:** 야행성 유틸리티 패널. 정밀하고 규율 있는 전문 도구. 소셜 앱이 아닌 컨트롤 콘솔.
- **Identity:** X 다크모드와 조화를 이루되, 전용 폰트 + 더 깊은 배경 + 신호 라인 악센트로 독자 아이덴티티 확보

## Typography
- **Display/Headings:** Space Grotesk — 기하학적이고 샤프. 섹션 타이틀, 숫자 표시에 사용
- **Body/UI Labels:** IBM Plex Sans KR — 정밀한 엔지니어링 본문 서체. 한국어 지원
- **Stats/Data:** JetBrains Mono — 통계 숫자에 전문성 부여. tabular-nums 지원
- **Code:** JetBrains Mono
- **Loading:** Google Fonts CDN
  ```html
  <link href="https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@400;500;600;700&family=IBM+Plex+Sans+KR:wght@400;500;600&family=JetBrains+Mono:wght@400;500&display=swap" rel="stylesheet">
  ```
- **Scale:**
  - Popup title: 15px / 600 / Space Grotesk
  - Dashboard title: 18-20px / 600 / Space Grotesk
  - Section label: 11px / 700 / uppercase / Space Grotesk
  - Body: 13px / 400 / IBM Plex Sans KR
  - Small/Hint: 11px / 400 / IBM Plex Sans KR
  - Stat hero number: 36px / 500 / JetBrains Mono
  - Stat inline: 12-13px / 500 / JetBrains Mono

## Color
- **Approach:** Restrained — X 블루 악센트 유지, 배경만 더 깊게
- **Background:** `#0E1418` — X의 `#15202b`보다 더 깊음, 시각적 깊이감
- **Surface 1:** `#131B21` — 카드, 패널
- **Surface 2:** `#18232B` — 호버, 세컨더리 버튼
- **Surface 3:** `#21303A` — 액티브, 셀렉티드
- **Text Primary:** `#F5F9FC`
- **Text Secondary:** `#D7E1E8`
- **Text Muted:** `#8C9AA5`
- **Accent:** `#1d9bf0` — X 블루 유지 (생태계 조화)
- **Accent Soft:** `rgba(29, 155, 240, 0.14)`
- **Border Subtle:** `rgba(255, 255, 255, 0.08)`
- **Border Strong:** `rgba(29, 155, 240, 0.32)`
- **Semantic:**
  - Success: `#6EE7B7`
  - Warning: `#F7C66B`
  - Danger: `#FF7B72`

## Border & Radius Rule
**핵심 원칙: border가 있으면 radius 0, radius가 있으면 border 없음.**

- `border` 있는 요소 → `border-radius: 0` (sharp edge). 카드, 패널, 인풋, ghost 버튼, alert, select
- `border` 없는 요소 → `border-radius: 4px` 허용. primary/secondary 버튼, 컬러 스와치
- 인터랙티브 pill → `border-radius: 10-12px` 허용. 토글 스위치, 공유 칩, 뱃지/태그
- 프로그레스/바 → `border-radius: 3px`. 바 트랙, 바 필
- 아이콘 컨테이너 → `border-radius: 3-4px`

이 규칙은 AI slop의 "bubbly card" 패턴을 방지하고, 날카로운 도구적 느낌을 유지한다.

## Spacing
- **Base unit:** 4px
- **Density:** Compact
- **Scale:** 2xs(2) xs(4) sm(8) md(12) lg(16) xl(20) 2xl(24) 3xl(32)
- **Section gap:** 12-16px (popup), 16-20px (dashboard)
- **Popup padding:** 16px
- **Dashboard padding:** 24px (sides), 32px (top)

## Layout
- **Approach:** Grid-disciplined, top-aligned, left-biased
- **Popup (340px):** Dense vertical stack. 상단 정렬. 좌측 편향. 중앙 정렬 지양
- **Dashboard (600px):** Single column, max-width 600px centered. 에디토리얼 밀도
- **Options (600px):** Same as dashboard
- **Max content width:** 600px
- **Signal-line pattern:** 좌측 3px 액센트 라인으로 활성 섹션/중요 정보 표시. X의 둥근 필/칩 대신 직선 마커 사용

## Motion
- **Approach:** Minimal-functional
- **Easing:** enter(ease-out) exit(ease-in) move(ease-in-out)
- **Duration:** micro(50-100ms) short(120-160ms) medium(200-300ms)
- **Direction:** 위/좌에서 들어오는 방향성. 브리스크하고 정확한 움직임

## Anti-Slop Rules
- No purple/violet gradients
- No 3-column icon grids
- No centered-everything layouts
- No uniform bubbly border-radius on all elements (see Border & Radius Rule)
- No gradient buttons
- No generic hero sections
- No glassmorphism
- No decorative shapes/blobs
- No oversized rounded cards

## CSS Custom Properties
```css
:root {
  --bg: #0E1418;
  --surface-1: #131B21;
  --surface-2: #18232B;
  --surface-3: #21303A;
  --text-primary: #F5F9FC;
  --text-secondary: #D7E1E8;
  --text-muted: #8C9AA5;
  --accent: #1d9bf0;
  --accent-soft: rgba(29, 155, 240, 0.14);
  --border-subtle: rgba(255, 255, 255, 0.08);
  --border-strong: rgba(29, 155, 240, 0.32);
  --success: #6EE7B7;
  --warning: #F7C66B;
  --danger: #FF7B72;
  --font-display: 'Space Grotesk', sans-serif;
  --font-body: 'IBM Plex Sans KR', sans-serif;
  --font-mono: 'JetBrains Mono', monospace;
}
```

## Decisions Log
| Date | Decision | Rationale |
|------|----------|-----------|
| 2026-04-05 | Initial design system created | /design-consultation. X 조화 + 독자 아이덴티티 방향. Codex + Claude 외부 보이스 교차 검증 |
| 2026-04-05 | X 블루 악센트 유지 | 생태계 조화 우선. 번트 오렌지 제안은 사용자가 기각 |
| 2026-04-05 | 쿨 톤 텍스트 유지 | 따뜻한 아이보리 제안은 사용자가 기각. X와 자연스러운 전환 |
| 2026-04-05 | Border/Radius 분리 규칙 | border+radius 조합이 AI slop 느낌. 사용자 피드백 반영 |
