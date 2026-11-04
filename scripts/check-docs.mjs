#!/usr/bin/env node
// 지침 건강 검사 (.claude/rules/harness.md HAR-1·3·5).
// 지침이 코드와 어긋나는 것이 가장 큰 하네스 부채라서, 크기·경로·글롭·frontmatter·링크를 기계로 본다.
// 사용: node scripts/check-docs.mjs [--root <저장소>]   종료 코드: 0 통과(경고 포함), 1 실패
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { dirname, join, posix, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const AGENTS_WARN_BYTES = 12 * 1024;
const AGENTS_FAIL_BYTES = 16 * 1024;
const SKILL_MAX_LINES = 500;
const SAFETY_HEADING = '## 안전 불변식';
const PATH_ROOTS = ['src/', 'docs/', 'scripts/', 'tests/', 'entrypoints/', 'e2e/', 'public/', '.github/', '.claude/'];
const ROOT_FILES = ['AGENTS.md', 'CLAUDE.md', 'README.md', 'package.json', 'wxt.config.ts', 'eslint.config.js', 'vitest.config.ts', 'playwright.config.ts'];

const rootArg = process.argv.indexOf('--root');
const root = rootArg > 0 ? resolve(process.argv[rootArg + 1]) : resolve(dirname(fileURLToPath(import.meta.url)), '..');
const errors = [];
const warnings = [];

const repoFiles = execFileSync('git', ['ls-files', '--cached', '--others', '--exclude-standard'], { cwd: root, encoding: 'utf8' })
  .split('\n').filter((file) => file && existsSync(join(root, file)));

function read(file) {
  return readFileSync(join(root, file), 'utf8');
}

/** 글롭(**, *, ?, {a,b})을 정규식으로 — 의존성 없이 git 파일 목록에 맞춰 본다 */
function globToRegExp(glob) {
  let out = '';
  for (let i = 0; i < glob.length; i++) {
    const ch = glob[i];
    if (ch === '*' && glob[i + 1] === '*') {
      out += glob[i + 2] === '/' ? '(?:.*/)?' : '.*';
      i += glob[i + 2] === '/' ? 2 : 1;
    } else if (ch === '*') out += '[^/]*';
    else if (ch === '?') out += '[^/]';
    else if (ch === '{') out += '(?:';
    else if (ch === '}') out += ')';
    else if (ch === ',') out += '|';
    else out += ch.replace(/[.+^$()|[\]\\]/g, '\\$&');
  }
  return new RegExp(`^${out}$`);
}

/** 일부러 저장소에 두지 않는 개인 파일(CLAUDE.local.md 등)은 gitignore로 판단한다 */
function isIgnored(path) {
  try {
    execFileSync('git', ['check-ignore', '-q', path], { cwd: root });
    return true;
  } catch {
    return false;
  }
}

function pathExists(path) {
  const clean = path.replace(/\/$/, '');
  if (isIgnored(clean)) return true;
  if (/[*?{]/.test(clean)) {
    const re = globToRegExp(clean);
    return repoFiles.some((file) => re.test(file));
  }
  return repoFiles.some((file) => file === clean || file.startsWith(`${clean}/`));
}

function frontmatter(text) {
  const match = text.match(/^---\n([\s\S]*?)\n---\n/);
  if (!match) return null;
  const fields = {};
  let listKey = null;
  for (const line of match[1].split('\n')) {
    const item = line.match(/^\s+-\s+"?([^"]+)"?\s*$/);
    if (item && listKey) { fields[listKey].push(item[1]); continue; }
    const pair = line.match(/^([\w-]+):\s*(.*)$/);
    if (!pair) continue;
    listKey = pair[2] === '' ? pair[1] : null;
    fields[pair[1]] = pair[2] === '' ? [] : pair[2].replace(/^"|"$/g, '');
  }
  return fields;
}

/** 지침 속 `경로`가 저장소에 있는지 — <자리표시자>·명령·URL은 건너뛴다 */
function checkCodePaths(file) {
  for (const [, token] of read(file).matchAll(/`([^`\s]+)`/g)) {
    const path = token.replace(/[),.:;]+$/, '').replace(/\(#\d+\)$/, '');
    const looksLikePath = PATH_ROOTS.some((prefix) => path.startsWith(prefix)) || ROOT_FILES.includes(path);
    if (!looksLikePath || /[<>…|]/.test(path)) continue;
    if (!pathExists(path)) errors.push(`${file}: \`${path}\`가 저장소에 없습니다`);
  }
}

function checkLinks(file) {
  for (const [, target] of read(file).matchAll(/\]\(([^)\s]+)\)/g)) {
    if (/^(https?:|mailto:|#)/.test(target)) continue;
    const path = posix.normalize(posix.join(posix.dirname(file), target.split('#')[0]));
    if (!pathExists(path)) errors.push(`${file}: 링크 ${target}의 대상이 없습니다`);
  }
}

function checkAgentsFiles() {
  if (!existsSync(join(root, 'AGENTS.md'))) { errors.push('AGENTS.md가 없습니다'); return; }
  const size = statSync(join(root, 'AGENTS.md')).size;
  if (size > AGENTS_FAIL_BYTES) errors.push(`AGENTS.md ${size}B — 상한 ${AGENTS_FAIL_BYTES}B를 넘었습니다`);
  else if (size > AGENTS_WARN_BYTES) warnings.push(`AGENTS.md ${size}B — 예산 ${AGENTS_WARN_BYTES}B를 넘었습니다`);
  if (!read('AGENTS.md').includes(`\n${SAFETY_HEADING}\n`)) errors.push(`AGENTS.md에 "${SAFETY_HEADING}" 절이 없습니다(압축 뒤 재주입 훅이 찾는다)`);
  if (!existsSync(join(root, 'CLAUDE.md'))) return;
  const claude = read('CLAUDE.md');
  if (claude.trim().split('\n')[0] !== '@AGENTS.md') errors.push('CLAUDE.md 첫 줄은 @AGENTS.md여야 합니다');
  for (const [, target] of claude.matchAll(/^@(\S+)/gm)) {
    if (!existsSync(join(root, target))) errors.push(`CLAUDE.md: @${target}가 없습니다`);
  }
}

function listDir(dir) {
  return existsSync(join(root, dir)) ? readdirSync(join(root, dir)) : [];
}

function checkRules() {
  for (const name of listDir('.claude/rules').filter((n) => n.endsWith('.md'))) {
    const file = `.claude/rules/${name}`;
    const fm = frontmatter(read(file));
    if (!fm || !Array.isArray(fm.paths) || fm.paths.length === 0) { errors.push(`${file}: frontmatter에 paths 목록이 없습니다(없으면 늘 실린다)`); continue; }
    for (const glob of fm.paths) if (!pathExists(glob)) errors.push(`${file}: paths "${glob}"에 맞는 파일이 없습니다`);
  }
}

function checkSkillsAndAgents() {
  for (const name of listDir('.claude/skills')) {
    const file = `.claude/skills/${name}/SKILL.md`;
    if (!existsSync(join(root, file))) { errors.push(`${file}가 없습니다`); continue; }
    const text = read(file);
    const fm = frontmatter(text);
    if (fm?.name !== name) errors.push(`${file}: name이 폴더 이름(${name})과 다릅니다`);
    if (!fm?.description) errors.push(`${file}: description이 없습니다`);
    if (text.split('\n').length >= SKILL_MAX_LINES) errors.push(`${file}: ${SKILL_MAX_LINES}줄 이상입니다`);
  }
  for (const name of listDir('.claude/agents').filter((n) => n.endsWith('.md'))) {
    const fm = frontmatter(read(`.claude/agents/${name}`));
    if (!fm?.name || !fm?.description) errors.push(`.claude/agents/${name}: name·description이 없습니다`);
  }
}

checkAgentsFiles();
checkRules();
checkSkillsAndAgents();
const guideFiles = repoFiles.filter((file) =>
  ['AGENTS.md', 'CLAUDE.md'].includes(file) || /^\.claude\/(rules\/[^/]+|skills\/[^/]+\/SKILL|agents\/[^/]+)\.md$/.test(file)
  || /^docs\/[^/]+\.md$/.test(file));
for (const file of guideFiles) {
  if (!file.startsWith('docs/')) checkCodePaths(file);
  checkLinks(file);
}

for (const warning of warnings) console.log(`⚠ ${warning}`);
for (const error of errors) console.log(`✘ ${error}`);
if (errors.length > 0) process.exit(1);
console.log(`✓ 지침 검사 통과 (AGENTS.md ${statSync(join(root, 'AGENTS.md')).size}B, 파일 ${guideFiles.length}개)`);
