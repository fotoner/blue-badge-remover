@AGENTS.md

# Claude Code
<!-- 늘 실리는 맥락이다. Claude 전용 몇 줄만 둔다. 나머지는 AGENTS.md(모든 에이전트), .claude/rules(경로별), .claude/skills(절차)에 둔다. 훅·권한은 .claude/settings.json과 scripts/hooks/. 개인 설정은 CLAUDE.local.md와 .claude/settings.local.json(둘 다 gitignore)에 둔다. -->
- 파일을 많이 읽는 일은 서브에이전트에 맡기고 결론만 가져온다.
- 머지 전 리뷰를 `.claude/agents/reviewer.md`에 맡길 수 있다. 작성자와 다른 모델의 리뷰를 대신하지는 않는다.
- 긴 명령은 출력을 파일로 받고(`> /tmp/<이름>.log 2>&1`) 요약만 읽는다.
- 완료 보고는 짧게 이 순서로 쓴다. 1. 바꾼 것 2. 확인한 것(실행한 명령과 결과 수치) 3. 남은 것(돌리지 않은 검사와 이유, 사용자에게 물을 것)
