# Keyword Distribution — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Collector 페이지 상단에 수집된 트윗/바이오 텍스트에서 top 30 키워드와 분포 막대를 표시한다.

**Architecture:** 순수 함수 `tokenize`/`countTokens`/`topN`을 `src/collector/keyword-tokenizer.ts`에 분리해 단위 테스트 가능하게 만든다. DOM 렌더링은 `src/collector/index.ts`의 `renderKeywords()`가 담당한다. 스타일은 `src/collector/style.css`에 추가.

**Tech Stack:** TypeScript, Vitest (jsdom), 바닐라 HTML/CSS — 외부 라이브러리 없음

---

## File Map

| 파일 | 변경 |
|------|------|
| `src/collector/keyword-tokenizer.ts` | **신규** — `tokenize`, `countTokens`, `topN` 순수 함수 |
| `tests/collector/keyword-tokenizer.test.ts` | **신규** — 위 함수들의 단위 테스트 |
| `src/collector/index.html` | **수정** — `#keywords` div 추가 |
| `src/collector/index.ts` | **수정** — `renderKeywords()` 추가, `init()`/storage listener에 호출 추가 |
| `src/collector/style.css` | **수정** — keyword 섹션 스타일 추가 |

---

## Task 1: Tokenizer 단위 테스트 작성

**Files:**
- Create: `tests/collector/keyword-tokenizer.test.ts`

- [ ] **Step 1: 테스트 파일 생성**

```typescript
// tests/collector/keyword-tokenizer.test.ts
import { describe, it, expect } from 'vitest';
import { tokenize, countTokens, topN } from '../../src/collector/keyword-tokenizer';

describe('tokenize', () => {
  it('한글 완성형을 글자 단위로 분리한다', () => {
    expect(tokenize('좋아요')).toEqual(['좋', '아', '요']);
  });

  it('영어는 단어 단위로 분리한다', () => {
    expect(tokenize('hello world')).toEqual(['hello', 'world']);
  });

  it('한글과 영어가 섞인 텍스트를 처리한다', () => {
    expect(tokenize('파딱 coin 이야기')).toEqual(['파', '딱', 'coin', '이', '야', '기']);
  });

  it('영어 1글자 토큰은 제외한다', () => {
    expect(tokenize('I am here')).toEqual(['am', 'here']);
  });

  it('숫자는 제외한다', () => {
    expect(tokenize('123 테스트')).toEqual(['테', '스', '트']);
  });

  it('특수문자·이모지는 제외한다', () => {
    expect(tokenize('🚀 hello! @world')).toEqual(['hello', 'world']);
  });

  it('빈 문자열은 빈 배열을 반환한다', () => {
    expect(tokenize('')).toEqual([]);
  });
});

describe('countTokens', () => {
  it('여러 텍스트에서 토큰 빈도를 집계한다', () => {
    const counts = countTokens(['이게 뭐야', '이건 뭐지']);
    expect(counts.get('이')).toBe(2);
    expect(counts.get('게')).toBe(1);
    expect(counts.get('건')).toBe(1);
  });

  it('빈 배열은 빈 Map을 반환한다', () => {
    expect(countTokens([])).toEqual(new Map());
  });
});

describe('topN', () => {
  it('빈도 내림차순으로 상위 N개를 반환한다', () => {
    const counts = new Map([['이', 10], ['거', 5], ['뭐', 8]]);
    const result = topN(counts, 2);
    expect(result).toEqual([
      { token: '이', count: 10 },
      { token: '뭐', count: 8 },
    ]);
  });

  it('N이 Map 크기보다 크면 전체를 반환한다', () => {
    const counts = new Map([['이', 3], ['거', 1]]);
    expect(topN(counts, 30)).toHaveLength(2);
  });
});
```

- [ ] **Step 2: 테스트 실행 — FAIL 확인**

```bash
cd /Users/bada/Documents/GitHub/blue-badge-remover
npx vitest run tests/collector/keyword-tokenizer.test.ts
```

Expected: `Error: Cannot find module '../../src/collector/keyword-tokenizer'`

---

## Task 2: Tokenizer 구현

**Files:**
- Create: `src/collector/keyword-tokenizer.ts`

- [ ] **Step 1: 구현 파일 작성**

```typescript
// src/collector/keyword-tokenizer.ts

function isKorean(char: string): boolean {
  const code = char.charCodeAt(0);
  return code >= 0xac00 && code <= 0xd7a3;
}

function isAlpha(char: string): boolean {
  const code = char.charCodeAt(0);
  return (code >= 0x41 && code <= 0x5a) || (code >= 0x61 && code <= 0x7a);
}

export function tokenize(text: string): string[] {
  const tokens: string[] = [];
  let word = '';

  for (const char of text) {
    if (isKorean(char)) {
      if (word) {
        if (word.length >= 2) tokens.push(word.toLowerCase());
        word = '';
      }
      tokens.push(char);
    } else if (isAlpha(char)) {
      word += char;
    } else {
      if (word) {
        if (word.length >= 2) tokens.push(word.toLowerCase());
        word = '';
      }
    }
  }

  if (word && word.length >= 2) tokens.push(word.toLowerCase());
  return tokens;
}

export function countTokens(texts: string[]): Map<string, number> {
  const counts = new Map<string, number>();
  for (const text of texts) {
    for (const token of tokenize(text)) {
      counts.set(token, (counts.get(token) ?? 0) + 1);
    }
  }
  return counts;
}

export function topN(
  counts: Map<string, number>,
  n: number,
): Array<{ token: string; count: number }> {
  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, n)
    .map(([token, count]) => ({ token, count }));
}
```

- [ ] **Step 2: 테스트 실행 — PASS 확인**

```bash
npx vitest run tests/collector/keyword-tokenizer.test.ts
```

Expected: 전체 테스트 통과

- [ ] **Step 3: 커밋**

```bash
git add src/collector/keyword-tokenizer.ts tests/collector/keyword-tokenizer.test.ts
git commit -m "feat(collector): add keyword tokenizer with tests"
```

---

## Task 3: HTML에 keywords 섹션 추가

**Files:**
- Modify: `src/collector/index.html`

- [ ] **Step 1: `#keywords` div 삽입 (toolbar 아래, list 위)**

`src/collector/index.html`의 `<div class="toolbar">` 블록과 `<div id="list" ...>` 사이에 추가:

```html
    <div id="keywords" class="keywords-section" style="display:none"></div>

    <div id="list" class="list"></div>
```

최종 body 구조:
```html
<body>
  <div class="container">
    <header class="header">
      <h1>키워드 수집 데이터</h1>
      <p class="subtitle">필터링되지 않은 파딱 계정의 텍스트 수집 결과</p>
    </header>

    <div class="toolbar">
      <div class="stats" id="stats">로딩 중...</div>
      <div class="toolbar-actions">
        <button type="button" id="export-json-btn">JSON 내보내기</button>
        <button type="button" id="copy-text-btn">텍스트 복사</button>
        <button type="button" id="clear-btn" class="btn-danger">전체 삭제</button>
      </div>
    </div>

    <div id="keywords" class="keywords-section" style="display:none"></div>

    <div id="list" class="list"></div>
  </div>

  <script type="module" src="index.ts"></script>
</body>
```

- [ ] **Step 2: 커밋**

```bash
git add src/collector/index.html
git commit -m "feat(collector): add keywords section placeholder to HTML"
```

---

## Task 4: renderKeywords 구현

**Files:**
- Modify: `src/collector/index.ts`

- [ ] **Step 1: import 추가 및 renderKeywords 함수 삽입**

파일 상단 import 뒤에 추가:

```typescript
import { countTokens, topN } from './keyword-tokenizer';
```

`init()` 함수 내 `renderStats(list)` 호출 바로 다음 줄에 `renderKeywords(list)` 호출 추가:

```typescript
async function init(): Promise<void> {
  const list = await getCollectedFadaks();
  renderStats(list);
  renderKeywords(list);   // ← 추가
  renderList(list);
  bindEvents();

  chrome.storage.onChanged.addListener((changes) => {
    if (changes['collectedFadaks']) {
      const updated = (changes['collectedFadaks'].newValue as CollectedFadak[] | undefined) ?? [];
      renderStats(updated);
      renderKeywords(updated);   // ← 추가
      renderList(updated);
    }
  });
}
```

`renderStats` 함수 바로 다음에 `renderKeywords` 함수 추가:

```typescript
function renderKeywords(list: CollectedFadak[]): void {
  const section = document.getElementById('keywords')!;

  const allTexts: string[] = [];
  for (const fadak of list) {
    if (fadak.bio) allTexts.push(fadak.bio);
    for (const t of fadak.tweetTexts) allTexts.push(t);
  }

  if (allTexts.length === 0) {
    section.style.display = 'none';
    return;
  }

  const counts = countTokens(allTexts);
  const top = topN(counts, 30);
  const max = top[0]?.count ?? 1;

  section.style.display = 'block';
  section.innerHTML = '';

  const heading = document.createElement('h2');
  heading.className = 'keywords-heading';
  heading.textContent = '자주 사용되는 키워드 Top 30';
  section.appendChild(heading);

  const chart = document.createElement('div');
  chart.className = 'keywords-chart';

  top.forEach(({ token, count }, i) => {
    const row = document.createElement('div');
    row.className = 'kw-row';

    const rank = document.createElement('span');
    rank.className = 'kw-rank';
    rank.textContent = String(i + 1);

    const label = document.createElement('span');
    label.className = 'kw-label';
    label.textContent = token;

    const barWrap = document.createElement('div');
    barWrap.className = 'kw-bar-wrap';

    const bar = document.createElement('div');
    bar.className = 'kw-bar';
    bar.style.width = `${Math.round((count / max) * 100)}%`;

    barWrap.appendChild(bar);

    const countEl = document.createElement('span');
    countEl.className = 'kw-count';
    countEl.textContent = String(count);

    row.append(rank, label, barWrap, countEl);
    chart.appendChild(row);
  });

  section.appendChild(chart);
}
```

- [ ] **Step 2: 타입체크**

```bash
npx tsc --noEmit
```

Expected: 에러 없음

- [ ] **Step 3: 전체 테스트 실행**

```bash
npx vitest run
```

Expected: 전체 통과

- [ ] **Step 4: 커밋**

```bash
git add src/collector/index.ts
git commit -m "feat(collector): render top-30 keyword chart from collected texts"
```

---

## Task 5: CSS 스타일 추가

**Files:**
- Modify: `src/collector/style.css`

- [ ] **Step 1: 스타일 추가**

`src/collector/style.css` 끝에 추가:

```css
/* ── Keyword Distribution Section ── */

.keywords-section {
  margin-bottom: 20px;
  padding: 16px;
  background: #16181c;
  border-radius: 12px;
  border: 1px solid #2f3336;
}

.keywords-heading {
  font-size: 15px;
  font-weight: 700;
  color: #e7e9ea;
  margin-bottom: 14px;
}

.keywords-chart {
  display: flex;
  flex-direction: column;
  gap: 5px;
}

.kw-row {
  display: grid;
  grid-template-columns: 28px 60px 1fr 42px;
  align-items: center;
  gap: 8px;
}

.kw-rank {
  font-size: 11px;
  color: #536471;
  text-align: right;
}

.kw-label {
  font-size: 13px;
  color: #e7e9ea;
  font-family: monospace;
  text-align: right;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.kw-bar-wrap {
  background: #2f3336;
  border-radius: 3px;
  height: 8px;
  overflow: hidden;
}

.kw-bar {
  height: 100%;
  background: #1d9bf0;
  border-radius: 3px;
  transition: width 0.3s ease;
  min-width: 2px;
}

.kw-count {
  font-size: 11px;
  color: #71767b;
  text-align: right;
  font-variant-numeric: tabular-nums;
}
```

- [ ] **Step 2: 전체 테스트 + 타입체크**

```bash
npx vitest run && npx tsc --noEmit
```

Expected: 에러 없음

- [ ] **Step 3: 커밋**

```bash
git add src/collector/style.css
git commit -m "style(collector): add keyword distribution chart styles"
```
