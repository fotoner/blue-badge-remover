# 내장 필터 ON/OFF 토글 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 고급 필터 설정 페이지에서 내장 필터(DEFAULT_FILTER_LIST) 적용을 ON/OFF 토글로 제어한다.

**Architecture:** `Settings` 타입에 `defaultFilterEnabled` 필드를 추가하고, options 페이지에서 저장, content script에서 읽어 `loadFilterRules()` 시 반영한다. 규칙 조합 로직은 순수 함수 `buildActiveRules()`로 추출해 테스트 가능하게 만든다.

**Tech Stack:** TypeScript, Chrome Extensions API (Manifest V3), Vitest

---

## File Map

| 파일 | 역할 |
|------|------|
| `src/shared/types/index.ts` | `Settings` 인터페이스에 `defaultFilterEnabled` 추가 |
| `src/shared/constants/index.ts` | `DEFAULT_SETTINGS`에 `defaultFilterEnabled: true` 추가 |
| `src/features/keyword-filter/rule-builder.ts` | 새 파일 — `buildActiveRules()` 순수 함수 |
| `src/features/keyword-filter/rule-builder.test.ts` | 새 파일 — `buildActiveRules()` 단위 테스트 |
| `src/features/keyword-filter/index.ts` | `buildActiveRules` re-export 추가 |
| `src/content/index.ts` | `loadFilterRules()`에서 `buildActiveRules()` 사용, `listenForSettingsChanges()`에서 변경 감지 |
| `src/options/index.html` | 내장 필터 섹션에 토글 추가 |
| `src/options/index.ts` | 토글 로드/저장 로직 추가, stats 업데이트 반영 |

---

### Task 1: Settings 타입 및 기본값에 `defaultFilterEnabled` 추가

**Files:**
- Modify: `src/shared/types/index.ts`
- Modify: `src/shared/constants/index.ts`

- [ ] **Step 1: `Settings` 인터페이스에 필드 추가**

`src/shared/types/index.ts`의 `Settings` 인터페이스를 다음과 같이 수정:

```ts
export interface Settings {
  enabled: boolean;
  filter: {
    timeline: boolean;
    replies: boolean;
    search: boolean;
  };
  hideMode: 'remove' | 'collapse';
  retweetFilter: boolean;
  quoteMode: 'off' | 'quote-only' | 'entire';
  debugMode: boolean;
  language: 'ko' | 'en' | 'ja';
  keywordFilterEnabled: boolean;
  keywordCollectorEnabled: boolean;
  defaultFilterEnabled: boolean;
}
```

- [ ] **Step 2: `DEFAULT_SETTINGS`에 기본값 추가**

`src/shared/constants/index.ts`의 `DEFAULT_SETTINGS`를 다음과 같이 수정:

```ts
export const DEFAULT_SETTINGS: Settings = {
  enabled: true,
  filter: {
    timeline: true,
    replies: true,
    search: true,
  },
  hideMode: 'remove',
  retweetFilter: true,
  quoteMode: 'off',
  debugMode: false,
  language: 'ko',
  keywordFilterEnabled: false,
  keywordCollectorEnabled: false,
  defaultFilterEnabled: true,
};
```

- [ ] **Step 3: 타입 체크 실행**

```bash
npx tsc --noEmit
```

Expected: 에러 없음

- [ ] **Step 4: 커밋**

```bash
git add src/shared/types/index.ts src/shared/constants/index.ts
git commit -m "feat: add defaultFilterEnabled to Settings type"
```

---

### Task 2: `buildActiveRules()` 순수 함수 작성 (TDD)

**Files:**
- Create: `src/features/keyword-filter/rule-builder.ts`
- Create: `src/features/keyword-filter/rule-builder.test.ts`
- Modify: `src/features/keyword-filter/index.ts`

- [ ] **Step 1: 실패하는 테스트 작성**

`src/features/keyword-filter/rule-builder.test.ts` 파일 생성:

```ts
import { describe, it, expect } from 'vitest';
import { buildActiveRules } from './rule-builder';

describe('buildActiveRules', () => {
  it('기본 필터 활성화 시 기본 키워드와 커스텀 키워드 모두 포함', () => {
    const rules = buildActiveRules(true, '투자', '커스텀키워드');
    expect(rules.some((r) => r.type === 'keyword' && r.value === '투자')).toBe(true);
    expect(rules.some((r) => r.type === 'keyword' && r.value === '커스텀키워드')).toBe(true);
  });

  it('기본 필터 비활성화 시 기본 키워드 미포함, 커스텀 키워드는 포함', () => {
    const rules = buildActiveRules(false, '투자', '커스텀키워드');
    expect(rules.some((r) => r.type === 'keyword' && r.value === '투자')).toBe(false);
    expect(rules.some((r) => r.type === 'keyword' && r.value === '커스텀키워드')).toBe(true);
  });

  it('기본 필터 비활성화 + 커스텀 필터 없을 때 빈 배열 반환', () => {
    const rules = buildActiveRules(false, '투자', '');
    expect(rules).toHaveLength(0);
  });

  it('기본 필터 활성화 + 커스텀 필터 없을 때 기본 키워드만 포함', () => {
    const rules = buildActiveRules(true, '투자', '');
    expect(rules.some((r) => r.type === 'keyword' && r.value === '투자')).toBe(true);
  });
});
```

- [ ] **Step 2: 테스트 실행 — 실패 확인**

```bash
npx vitest run src/features/keyword-filter/rule-builder.test.ts
```

Expected: FAIL — `Cannot find module './rule-builder'`

- [ ] **Step 3: `rule-builder.ts` 구현**

`src/features/keyword-filter/rule-builder.ts` 파일 생성:

```ts
import type { FilterRule } from '@shared/types';
import { parseFilterList } from './filter-rule-parser';

export function buildActiveRules(
  defaultFilterEnabled: boolean,
  defaultList: string,
  custom: string,
): FilterRule[] {
  const base = defaultFilterEnabled ? defaultList + '\n' : '';
  return parseFilterList(base + custom);
}
```

- [ ] **Step 4: 테스트 실행 — 통과 확인**

```bash
npx vitest run src/features/keyword-filter/rule-builder.test.ts
```

Expected: PASS (4 tests)

- [ ] **Step 5: `index.ts`에 re-export 추가**

`src/features/keyword-filter/index.ts`에 한 줄 추가:

```ts
export { parseFilterList } from './filter-rule-parser';
export { matchesKeywordFilter } from './keyword-matcher';
export { ProfileCache } from './profile-cache';
export { DEFAULT_FILTER_LIST } from './default-filters';
export { getCustomFilterList, saveCustomFilterList } from './filter-storage';
export { buildActiveRules } from './rule-builder';
```

- [ ] **Step 6: 전체 테스트 실행**

```bash
npx vitest run
```

Expected: PASS

- [ ] **Step 7: 커밋**

```bash
git add src/features/keyword-filter/rule-builder.ts src/features/keyword-filter/rule-builder.test.ts src/features/keyword-filter/index.ts
git commit -m "feat: extract buildActiveRules pure function with tests"
```

---

### Task 3: `content/index.ts`에서 `buildActiveRules` 사용 + 변경 감지

**Files:**
- Modify: `src/content/index.ts`

- [ ] **Step 1: import 추가**

`src/content/index.ts` 4번째 줄의 import를 수정:

```ts
import { ProfileCache, parseFilterList, matchesKeywordFilter, DEFAULT_FILTER_LIST, getCustomFilterList, buildActiveRules } from '@features/keyword-filter';
```

- [ ] **Step 2: `loadFilterRules()` 함수 수정**

기존:
```ts
async function loadFilterRules(): Promise<void> {
  const custom = await getCustomFilterList();
  activeFilterRules = parseFilterList(DEFAULT_FILTER_LIST + '\n' + custom);
}
```

변경 후:
```ts
async function loadFilterRules(): Promise<void> {
  const custom = await getCustomFilterList();
  activeFilterRules = buildActiveRules(currentSettings.defaultFilterEnabled, DEFAULT_FILTER_LIST, custom);
}
```

- [ ] **Step 3: `listenForSettingsChanges()`에서 `defaultFilterEnabled` 변경 감지 추가**

기존 코드에서 `modeChanged` 블록 바로 뒤에 추가:

```ts
// 기존 코드 (참고용, 수정 대상)
const modeChanged =
  prev.keywordFilterEnabled !== currentSettings.keywordFilterEnabled;
if (modeChanged) {
  restoreHiddenTweets();
  reprocessExistingTweets();
}
```

수정 후:
```ts
const modeChanged =
  prev.keywordFilterEnabled !== currentSettings.keywordFilterEnabled;
if (modeChanged) {
  restoreHiddenTweets();
  reprocessExistingTweets();
}
const defaultFilterChanged =
  prev.defaultFilterEnabled !== currentSettings.defaultFilterEnabled;
if (defaultFilterChanged) {
  void loadFilterRules().then(() => {
    restoreHiddenTweets();
    reprocessExistingTweets();
  });
}
```

- [ ] **Step 4: 타입 체크**

```bash
npx tsc --noEmit
```

Expected: 에러 없음

- [ ] **Step 5: 테스트 실행**

```bash
npx vitest run
```

Expected: PASS

- [ ] **Step 6: 커밋**

```bash
git add src/content/index.ts
git commit -m "feat: use buildActiveRules in loadFilterRules, detect defaultFilterEnabled change"
```

---

### Task 4: `options/index.html`에 토글 추가

**Files:**
- Modify: `src/options/index.html`
- Modify: `src/options/style.css`

- [ ] **Step 1: 내장 필터 섹션 헤더에 토글 추가**

`src/options/index.html`의 내장 필터 섹션을 다음으로 교체:

```html
<section class="section">
  <div class="section-header">
    <h2>📋 내장 필터 <span class="readonly-badge">읽기 전용</span></h2>
    <label class="toggle-label">
      <span class="toggle-text">사용</span>
      <input type="checkbox" id="default-filter-enabled" checked>
    </label>
  </div>
  <textarea id="builtin-filters" class="filter-textarea" readonly></textarea>
</section>
```

- [ ] **Step 2: `section-header`, `toggle-label` 스타일 추가**

`src/options/style.css` 파일 끝에 추가:

```css
.section-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 12px;
}

.section-header h2 {
  margin-bottom: 0;
}

.toggle-label {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 13px;
  color: #71767b;
  cursor: pointer;
  user-select: none;
}
```

- [ ] **Step 3: 커밋**

```bash
git add src/options/index.html src/options/style.css
git commit -m "feat: add default filter toggle to options page HTML"
```

---

### Task 5: `options/index.ts`에 토글 로드/저장 로직 추가

**Files:**
- Modify: `src/options/index.ts`

- [ ] **Step 1: `init()` 함수 전체 교체**

`src/options/index.ts`를 다음으로 교체:

```ts
import {
  DEFAULT_FILTER_LIST,
  getCustomFilterList,
  saveCustomFilterList,
  parseFilterList,
} from '@features/keyword-filter';
import { getSettings, saveSettings } from '@features/settings';

async function init(): Promise<void> {
  const builtinEl = document.getElementById('builtin-filters') as HTMLTextAreaElement;
  const customEl = document.getElementById('custom-filters') as HTMLTextAreaElement;
  const saveBtn = document.getElementById('save-btn') as HTMLButtonElement;
  const saveStatus = document.getElementById('save-status') as HTMLParagraphElement;
  const ruleStats = document.getElementById('rule-stats') as HTMLParagraphElement;
  const defaultFilterToggle = document.getElementById('default-filter-enabled') as HTMLInputElement;

  builtinEl.value = DEFAULT_FILTER_LIST;

  const [customText, settings] = await Promise.all([
    getCustomFilterList(),
    getSettings(),
  ]);

  customEl.value = customText;
  defaultFilterToggle.checked = settings.defaultFilterEnabled;

  updateStats(settings.defaultFilterEnabled, DEFAULT_FILTER_LIST, customText, ruleStats);

  defaultFilterToggle.addEventListener('change', async () => {
    const updated = { ...settings, defaultFilterEnabled: defaultFilterToggle.checked };
    await saveSettings(updated);
    updateStats(defaultFilterToggle.checked, DEFAULT_FILTER_LIST, customEl.value, ruleStats);
  });

  saveBtn.addEventListener('click', async () => {
    const text = customEl.value;
    try {
      await saveCustomFilterList(text);
      updateStats(defaultFilterToggle.checked, DEFAULT_FILTER_LIST, text, ruleStats);
      saveStatus.textContent = '저장되었습니다.';
      saveStatus.className = 'save-status success';
    } catch {
      saveStatus.textContent = '저장에 실패했습니다.';
      saveStatus.className = 'save-status error';
    }
    setTimeout(() => {
      saveStatus.textContent = '';
    }, 2000);
  });
}

function updateStats(
  defaultFilterEnabled: boolean,
  builtin: string,
  custom: string,
  el: HTMLParagraphElement,
): void {
  const combined = (defaultFilterEnabled ? builtin + '\n' : '') + custom;
  const allRules = parseFilterList(combined);
  const nonEmptyNonComment = combined
    .split('\n')
    .filter((l) => {
      const t = l.trim();
      return t.length > 0 && !t.startsWith('!');
    }).length;
  const errorCount = Math.max(0, nonEmptyNonComment - allRules.length);
  el.textContent = `활성 규칙: ${allRules.length}개 | 파싱 에러: ${errorCount}개`;
}

init();
```

- [ ] **Step 2: `@features/settings`에서 `saveSettings` export 확인**

`src/features/settings/index.ts`를 확인:

```bash
cat src/features/settings/index.ts
```

만약 `saveSettings`가 export되지 않았다면, `src/features/settings/index.ts`에 추가:

```ts
export { getSettings, saveSettings } from './storage';
```

- [ ] **Step 3: 타입 체크**

```bash
npx tsc --noEmit
```

Expected: 에러 없음

- [ ] **Step 4: 전체 테스트 실행**

```bash
npx vitest run
```

Expected: PASS

- [ ] **Step 5: 커밋**

```bash
git add src/options/index.ts src/features/settings/index.ts
git commit -m "feat: wire default filter toggle load/save in options page"
```

---

## 셀프 리뷰 체크리스트

- [x] **스펙 커버리지**: 토글 UI, 저장, content script 반영, 실시간 재처리 모두 포함
- [x] **플레이스홀더 없음**: 모든 스텝에 실제 코드 포함
- [x] **타입 일관성**: `defaultFilterEnabled: boolean`이 모든 태스크에서 동일하게 사용됨
- [x] **하위 호환성**: `DEFAULT_SETTINGS.defaultFilterEnabled = true`로 기존 동작 유지
- [x] **`settings` 변수 스코프**: Task 5에서 `defaultFilterToggle.change` 이벤트가 `settings`를 클로저로 캡처함 — `saveSettings`는 항상 최신 `defaultFilterEnabled` 값으로 저장됨
