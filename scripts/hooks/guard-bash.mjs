#!/usr/bin/env node
// PreToolUse(Bash) 훅: 스토어 제출·main 푸시처럼 사용자가 직접 할 명령을 막는다 (AGENTS.md SAFE-4·SAFE-5).
// 막으면 종료 코드 2와 이유(stderr)를 낸다. 모르는 명령은 통과시킨다 — 훅은 센서이고 경계는 CI·권한이다(HAR-8).
import { readFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';

const RELEASE_TAG = /(^|\s|:|refs\/tags\/)v\d+\.\d+\.\d+(?=\s|$|;|&|\|)/;

export const RULES = [
  {
    id: 'release-tag-push',
    test: (cmd) => /\bgit\s+push\b/.test(cmd) && RELEASE_TAG.test(cmd),
    reason: '정식 릴리스 태그(v*.*.*) 푸시는 스토어 제출을 일으킵니다(SAFE-4). 사용자가 직접 푸시합니다. 검증용이면 vX.Y.Z-test 태그를 쓰세요.',
  },
  {
    id: 'push-all-tags',
    test: (cmd) => /\bgit\s+push\b/.test(cmd) && /\s--(tags|follow-tags)\b/.test(cmd),
    reason: '--tags·--follow-tags는 정식 릴리스 태그까지 올릴 수 있습니다(SAFE-4). 태그는 이름으로 하나씩 푸시하세요.',
  },
  {
    id: 'push-main',
    test: (cmd) => /\bgit\s+push\b/.test(cmd) && /(\s|:)(refs\/heads\/)?main(?=\s|$|;|&|\|)/.test(cmd),
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

export function findViolation(command) {
  return RULES.find((rule) => rule.test(command)) ?? null;
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
