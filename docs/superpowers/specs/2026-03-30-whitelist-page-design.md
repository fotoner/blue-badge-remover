# 화이트리스트 페이지 분리 설계

**날짜**: 2026-03-30
**브랜치**: feat/whitelist-page
**상태**: 승인됨

## 개요

현재 팝업 인라인에 있는 화이트리스트 섹션(입력 필드 + 목록)을 별도 페이지(`src/whitelist/`)로 분리한다. 팝업에는 버튼 하나만 남기며, 버튼 클릭 시 `chrome.tabs.create()`로 새 탭에서 페이지를 연다. 기존 고급 필터 설정(`open-collector-btn` 패턴)과 동일한 방식.

## 변경 범위

### 신규 생성

| 파일 | 역할 |
| ---- | ---- |
| `src/whitelist/index.html` | 화이트리스트 관리 페이지 마크업 |
| `src/whitelist/index.ts` | 화이트리스트 CRUD 로직 (팝업에서 이관) |
| `src/whitelist/style.css` | 페이지 스타일 (`src/options/style.css` 기반) |

### 수정

| 파일 | 변경 내용 |
| ---- | --------- |
| `src/popup/index.html` | 화이트리스트 섹션(입력+목록) 제거 → 버튼 1개로 교체 |
| `src/popup/index.ts` | `renderWhitelist()`, `addToWhitelist` 이벤트 제거; `open-whitelist-btn` 클릭 이벤트 추가 |
| `src/shared/i18n.ts` | `manageWhitelist`, `whitelistCount`, `whitelistEmpty` 키 추가 |
| `vite.config.ts` | `rollupOptions.input`에 `whitelist` 엔트리 추가 |

### 변경 없음

- `src/features/settings/storage.ts` — `getWhitelist`, `addToWhitelist`, `removeFromWhitelist` 그대로 사용
- `src/manifest.json` — 별도 등록 불필요 (`tabs.create`로 직접 접근)
- `src/options/` — 건드리지 않음

## 화이트리스트 페이지 상세

### 레이아웃 (`src/whitelist/index.html`)

```text
[헤더] Blue Badge Remover / 화이트리스트 관리

[입력 영역]
  [@핸들 입력 ________] [추가]

[목록 헤더] 등록된 계정 (N)

[목록]
  @handle1          [✕]
  @handle2          [✕]
  ...

[힌트] 팔로우 중인 계정은 별도 동기화로 자동 처리됩니다.
```

### 동작

- 페이지 로드 시 `getWhitelist()` 호출 → 목록 렌더링
- 추가: 입력값 `@` prefix 정규화 → `addToWhitelist()` → 목록 재렌더링
- 삭제: 항목 ✕ 클릭 → `removeFromWhitelist()` → 목록 재렌더링
- 유효성: `@`를 제외한 1~15자 영숫자+언더스코어 (`/^[A-Za-z0-9_]{1,15}$/`)
- 언어 설정: `getSettings()`로 현재 언어 로드 → `t()` 적용

### 팝업 변경

기존 화이트리스트 섹션:

```html
<div class="section">
  <h2>화이트리스트</h2>
  <div id="whitelist-container"></div>
  <div class="add-row">...</div>
</div>
```

변경 후:

```html
<div class="section">
  <h2 data-i18n="whitelist">화이트리스트</h2>
  <p class="desc" data-i18n="whitelistDesc">...</p>
  <button id="open-whitelist-btn" class="btn-secondary" data-i18n="manageWhitelist">화이트리스트 관리</button>
</div>
```

팝업 `index.ts`에서:

```ts
document.getElementById('open-whitelist-btn')!.addEventListener('click', () => {
  void chrome.tabs.create({ url: chrome.runtime.getURL('src/whitelist/index.html') });
});
```

## i18n 키 추가

| 키 | ko | en | ja |
| -- | -- | -- | -- |
| `manageWhitelist` | 화이트리스트 관리 | Manage Whitelist | ホワイトリスト管理 |
| `whitelistCount` | 등록된 계정 ({count}) | Accounts ({count}) | 登録済み ({count}) |
| `whitelistEmpty` | 등록된 계정이 없습니다 | No accounts added | 登録なし |

## vite.config.ts 변경

```ts
rollupOptions: {
  input: {
    collector: resolve(__dirname, 'src/collector/index.html'),
    whitelist: resolve(__dirname, 'src/whitelist/index.html'),  // 추가
  },
},
```

## 테스트 계획

- `whitelist/index.ts` 유닛 테스트: 추가/삭제/유효성 검사
- 팝업 버튼 클릭 → 올바른 URL로 탭 생성 확인
- 빈 목록 상태 렌더링 확인
