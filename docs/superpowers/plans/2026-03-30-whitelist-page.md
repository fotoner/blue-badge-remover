# Whitelist Page 분리 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 팝업 인라인 화이트리스트 섹션을 `src/whitelist/` 독립 페이지로 분리하고, 팝업에는 버튼만 남긴다.

**Architecture:** `src/whitelist/index.ts`에서 순수 함수 `normalizeHandle`과 `renderWhitelistItems`를 export하고, `init()`이 chrome storage API와 DOM을 연결한다. 팝업은 `chrome.tabs.create()`로 whitelist 페이지를 연다. 기존 `src/features/settings/storage.ts`의 whitelist CRUD 함수는 그대로 재사용한다.

**Tech Stack:** TypeScript, Chrome Extensions API (MV3), Vitest + jsdom, Vite + CRXJS

---

## File Map

| 상태 | 파일 | 역할 |
| ---- | ---- | ---- |
| 수정 | `src/shared/i18n.ts` | `manageWhitelist`, `whitelistCount`, `whitelistEmpty` 키 추가 |
| 신규 | `src/shared/i18n.test.ts` | i18n 키 커버리지 테스트 |
| 신규 | `src/whitelist/index.html` | 화이트리스트 관리 페이지 마크업 |
| 신규 | `src/whitelist/style.css` | 페이지 스타일 |
| 신규 | `src/whitelist/index.ts` | 화이트리스트 CRUD + 렌더링 로직 |
| 신규 | `src/whitelist/index.test.ts` | normalizeHandle, renderWhitelistItems 유닛 테스트 |
| 수정 | `vite.config.ts` | whitelist 빌드 엔트리 추가 |
| 수정 | `src/popup/index.html` | 화이트리스트 섹션 → 버튼으로 교체 |
| 수정 | `src/popup/index.ts` | renderWhitelist 제거, open-whitelist-btn 이벤트 추가 |

---

## Task 1: i18n 키 추가

**Files:**
- Modify: `src/shared/i18n.ts`
- Create: `src/shared/i18n.test.ts`

- [ ] **Step 1: 실패하는 테스트 작성**

```typescript
// src/shared/i18n.test.ts
import { describe, it, expect } from 'vitest';
import { t } from './i18n';

describe('i18n', () => {
  it('manageWhitelist 키가 ko/en/ja에 모두 존재한다', () => {
    expect(t('manageWhitelist', 'ko')).toBe('화이트리스트 관리');
    expect(t('manageWhitelist', 'en')).toBe('Manage Whitelist');
    expect(t('manageWhitelist', 'ja')).toBe('ホワイトリスト管理');
  });

  it('whitelistCount 키가 count 파라미터를 치환한다', () => {
    expect(t('whitelistCount', 'ko', { count: '3' })).toBe('등록된 계정 (3)');
    expect(t('whitelistCount', 'en', { count: '3' })).toBe('Accounts (3)');
    expect(t('whitelistCount', 'ja', { count: '3' })).toBe('登録済み (3)');
  });

  it('whitelistEmpty 키가 ko/en/ja에 모두 존재한다', () => {
    expect(t('whitelistEmpty', 'ko')).toBe('등록된 계정이 없습니다');
    expect(t('whitelistEmpty', 'en')).toBe('No accounts added');
    expect(t('whitelistEmpty', 'ja')).toBe('登録なし');
  });
});
```

- [ ] **Step 2: 테스트 실행 → 실패 확인**

```bash
npx vitest run src/shared/i18n.test.ts
```

Expected: FAIL — `Argument of type '"manageWhitelist"' is not assignable to parameter of type 'TranslationKeys'`

- [ ] **Step 3: i18n.ts에 키 추가**

`src/shared/i18n.ts`의 `TranslationKeys` union에 아래 3줄 추가 (`'advancedFilterSettings'` 뒤에):

```typescript
  | 'manageWhitelist'
  | 'whitelistCount'
  | 'whitelistEmpty';
```

`ko` 객체에 추가 (`advancedFilterSettings: '고급 필터 설정',` 뒤에):

```typescript
  manageWhitelist: '화이트리스트 관리',
  whitelistCount: '등록된 계정 ({count})',
  whitelistEmpty: '등록된 계정이 없습니다',
```

`en` 객체에 추가 (`advancedFilterSettings: 'Advanced Filter Settings',` 뒤에):

```typescript
  manageWhitelist: 'Manage Whitelist',
  whitelistCount: 'Accounts ({count})',
  whitelistEmpty: 'No accounts added',
```

`ja` 객체에 추가 (`advancedFilterSettings: '高度なフィルター設定',` 뒤에):

```typescript
  manageWhitelist: 'ホワイトリスト管理',
  whitelistCount: '登録済み ({count})',
  whitelistEmpty: '登録なし',
```

- [ ] **Step 4: 테스트 통과 확인**

```bash
npx vitest run src/shared/i18n.test.ts
```

Expected: PASS (3 tests)

- [ ] **Step 5: 커밋**

```bash
git add src/shared/i18n.ts src/shared/i18n.test.ts
git commit -m "feat: i18n에 whitelist 페이지용 키 추가 (manageWhitelist, whitelistCount, whitelistEmpty)"
```

---

## Task 2: 화이트리스트 페이지 HTML/CSS 생성

**Files:**
- Create: `src/whitelist/index.html`
- Create: `src/whitelist/style.css`

- [ ] **Step 1: index.html 생성**

```html
<!DOCTYPE html>
<html lang="ko">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <link rel="stylesheet" href="style.css">
  <title>Blue Badge Remover - 화이트리스트</title>
</head>
<body>
  <div class="container">
    <header>
      <h1>Blue Badge Remover</h1>
      <p class="subtitle" id="page-subtitle">화이트리스트 관리</p>
    </header>

    <section class="section">
      <div class="add-row">
        <input
          type="text"
          id="whitelist-input"
          placeholder="@핸들 입력"
        >
        <button id="whitelist-add" class="btn-primary" type="button">추가</button>
      </div>
    </section>

    <section class="section">
      <h2 id="list-heading">등록된 계정</h2>
      <div id="whitelist-container"></div>
      <p id="whitelist-empty" class="empty-hint" style="display:none">등록된 계정이 없습니다</p>
    </section>

    <section class="section hint-section">
      <p class="hint">팔로우 중인 계정은 별도 동기화로 자동 처리됩니다.</p>
    </section>
  </div>

  <script type="module" src="index.ts"></script>
</body>
</html>
```

- [ ] **Step 2: style.css 생성**

```css
* { margin: 0; padding: 0; box-sizing: border-box; }

body {
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
  font-size: 14px;
  color: #e7e9ea;
  background: #15202b;
  line-height: 1.6;
}

.container {
  max-width: 560px;
  margin: 0 auto;
  padding: 32px 24px;
}

header {
  margin-bottom: 28px;
}

header h1 {
  font-size: 20px;
  font-weight: 700;
}

.subtitle {
  color: #71767b;
  font-size: 13px;
  margin-top: 4px;
}

.section {
  margin-bottom: 24px;
  padding-bottom: 20px;
  border-bottom: 1px solid rgba(56, 68, 77, 0.5);
}

.section:last-child {
  border-bottom: none;
  margin-bottom: 0;
  padding-bottom: 0;
}

h2 {
  font-size: 13px;
  font-weight: 600;
  color: #71767b;
  text-transform: uppercase;
  letter-spacing: 0.5px;
  margin-bottom: 12px;
}

/* 입력 행 */
.add-row {
  display: flex;
  gap: 8px;
}

input[type="text"] {
  flex: 1;
  background: #273340;
  border: 1px solid #38444d;
  color: #e7e9ea;
  padding: 9px 12px;
  border-radius: 8px;
  font-size: 14px;
  font-family: inherit;
  outline: none;
  transition: border-color 0.15s;
}

input[type="text"]:focus {
  border-color: #1d9bf0;
}

input[type="text"]::placeholder {
  color: #536471;
}

.btn-primary {
  background: #1d9bf0;
  color: #fff;
  border: none;
  padding: 9px 18px;
  border-radius: 8px;
  font-size: 14px;
  font-weight: 600;
  cursor: pointer;
  font-family: inherit;
  transition: background 0.15s;
  flex-shrink: 0;
}

.btn-primary:hover {
  background: #1a8cd8;
}

/* 목록 아이템 */
.whitelist-item {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 9px 10px;
  margin: 2px 0;
  border-radius: 8px;
  font-size: 14px;
  transition: background 0.1s;
}

.whitelist-item:hover {
  background: rgba(56, 68, 77, 0.3);
}

.whitelist-item span {
  color: #e7e9ea;
}

.whitelist-item button {
  background: none;
  border: none;
  color: #536471;
  padding: 2px 8px;
  font-size: 16px;
  border-radius: 4px;
  cursor: pointer;
  font-family: inherit;
  transition: color 0.15s, background 0.15s;
}

.whitelist-item button:hover {
  color: #f4212e;
  background: rgba(244, 33, 46, 0.1);
}

/* 빈 상태 */
.empty-hint {
  color: #536471;
  font-size: 13px;
  padding: 12px 0;
}

/* 힌트 */
.hint {
  color: #536471;
  font-size: 12px;
}

.hint-section {
  border-bottom: none;
}
```

- [ ] **Step 3: 커밋**

```bash
git add src/whitelist/index.html src/whitelist/style.css
git commit -m "feat: 화이트리스트 페이지 HTML/CSS 추가"
```

---

## Task 3: 화이트리스트 페이지 로직 (TDD)

**Files:**
- Create: `src/whitelist/index.ts`
- Create: `src/whitelist/index.test.ts`

- [ ] **Step 1: normalizeHandle 실패 테스트 작성**

```typescript
// src/whitelist/index.test.ts
import { describe, it, expect, beforeEach } from 'vitest';
import { normalizeHandle, renderWhitelistItems } from './index';

describe('normalizeHandle', () => {
  it('유효한 핸들에서 @ prefix를 붙여 반환한다', () => {
    expect(normalizeHandle('testuser')).toBe('@testuser');
  });

  it('입력에 @ 가 이미 있어도 정상 처리한다', () => {
    expect(normalizeHandle('@testuser')).toBe('@testuser');
  });

  it('앞뒤 공백을 제거한다', () => {
    expect(normalizeHandle('  testuser  ')).toBe('@testuser');
  });

  it('빈 문자열이면 null을 반환한다', () => {
    expect(normalizeHandle('')).toBeNull();
    expect(normalizeHandle('  ')).toBeNull();
    expect(normalizeHandle('@')).toBeNull();
  });

  it('16자 이상이면 null을 반환한다', () => {
    expect(normalizeHandle('a'.repeat(16))).toBeNull();
  });

  it('허용되지 않는 문자가 있으면 null을 반환한다', () => {
    expect(normalizeHandle('user name')).toBeNull();
    expect(normalizeHandle('user!name')).toBeNull();
    expect(normalizeHandle('user.name')).toBeNull();
  });

  it('15자 핸들은 허용한다', () => {
    expect(normalizeHandle('a'.repeat(15))).toBe(`@${'a'.repeat(15)}`);
  });
});
```

- [ ] **Step 2: 테스트 실행 → 실패 확인**

```bash
npx vitest run src/whitelist/index.test.ts
```

Expected: FAIL — `normalizeHandle is not a function` (또는 모듈 없음 에러)

- [ ] **Step 3: normalizeHandle 구현**

`src/whitelist/index.ts` 파일 생성:

```typescript
import { getSettings } from '@features/settings';
import { getWhitelist, addToWhitelist, removeFromWhitelist } from '@features/settings';
import { t } from '@shared/i18n';
import type { Language } from '@shared/i18n';

export function normalizeHandle(input: string): string | null {
  const handle = input.trim().replace(/^@/, '');
  if (!handle || !/^[A-Za-z0-9_]{1,15}$/.test(handle)) return null;
  return `@${handle}`;
}

export function renderWhitelistItems(
  container: HTMLElement,
  emptyEl: HTMLElement,
  headingEl: HTMLElement,
  list: string[],
  lang: Language,
  onRemove: (handle: string) => Promise<void>,
): void {
  container.innerHTML = '';

  if (list.length === 0) {
    emptyEl.style.display = 'block';
    headingEl.textContent = t('whitelistCount', lang, { count: '0' });
    return;
  }

  emptyEl.style.display = 'none';
  headingEl.textContent = t('whitelistCount', lang, { count: String(list.length) });

  for (const handle of list) {
    const item = document.createElement('div');
    item.className = 'whitelist-item';

    const span = document.createElement('span');
    span.textContent = handle;

    const btn = document.createElement('button');
    btn.textContent = '✕';
    btn.type = 'button';
    btn.addEventListener('click', () => { void onRemove(handle); });

    item.append(span, btn);
    container.appendChild(item);
  }
}

async function init(): Promise<void> {
  const settings = await getSettings();
  const lang = settings.language;

  const subtitleEl = document.getElementById('page-subtitle')!;
  const inputEl = document.getElementById('whitelist-input') as HTMLInputElement;
  const addBtn = document.getElementById('whitelist-add') as HTMLButtonElement;
  const container = document.getElementById('whitelist-container')!;
  const emptyEl = document.getElementById('whitelist-empty')!;
  const headingEl = document.getElementById('list-heading')!;

  subtitleEl.textContent = t('manageWhitelist', lang);
  inputEl.placeholder = t('whitelistPlaceholder', lang);
  addBtn.textContent = t('add', lang);
  emptyEl.textContent = t('whitelistEmpty', lang);

  const refresh = async (): Promise<void> => {
    const list = await getWhitelist();
    renderWhitelistItems(container, emptyEl, headingEl, list, lang, async (handle) => {
      await removeFromWhitelist(handle);
      await refresh();
    });
  };

  addBtn.addEventListener('click', async () => {
    const normalized = normalizeHandle(inputEl.value);
    if (!normalized) return;
    await addToWhitelist(normalized);
    inputEl.value = '';
    await refresh();
  });

  inputEl.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') addBtn.click();
  });

  await refresh();
}

init();
```

- [ ] **Step 4: renderWhitelistItems 테스트 추가 후 전체 테스트 실행**

`src/whitelist/index.test.ts`에 다음 블록 추가:

```typescript
describe('renderWhitelistItems', () => {
  let container: HTMLElement;
  let emptyEl: HTMLElement;
  let headingEl: HTMLElement;

  beforeEach(() => {
    container = document.createElement('div');
    emptyEl = document.createElement('p');
    headingEl = document.createElement('h2');
  });

  it('목록이 비어있으면 emptyEl을 표시하고 container는 비운다', () => {
    renderWhitelistItems(container, emptyEl, headingEl, [], 'ko', async () => {});
    expect(emptyEl.style.display).toBe('block');
    expect(container.children.length).toBe(0);
    expect(headingEl.textContent).toBe('등록된 계정 (0)');
  });

  it('목록 항목만큼 .whitelist-item 엘리먼트를 렌더링한다', () => {
    renderWhitelistItems(
      container, emptyEl, headingEl,
      ['@alice', '@bob'], 'ko',
      async () => {},
    );
    expect(emptyEl.style.display).toBe('none');
    expect(container.querySelectorAll('.whitelist-item').length).toBe(2);
    expect(headingEl.textContent).toBe('등록된 계정 (2)');
  });

  it('각 항목의 span에 핸들 텍스트가 표시된다', () => {
    renderWhitelistItems(
      container, emptyEl, headingEl,
      ['@alice'], 'ko',
      async () => {},
    );
    const span = container.querySelector('.whitelist-item span');
    expect(span?.textContent).toBe('@alice');
  });
});
```

- [ ] **Step 5: 전체 테스트 통과 확인**

```bash
npx vitest run src/whitelist/index.test.ts
```

Expected: PASS (10 tests)

- [ ] **Step 6: 커밋**

```bash
git add src/whitelist/index.ts src/whitelist/index.test.ts
git commit -m "feat: 화이트리스트 페이지 로직 구현 (normalizeHandle, renderWhitelistItems)"
```

---

## Task 4: vite.config.ts 업데이트

**Files:**
- Modify: `vite.config.ts`

- [ ] **Step 1: whitelist 빌드 엔트리 추가**

`vite.config.ts`의 `rollupOptions.input`을 다음으로 교체:

```typescript
rollupOptions: {
  input: {
    collector: resolve(__dirname, 'src/collector/index.html'),
    whitelist: resolve(__dirname, 'src/whitelist/index.html'),
  },
},
```

- [ ] **Step 2: 빌드 확인**

```bash
npx vite build 2>&1 | tail -20
```

Expected: `dist/` 생성, 에러 없음. `src/whitelist/index.html` 관련 청크 표시됨.

- [ ] **Step 3: 커밋**

```bash
git add vite.config.ts
git commit -m "build: whitelist 페이지 빌드 엔트리 추가"
```

---

## Task 5: 팝업 수정

**Files:**
- Modify: `src/popup/index.html`
- Modify: `src/popup/index.ts`

- [ ] **Step 1: popup/index.html — 화이트리스트 섹션 교체**

아래 블록을 찾아:

```html
    <div class="section">
      <h2 data-i18n="whitelist">화이트리스트</h2>
      <p class="desc" data-i18n="whitelistDesc">파딱이어도 숨기지 않을 계정을 직접 추가합니다</p>
      <div id="whitelist-container"></div>
      <div class="add-row">
        <input type="text" id="whitelist-input" data-i18n-placeholder="whitelistPlaceholder" placeholder="@핸들 입력">
        <button id="whitelist-add" class="btn-small" data-i18n="add">추가</button>
      </div>
    </div>
```

다음으로 교체:

```html
    <div class="section">
      <h2 data-i18n="whitelist">화이트리스트</h2>
      <p class="desc" data-i18n="whitelistDesc">파딱이어도 숨기지 않을 계정을 직접 추가합니다</p>
      <button id="open-whitelist-btn" class="btn-secondary" data-i18n="manageWhitelist">화이트리스트 관리</button>
    </div>
```

- [ ] **Step 2: popup/index.ts — import 정리**

첫 번째 줄을 찾아:

```typescript
import { getSettings, saveSettings, getWhitelist, addToWhitelist, removeFromWhitelist } from '@features/settings';
```

다음으로 교체:

```typescript
import { getSettings, saveSettings } from '@features/settings';
```

- [ ] **Step 3: popup/index.ts — init()에서 renderWhitelist 호출 제거**

`init()` 함수 안의 다음 줄 제거:

```typescript
  renderWhitelist();
```

- [ ] **Step 4: popup/index.ts — renderWhitelist 함수 전체 제거**

아래 함수 블록 전체 제거:

```typescript
async function renderWhitelist(): Promise<void> {
  const container = document.getElementById('whitelist-container')!;
  container.innerHTML = '';
  const list = await getWhitelist();
  for (const handle of list) {
    const item = document.createElement('div');
    item.className = 'whitelist-item';
    const span = document.createElement('span');
    span.textContent = handle;
    const btn = document.createElement('button');
    btn.textContent = '\u2715';
    btn.addEventListener('click', async () => {
      await removeFromWhitelist(handle);
      await renderWhitelist();
    });
    item.append(span, btn);
    container.appendChild(item);
  }
}
```

- [ ] **Step 5: popup/index.ts — bindEvents()에서 whitelist-add 이벤트 제거 후 open-whitelist-btn 추가**

`bindEvents()` 내 아래 블록 제거:

```typescript
  document.getElementById('whitelist-add')!.addEventListener('click', async () => {
    const input = document.getElementById('whitelist-input') as HTMLInputElement;
    const handle = input.value.trim().replace(/^@/, '');
    if (!handle || !/^[A-Za-z0-9_]{1,15}$/.test(handle)) return;
    const normalized = `@${handle}`;
    await addToWhitelist(normalized);
    input.value = '';
    await renderWhitelist();
  });
```

같은 위치(또는 `bindEvents()` 끝 `}` 바로 앞)에 추가:

```typescript
  document.getElementById('open-whitelist-btn')!.addEventListener('click', () => {
    void chrome.tabs.create({ url: chrome.runtime.getURL('src/whitelist/index.html') });
  });
```

- [ ] **Step 6: 전체 테스트 통과 확인**

```bash
npx vitest run
```

Expected: PASS (전체)

- [ ] **Step 7: 빌드 확인**

```bash
npx vite build 2>&1 | tail -20
```

Expected: 에러 없음

- [ ] **Step 8: 커밋**

```bash
git add src/popup/index.html src/popup/index.ts
git commit -m "feat: 팝업 화이트리스트 섹션을 관리 페이지 버튼으로 교체"
```

---

## Self-Review

**스펙 커버리지 체크:**
- [x] 팝업 화이트리스트 섹션 → 버튼 교체 (Task 5)
- [x] `src/whitelist/` 신규 페이지 (Task 2, 3)
- [x] `chrome.tabs.create()` 패턴 (Task 5 Step 5)
- [x] i18n 키 추가 (Task 1)
- [x] `vite.config.ts` 엔트리 추가 (Task 4)
- [x] `src/features/settings/storage.ts` 재사용 (Task 3 Step 3)
- [x] 유효성 검사 테스트 (Task 3 Step 1)
- [x] 렌더링 테스트 (Task 3 Step 4)

**타입 일관성 체크:**
- `normalizeHandle`은 Task 3 Step 1에서 정의, Step 3에서 구현 — 시그니처 일치
- `renderWhitelistItems` 파라미터 순서: Task 3 Step 1(테스트)과 Step 3(구현) 일치
- i18n 키 (`manageWhitelist`, `whitelistCount`, `whitelistEmpty`) Task 1에서 정의 후 Task 3에서 사용 — 일치
