# 코드 리뷰

## 필수 규칙

**squash merge 이전에 반드시 코드 리뷰를 수행한다.** 코드 리뷰 없이 main에 merge하지 않는다.

## 리뷰 시점

| 시점 | 방법 |
|------|------|
| feature 브랜치 완료 후, squash merge 전 | `superpowers:requesting-code-review` 스킬 호출 |

## 리뷰 프로세스

```
1. feature 브랜치에서 구현 + 테스트 완료
2. superpowers:requesting-code-review 스킬로 코드 리뷰 요청
3. 리뷰 결과에서 Critical/Important 이슈 수정
4. 수정 후 재검증 (테스트 통과 확인)
5. squash merge to main
```

## 리뷰 관점

### 공통 (모든 프로젝트)

- **CLAUDE.md 규칙 준수**: 파일/함수 길이 제한, 아키텍처 의존성 방향, 코딩 규칙
- **기존 테스트 보존**: 새 코드 추가 시 기존 테스트가 삭제되지 않았는지 확인
- **타입 안전성**: 느슨한 타입 사용 회피
- **에러 처리**: 배치 작업은 per-record error handling 적용
- **경계 검증**: 외부 데이터에 스키마 검증 적용

### 프로젝트 특화

- **`any` 타입 사용 금지**: 모든 타입은 명시적으로 선언
- **Feature 간 Cross-import 금지**: feature 모듈 간 직접 import가 없는지 확인
- **DOM 셀렉터 안정성**: X UI 변경에 취약한 셀렉터(클래스명 해시 등) 사용 시 주석으로 근거 기록
- **Chrome API 권한 최소화**: manifest.json의 permissions가 실제 사용하는 것만 포함하는지 확인
- **토큰/인증 정보 노출 방지**: 로그, 에러 메시지, storage.sync에 토큰이 포함되지 않는지 확인
- **MutationObserver 정리**: Content Script에서 등록한 observer가 적절히 disconnect되는지 확인

## 리뷰 결과 처리

| 등급 | 조치 |
|------|------|
| Critical | 즉시 수정. merge 불가 |
| Important | merge 전 수정 |
| Suggestion | 다음 스프린트에서 처리 가능 |

## 병렬 워크트리 작업 시

병렬 에이전트가 각각 워크트리에서 작업한 경우, **각 워크트리 브랜치별로 개별 리뷰**한 후 main에 squash merge한다.
