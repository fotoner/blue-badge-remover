# 컨벤션

## 작업 제목 형식

```
[D{도메인}.{번호}][{EARS패턴}] {요구사항 설명}
```

### 도메인 코드

| 코드 | 도메인 |
|------|--------|
| D1 | Badge Detection (뱃지 감지) |
| D2 | Content Filtering (콘텐츠 필터링) |
| D3 | Follow & Whitelist (팔로우 & 화이트리스트) |
| D4 | Settings (설정) |
| D5 | Keyword Filter (키워드 필터) |

### EARS 패턴

| 패턴 | 제목 표기 |
|------|----------|
| Ubiquitous | `[Ubiquitous]` |
| State-driven | `[While]` |
| Event-driven | `[When]` |
| Unwanted | `[If...Then]` |
| Optional | `[Where]` |
| Complex | `[While+When]` |

### 예시

- `[D1.1][When] 트윗 렌더링 시, 파란 뱃지 존재 여부를 감지해야 한다`
- `[D2.1][While] 익스텐션 활성화 상태에서, 수익성 뱃지 계정의 트윗을 숨겨야 한다`
- `[D3.2][When] 화이트리스트에 계정 추가 시, 예외 목록에 저장해야 한다`

## 작업 본문 템플릿

작업은 `docs/cycle/backlog.md`에 ID와 제목으로 등록하고, 상세 내용이 필요하면 별도 이슈 파일을 생성한다. 3가지 템플릿:

### 작업 (기본)

```
## EARS 요구사항
> [EARS 패턴] 요구사항을 자연어로 기술

## 수용 기준 (Acceptance Criteria)
- [ ] 기준 1
- [ ] 기준 2

## 관련 파일
- `src/...`
- `tests/...`

## 참고
- 관련 스펙: `docs/superpowers/specs/...`
- 의존 작업:
- 비고:
```

### 버그

```
## 버그 설명
> As-is: 현재 동작
> To-be: 기대 동작

## 재현 방법
1.
2.
3.

## 수용 기준 (Acceptance Criteria)
- [ ] 버그가 재현되지 않음
- [ ] 회귀 테스트 추가

## 관련 파일
- `src/...`
- `tests/...`

## 참고
- 에러 로그:
- 스크린샷:
```

### 기능 요청

```
## EARS 요구사항
> [EARS 패턴] 요구사항을 자연어로 기술

## 사용자 시나리오
이 기능으로 해결하려는 문제/시나리오를 설명.

## 수용 기준 (Acceptance Criteria)
- [ ] 기준 1
- [ ] 기준 2

## 기술적 접근
- 구현 방향:
- 대안:

## 관련 파일
- `src/...`
- `tests/...`

## 참고
- 관련 스펙: `docs/superpowers/specs/...`
- 의존 작업:
```

### 본문 작성 규칙

1. **EARS 요구사항**은 반드시 EARS 패턴 키워드로 시작 (When/While/If...Then/Where 또는 생략=Ubiquitous)
2. **수용 기준**은 체크박스로 작성. 작업 완료 판단의 기준이 됨
3. **관련 파일**은 실제 구현/테스트할 파일 경로를 미리 기입 (에이전트가 작업 범위 파악에 활용)
4. 빈 항목은 지우지 말고 비워둠 (템플릿 구조 유지)

## 작업 속성

| 속성 | 규칙 |
|------|------|
| 우선순위 | 높음: 블로커/핵심 기능, 중간: 일반 기능, 낮음: 개선/리서치 |
| 태그 | 개선(리팩토링/품질), 리서치(조사/탐색) |
| 스프린트 | 활성 스프린트에 할당 (백로그는 스프린트 미할당) |

## 커밋 메시지

### Feature 브랜치 내 커밋
브랜치 내 커밋은 squash로 사라지므로 형식에 얽매이지 않아도 됨. 다만 기본 형식 권장:
```
<type>: <description>
```

### Squash commit (main에 통합될 때)
```
<type>: <한 줄 요약>

- [D{n}.{n}] 이슈 설명 1
- [D{n}.{n}] 이슈 설명 2

Co-Authored-By: Claude <noreply@anthropic.com>
```

| type | 용도 |
|------|------|
| `feat` | 새 기능 |
| `fix` | 버그 수정 |
| `docs` | 문서 변경 |
| `test` | 테스트 추가/수정 |
| `refactor` | 기능 변경 없는 코드 개선 |
| `chore` | 빌드/설정 변경 |

- 한국어 또는 영어 모두 허용
- 첫 글자 소문자 (영어), 마침표 없음
- squash commit 제목은 50자 이내, 본문에 포함된 이슈 번호 나열

## 브랜치 전략 (git-flow)

### 주요 브랜치

| 브랜치 | 역할 | 보호 |
|--------|------|------|
| `main` | 릴리스 전용. 태그(v*.*.*) + 웹스토어 배포 | 직접 커밋 금지 |
| `dev` | 일상 개발. PR 머지 대상 (default branch) | 직접 커밋 금지 |

### 작업 브랜치

| type | 분기 원점 | 머지 대상 | 예시 |
|------|----------|----------|------|
| `feat/*` | dev | dev | `feat/search-tools` |
| `fix/*` | dev | dev | `fix/csv-encoding` |
| `refactor/*` | dev | dev | `refactor/db-queries` |
| `docs/*` | dev | dev | `docs/local-dev-guide` |
| `chore/*` | dev | dev | `chore/ci-setup` |
| `release/v*.*.*` | dev | main (→ 태그) | `release/v1.4.0` |
| `hotfix/*` | main | main + dev | `hotfix/critical-bug` |

### 워크플로우

```
일상 개발:
1. dev에서 feature 브랜치 생성
2. 브랜치에서 자유롭게 커밋
3. 작업 완료 후 squash merge → dev
4. feature 브랜치 삭제

릴리스:
1. dev에서 release/v*.*.* 브랜치 생성
2. 버전 범프 커밋
3. squash merge → main
4. main에서 태그 → GitHub Actions 자동 빌드 + 스토어 제출
5. main 변경사항을 dev에 머지 (동기화)

핫픽스:
1. main에서 hotfix/* 브랜치 생성
2. 수정 후 squash merge → main + dev 양쪽
3. 필요 시 패치 태그
```

### 브랜치 단위 (묶음 기준)

**판단 기준**: "이 브랜치의 squash commit 메시지를 한 문장으로 쓸 수 있는가?" — 쓸 수 있으면 적절한 묶음.

### Squash Merge 규칙

- **squash commit 메시지**: `<type>: <한 줄 요약>` + 본문에 이슈 번호 나열
- 브랜치 내 개별 커밋 히스토리는 squash로 사라지므로, 브랜치 내에서는 커밋 메시지 품질에 집착하지 않아도 됨
- main의 히스토리는 squash commit 단위로 깔끔하게 유지

## 코드 리뷰

**squash merge 전 코드 리뷰 필수.** 상세: `docs/CODE_REVIEW.md`

## PR 규칙

- squash merge 전 자기 검토용 PR 생성 **권장**
- PR 없이 로컬 squash merge도 허용 (1인 프로젝트)

## `finishing-a-development-branch` 스킬 오버라이드

이 프로젝트에서 `superpowers:finishing-a-development-branch` 스킬 사용 시 다음 규칙을 적용한다:

**Option 1 (로컬 merge)**: 일반 merge 대신 **squash merge**로 수행. **코드 리뷰 필수**:
```bash
# 1. 코드 리뷰 (superpowers:requesting-code-review)
# 2. Critical/Important 이슈 수정
# 3. squash merge (dev로)
git checkout dev
git pull
git merge --squash <feature-branch>
git commit  # squash commit 메시지 작성
git branch -d <feature-branch>
```

**Option 2 (PR 생성)**: GitHub에서 **Squash and merge** → dev로.

**커밋 메시지**: squash commit 메시지는 위 "Squash Merge 규칙" 형식을 따른다.
