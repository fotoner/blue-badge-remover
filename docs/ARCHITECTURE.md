# 아키텍처

## 아키텍처 패턴

Feature-Based Architecture

## 구조

기능(feature) 단위로 코드를 분리하고, Chrome 컴포넌트(background/content/popup)는 진입점 역할만 수행한다.
각 feature는 독립적으로 개발·테스트 가능하며, feature 간 의존은 shared 레이어를 통해서만 허용한다.

```
background/ (Service Worker) ─┐
content/   (Content Script)  ─┼→ features/ ─→ shared/
popup/     (Popup UI)        ─┘
```

## 의존성 규칙

### 불변 원칙 (모든 아키텍처 패턴에 공통)

1. **단방향 의존성**: 정의된 의존성 방향만 허용. 역방향 의존성 금지
2. **경계 검증**: 시스템 경계(API 응답, 파일 파싱, 사용자 입력)에서 반드시 데이터 검증
3. **동일 레이어/모듈 간 참조 허용**: 같은 수준의 모듈끼리는 상호 참조 가능

### 프로젝트 특화 규칙

4. **Cross-import 금지**: feature 간 직접 import 금지. shared 레이어를 통해서만 공유
5. **Public API**: 각 feature는 `index.ts`를 통해서만 export
6. **Chrome API 격리**: Chrome API 직접 호출은 진입점(background/content/popup) 또는 shared/utils에서만 허용. feature 내부에서는 추상화된 인터페이스 사용
7. **DOM 조작 격리**: DOM 직접 조작은 content/ 진입점과 badge-detection, content-filter feature에서만 허용

## 교차 관심사

유틸리티 모듈은 모든 레이어/모듈에서 임포트 가능:
- 로거 — 구조화된 로깅
- HTTP 클라이언트 — 재시도 로직 포함 (필요 시)

## 데이터 흐름

```
[X 웹페이지 DOM] → Content Script → badge-detection (뱃지 감지)
                                         ↓
                                   content-filter (숨김 판정)
                                         ↓
                              follow-list (팔로우/화이트리스트 조회)
                                         ↓
                                   settings (사용자 설정 조회)
                                         ↓
                              [DOM 수정: 숨김 or 유지]

[Popup UI] → settings (설정 변경) → Chrome Storage → Content Script (설정 반영)
[Background] → follow-list → X API (팔로우 목록 동기화) → Chrome Storage
```
