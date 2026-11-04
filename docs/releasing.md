# 릴리스

`main`은 릴리스 전용이고 `dev`는 통합 브랜치다. 스토어 자동 제출 설정은 `docs/STORE_SETUP.md`에 있다.

## 정식 릴리스

1. `dev`에서 `release/vX.Y.Z` 브랜치를 딴다.
2. `npm version X.Y.Z --no-git-tag-version`으로 `package.json`·`package-lock.json`의 버전을 올리고, `docs/store/patch-notes-{ko,en,ja}.md`에 패치노트를 쓴다. 커밋 제목: `chore: release vX.Y.Z — 버전 범프 + 패치노트`.
3. **테스트 릴리스**: 그 커밋에 주석 태그 `vX.Y.Z-test`를 달아 푸시한다. `release.yml`이 시험·빌드 뒤 GitHub 사전 릴리스(prerelease)만 만들고 스토어 제출은 건너뛴다. 첨부 ZIP으로 설치·업데이트를 확인한다(스킬 `browser-qa`).
4. `release/vX.Y.Z`를 `main`에 PR로 squash merge한다.
5. **정식 태그**: `main`에서 `vX.Y.Z` 태그를 푸시하면 `release.yml`이 Chrome·Firefox·Edge 스토어에 제출한다. 사용자가 직접 한다(AGENTS.md SAFE-4, 에이전트는 훅이 막는다).
6. **dev 동기화**: squash merge 때문에 `main`과 `dev`의 이력이 갈라진다. `main`→`dev` PR 대신, `dev`에서 딴 브랜치에 릴리스 커밋을 cherry-pick해 PR로 `dev`에 합친다(예: #105).

- 태그와 `package.json` 버전이 다르면(`-test` 접미사는 무시) `release.yml`이 멈춘다.
- 한 스토어만 실패하면 Actions의 "Submit to Store"를 그 스토어만 수동 실행한다. 다시 빌드하지 않고 릴리스에 첨부된 ZIP을 쓴다.
- 권한이 바뀐 릴리스는 Chrome 웹 스토어 개발자 대시보드의 권한 사유(개인정보 보호 관행)도 갱신해야 한다.

## 핫픽스

1. `main`에서 `hotfix/<이슈>-…` 브랜치를 딴다.
2. 고치고 버전을 올린 뒤 `main`에 PR로 합치고 정식 태그를 단다(위 5).
3. 같은 수정을 `dev`에서 딴 브랜치에 cherry-pick해 PR로 `dev`에 합친다(위 6).
