# 내장 필터 ON/OFF 토글 설계

**날짜**: 2026-03-30
**범위**: 고급 필터 설정 페이지 (options)

## 요구사항

고급 필터 설정 페이지에서 내장 필터(DEFAULT_FILTER_LIST) 적용 여부를 ON/OFF 토글로 제어할 수 있어야 한다.

## 변경 파일 목록

1. `src/shared/types/index.ts` — `Settings`에 `defaultFilterEnabled` 필드 추가
2. `src/shared/constants/index.ts` — `DEFAULT_SETTINGS`에 `defaultFilterEnabled: true` 추가
3. `src/options/index.html` — "내장 필터" 섹션 `<h2>`에 토글 추가
4. `src/options/index.ts` — 토글 저장/로드 로직 추가
5. `src/content/index.ts` — `loadFilterRules()`에서 설정값 반영, `listenForSettingsChanges()`에서 `defaultFilterEnabled` 변경 감지

## 설계 세부사항

### 타입 변경

```ts
// src/shared/types/index.ts
export interface Settings {
  // ... 기존 필드
  defaultFilterEnabled: boolean;  // 추가
}
```

### 기본값

```ts
// src/shared/constants/index.ts
export const DEFAULT_SETTINGS: Settings = {
  // ... 기존 필드
  defaultFilterEnabled: true,  // 추가 — 기존 동작 유지
};
```

### options/index.html 변경

"내장 필터" 섹션의 `<h2>` 행에 토글 추가:

```html
<section class="section">
  <div class="section-header">
    <h2>📋 내장 필터 <span class="readonly-badge">읽기 전용</span></h2>
    <label class="toggle-row">
      <span>사용</span>
      <input type="checkbox" id="default-filter-enabled" checked>
    </label>
  </div>
  <textarea id="builtin-filters" class="filter-textarea" readonly></textarea>
</section>
```

### options/index.ts 변경

- `init()` 시 `getSettings()`로 `defaultFilterEnabled` 로드 → 체크박스 초기화
- 체크박스 `change` 이벤트 → `saveSettings({ ...settings, defaultFilterEnabled })` 저장
- rule-stats 업데이트 시 `defaultFilterEnabled` 반영

### content/index.ts 변경

**`loadFilterRules()` 수정:**

```ts
async function loadFilterRules(): Promise<void> {
  const custom = await getCustomFilterList();
  const base = currentSettings.defaultFilterEnabled ? DEFAULT_FILTER_LIST + '\n' : '';
  activeFilterRules = parseFilterList(base + custom);
}
```

**`listenForSettingsChanges()` 수정:**

기존에 `keywordFilterEnabled` 변경 시 트윗 재처리를 하는 로직에 `defaultFilterEnabled` 변경도 감지하여 `loadFilterRules()` + 재처리 추가:

```ts
const filterRulesChanged =
  prev.defaultFilterEnabled !== currentSettings.defaultFilterEnabled;
if (filterRulesChanged) {
  void loadFilterRules().then(() => {
    restoreHiddenTweets();
    reprocessExistingTweets();
  });
}
```

## 동작 흐름

```
options 토글 ON/OFF
  → saveSettings() → chrome.storage 저장
    → content script storage.onChanged 수신
      → currentSettings 업데이트
        → loadFilterRules() 재실행
          → DEFAULT_FILTER_LIST 포함 여부 결정
            → restoreHiddenTweets() + reprocessExistingTweets()
```

## 하위 호환성

- `DEFAULT_SETTINGS.defaultFilterEnabled = true`이므로 기존 유저는 설정 변경 없이 현재 동작 유지
- `getSettings()`는 `{ ...DEFAULT_SETTINGS, ...stored }`로 병합하므로 필드 누락 시 자동으로 `true` 적용

## 테스트 포인트

- `defaultFilterEnabled: true`일 때 내장 필터 키워드가 매칭되는지
- `defaultFilterEnabled: false`일 때 내장 필터 키워드가 무시되는지
- 커스텀 필터는 설정값과 무관하게 항상 적용되는지
- 토글 변경 시 실시간으로 트윗 재처리가 일어나는지
