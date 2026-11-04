import { execFileSync, spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';

// 지침 건강 검사 — 이 저장소의 지침이 코드와 어긋나지 않는지 전체 시험 안에서 본다 (HAR-5)
const SCRIPT = resolve(process.cwd(), 'scripts/check-docs.mjs');
const SESSION_HOOK = resolve(process.cwd(), 'scripts/hooks/session-safety.mjs');
const temps: string[] = [];

function repoWith(files: Record<string, string>): string {
  const dir = mkdtempSync(join(tmpdir(), 'bbr-check-docs-'));
  temps.push(dir);
  execFileSync('git', ['init', '-q'], { cwd: dir });
  for (const [path, text] of Object.entries(files)) {
    mkdirSync(dirname(join(dir, path)), { recursive: true });
    writeFileSync(join(dir, path), text);
  }
  return dir;
}

afterEach(() => {
  for (const dir of temps.splice(0)) rmSync(dir, { recursive: true, force: true });
});

describe('check-docs', () => {
  it('이 저장소의 지침은 통과한다', () => {
    const result = spawnSync('node', [SCRIPT], { encoding: 'utf8' });
    expect(result.stdout + result.stderr).toContain('✓ 지침 검사 통과');
    expect(result.status).toBe(0);
  });

  it('없는 경로·맞지 않는 글롭·이름이 다른 스킬·빠진 절을 잡는다', () => {
    const dir = repoWith({
      'AGENTS.md': '# AGENTS\n\n`src/missing.ts`를 본다.\n',
      'CLAUDE.md': '# 첫 줄이 임포트가 아님\n',
      'src/real.ts': 'export {};\n',
      '.claude/rules/x.md': '---\npaths:\n  - "lib/**"\n---\n# x\n',
      '.claude/skills/qa/SKILL.md': '---\nname: other\ndescription: 설명\n---\n',
    });
    const result = spawnSync('node', [SCRIPT, '--root', dir], { encoding: 'utf8' });
    expect(result.status).toBe(1);
    expect(result.stdout).toContain('`src/missing.ts`가 저장소에 없습니다');
    expect(result.stdout).toContain('"## 안전 불변식" 절이 없습니다');
    expect(result.stdout).toContain('CLAUDE.md 첫 줄은 @AGENTS.md여야 합니다');
    expect(result.stdout).toContain('paths "lib/**"에 맞는 파일이 없습니다');
    expect(result.stdout).toContain('name이 폴더 이름(qa)과 다릅니다');
  });
});

describe('session-safety 훅', () => {
  it('압축 뒤 AGENTS.md의 안전 불변식 절만 그대로 싣는다', () => {
    const agents = readFileSync(resolve(process.cwd(), 'AGENTS.md'), 'utf8');
    const result = spawnSync('node', [SESSION_HOOK], { encoding: 'utf8', env: { ...process.env, CLAUDE_PROJECT_DIR: process.cwd() } });
    expect(result.status).toBe(0);
    expect(result.stdout).toContain('## 안전 불변식');
    expect(result.stdout).toContain('**SAFE-1**');
    expect(result.stdout).not.toContain('## 명령');
    const firstRule = agents.split('\n').find((line) => line.startsWith('- **SAFE-1**'));
    expect(firstRule).toBeDefined();
    expect(result.stdout).toContain(firstRule!);
  });
});
