#!/usr/bin/env node
// SessionStart(compact) 훅: 대화가 압축된 뒤 AGENTS.md의 "## 안전 불변식" 절을 다시 싣는다 (HAR-2).
// 같은 글을 두 곳에 두지 않으려고 이 스크립트에는 불변식을 적지 않고, AGENTS.md에서 그대로 읽는다.
import { readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const HEADING = '## 안전 불변식';

export function extractSafety(agents) {
  const start = agents.indexOf(`\n${HEADING}\n`);
  if (start < 0) return null;
  const rest = agents.slice(start + 1);
  const end = rest.indexOf('\n## ', HEADING.length);
  return (end < 0 ? rest : rest.slice(0, end)).trim();
}

function main() {
  const root = process.env.CLAUDE_PROJECT_DIR ?? resolve(dirname(fileURLToPath(import.meta.url)), '../..');
  try {
    const section = extractSafety(readFileSync(join(root, 'AGENTS.md'), 'utf8'));
    if (section) process.stdout.write(`대화가 압축됐습니다. 이 저장소의 안전 불변식을 다시 확인합니다.\n\n${section}\n`);
  } catch {
    // AGENTS.md가 없는 브랜치에서는 아무것도 싣지 않는다
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) main();
