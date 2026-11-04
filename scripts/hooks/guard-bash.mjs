#!/usr/bin/env node
// PreToolUse(Bash) 훅: 스토어 제출·main 푸시처럼 사용자가 직접 할 명령을 막는다 (AGENTS.md SAFE-4·SAFE-5).
// 막으면 종료 코드 2와 이유(stderr)를 낸다. 모르는 명령은 통과시킨다 — 훅은 센서이고 경계는 CI·권한이다(HAR-8).
import { readFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';

const RELEASE_TAG = /(^|\s|:|refs\/tags\/)v\d+\.\d+\.\d+(?=\s|$)/;
// git 전역 옵션(-C 경로, -c 키=값, --no-pager) 뒤의 push도 잡는다
const GIT_PUSH = /\bgit(\s+(-[Cc]\s+\S+|--?[\w-]+(=\S+)?))*\s+push\b/;

export const RULES = [
  {
    id: 'release-tag-push',
    test: (cmd) => GIT_PUSH.test(cmd) && RELEASE_TAG.test(cmd),
    reason: '정식 릴리스 태그(v*.*.*) 푸시는 스토어 제출을 일으킵니다(SAFE-4). 사용자가 직접 푸시합니다. 검증용이면 vX.Y.Z-test 태그를 쓰세요.',
  },
  {
    id: 'push-all-tags',
    test: (cmd) => GIT_PUSH.test(cmd) && /\s--(tags|follow-tags|mirror)\b/.test(cmd),
    reason: '--tags·--follow-tags·--mirror는 정식 릴리스 태그까지 올릴 수 있습니다(SAFE-4). 태그는 이름으로 하나씩 푸시하세요.',
  },
  {
    id: 'push-main',
    test: (cmd) => GIT_PUSH.test(cmd) && /(\s|:)(refs\/heads\/)?main(?=\s|$)|\s--all\b/.test(cmd),
    reason: 'main에는 직접 푸시하지 않습니다(SAFE-5). release/* 브랜치에서 PR로 합칩니다(docs/releasing.md).',
  },
  {
    id: 'store-submit',
    test: (cmd) => /\bnpm\s+run\s+submit\b|\bwxt\s+submit\b/.test(cmd),
    reason: '스토어 제출 명령입니다(SAFE-4). 사용자가 직접 실행합니다.',
  },
  {
    id: 'submit-workflow',
    test: (cmd) => /\bgh\s+workflow\s+run\b/.test(cmd) && /submit/i.test(cmd),
    reason: '스토어 제출 워크플로입니다(SAFE-4). 사용자가 Actions에서 직접 실행합니다.',
  },
  {
    id: 'release-create',
    test: (cmd) => /\bgh\s+release\s+create\b/.test(cmd) && RELEASE_TAG.test(cmd),
    reason: '정식 버전 릴리스를 만들면 태그가 생겨 스토어 제출이 돌 수 있습니다(SAFE-4). 사용자가 직접 합니다.',
  },
];

// 명령마다 따로 본다. 뒤에 이어진 `git log main` 같은 조회 때문에 앞의 push를 막지 않는다.
// 따옴표는 지운다("v1.8.2"도 태그다)
export function findViolation(command) {
  for (const segment of command.replace(/["']/g, '').split(/&&|\|\||[;|\n]/)) {
    const rule = RULES.find((candidate) => candidate.test(segment));
    if (rule) return rule;
  }
  return null;
}

function main() {
  let command = '';
  try {
    command = JSON.parse(readFileSync(0, 'utf8'))?.tool_input?.command ?? '';
  } catch {
    process.exit(0);
  }
  const violation = findViolation(command);
  if (!violation) process.exit(0);
  process.stderr.write(`[guard-bash:${violation.id}] ${violation.reason}\n`);
  process.exit(2);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) main();
