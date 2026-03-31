# Keyword Distribution Section — Design Spec

**Date**: 2026-03-30
**Feature**: Collector 페이지 상단 키워드 분포 Top 30

## Problem

`src/collector/index.html`은 수집된 파딱 계정의 트윗/바이오 텍스트를 나열하기만 한다. 어떤 키워드가 자주 등장하는지 한눈에 파악할 수 없다.

## Goal

페이지 상단에 가로 막대 바 형태로 top 30 키워드와 빈도 분포를 표시한다.

## Layout

```
[header]
[toolbar]

┌── 자주 사용되는 키워드 Top 30 ──────────────────┐
│  1  이  ████████████████████████████  142      │
│  2  는  ██████████████████████        98       │
│  3  의  █████████████████             87       │
│  ...                                           │
└────────────────────────────────────────────────┘

[계정 목록]
```

## Tokenization Rules

| 텍스트 유형 | 토크나이저 | 최소 길이 |
|------------|----------|---------|
| 한국어 완성형 한글 (U+AC00–U+D7A3) | 글자 단위 (1글자 = 1토큰) | 1 |
| 영어 알파벳 연속 | 단어 단위 | 2 |
| 숫자·특수문자·이모지 | 제외 | — |

분석 대상: `tweetTexts` 전체 + `bio` (있을 경우)

## Data Flow

```
CollectedFadak[]
  → 텍스트 수집 (tweetTexts + bio)
  → tokenize() — 한글 글자/영어 단어 분리
  → Map<token, count> 빈도 집계
  → 상위 30개 정렬
  → renderKeywordChart() — DOM 생성
```

## Files Changed

| 파일 | 변경 |
|------|------|
| `src/collector/index.html` | `#keywords` div 추가 (toolbar 아래, list 위) |
| `src/collector/index.ts` | `tokenize()`, `renderKeywords()` 함수 추가; `init()`/storage listener에 호출 추가 |
| `src/collector/style.css` | `.keywords-section`, `.kw-row`, `.kw-label`, `.kw-bar-wrap`, `.kw-bar`, `.kw-count` 스타일 추가 |

## Visual Design

- 다크 테마 유지 (`#000` 배경, `#e7e9ea` 텍스트)
- 바 색상: `#1d9bf0` (X-blue), 너비는 최대 빈도 기준 상대값
- 순위 번호 + 키워드 + 바 + 횟수를 한 행에 표시
- 데이터 없을 때: 섹션 숨김

## Out of Scope

- 불용어(stopword) 필터링 — 한글 조사 등 포함
- 키워드 클릭 시 필터링
- 시계열 추이
