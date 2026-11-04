---
paths:
  - "AGENTS.md"
  - "CLAUDE.md"
  - ".claude/**"
  - "scripts/check.sh"
  - "scripts/check-docs.mjs"
  - "scripts/hooks/**"
  - "scripts/qa/**"
  - ".github/**"
  - "tests/harness/**"
  - "docs/issues.md"
  - "docs/releasing.md"
---

# 지침·검사 스크립트·훅·CI를 고칠 때

에이전트 하네스를 고칠 때 지키는 규칙이다. 리뷰는 규칙을 ID로 가리킨다.

## 지침의 자리
- **HAR-1** `AGENTS.md`는 정본이다. 지도와 불변식만 두고 12KiB 안에 둔다. 사실과 이유는 `docs/`로, 경로별 규칙은 `.claude/rules/`로, 절차는 `.claude/skills/`로 보낸다. `CLAUDE.md`는 `@AGENTS.md`와 Claude 전용 몇 줄만 둔다.
- **HAR-2** 안전 불변식은 `AGENTS.md` 안에서 완결한다. Codex처럼 `AGENTS.md`만 읽는 도구가 있다.
- **HAR-3** 규칙 파일은 frontmatter의 `paths:`로 범위를 정한다. 글롭은 파일 하나 이상에 맞아야 한다. 규칙 ID는 다시 매기지 않는다. 지운 번호는 비워 둔다.
- **HAR-4** 개인 설정은 `CLAUDE.local.md`와 `.claude/settings.local.json`(둘 다 gitignore)에 둔다. 추적하는 `.claude/settings.json`에는 읽기·검사 명령 권한과 훅만 둔다.

## 검사
- **HAR-5** 지침을 바꾸면 `node scripts/check-docs.mjs`를 돌린다. 크기 예산, 경로 실재, 글롭 매칭, frontmatter, 스킬 이름, `@` 임포트, 문서 링크를 본다. 같은 검사가 `tests/harness/`에서 전체 시험 안에 돈다.
- **HAR-6** 같은 교정이 두 번 나오면 문장을 더하지 말고 검사(ESLint 규칙·시험·훅)로 옮긴다. 지침에는 어느 검사가 강제하는지 적는다.
- **HAR-7** `scripts/check.sh --changed`는 조용히 좁히지 않는다. 기준을 못 구하거나 설정·검사 스크립트·CI가 바뀌면 전체로 넓힌다.

## 훅
- **HAR-8** 훅은 실수를 줄이는 센서다. 안전 경계는 CI·권한·코드 시험이다. 훅이 놓친 명령을 알게 되면 시험(`tests/harness/guard-bash.test.ts`)에 먼저 더하고 고친다.
- **HAR-9** 훅 명령은 `[ -f "$f" ] || exit 0` 래퍼로 감싼다. 스크립트가 없는 브랜치에서도 깨지지 않는다. 막을 때는 종료 코드 2와 함께, 사용자가 대신 할 일을 이유에 적는다.

## CI
- **HAR-10** 액션은 커밋 SHA로 고정하고 버전을 주석으로 단다(`uses: …@<sha> # v7.0.1`).
- **HAR-11** 스토어 제출은 `release.yml`이 정식 태그에서만 한다. `-test` 태그는 사전 릴리스만 만든다. 이 조건을 바꾸는 PR은 사용자의 명시 승인을 받는다.
