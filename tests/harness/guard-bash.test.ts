import { spawnSync } from 'node:child_process';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

// PreToolUse(Bash) 훅 — 스토어 제출·main 푸시를 막고 나머지는 통과시킨다 (AGENTS.md SAFE-4·SAFE-5, HAR-8)
const HOOK = resolve(process.cwd(), 'scripts/hooks/guard-bash.mjs');

function runHook(command: string): { status: number | null; stderr: string } {
  const result = spawnSync('node', [HOOK], { input: JSON.stringify({ tool_name: 'Bash', tool_input: { command } }), encoding: 'utf8' });
  return { status: result.status, stderr: result.stderr };
}

describe('guard-bash 훅', () => {
  it.each([
    ['git push origin v1.8.2', 'release-tag-push'],
    ['git push origin refs/tags/v1.9.0', 'release-tag-push'],
    ['cd repo && git push -q origin v2.0.0 && echo done', 'release-tag-push'],
    ['git push --follow-tags origin release/v1.8.2', 'push-all-tags'],
    ['git push origin --tags', 'push-all-tags'],
    ['git push origin main', 'push-main'],
    ['git push origin HEAD:main', 'push-main'],
    ['npm run submit', 'store-submit'],
    ['npx wxt submit --chrome-zip x.zip', 'store-submit'],
    ['gh workflow run submit-store.yml -f store=chrome -f tag=v1.8.2', 'submit-workflow'],
    ['gh release create v1.8.2 release/*.zip', 'release-create'],
  ])('막는다: %s', (command, id) => {
    const { status, stderr } = runHook(command);
    expect(status).toBe(2);
    expect(stderr).toContain(`[guard-bash:${id}]`);
  });

  it.each([
    'git push origin v1.8.2-test',
    'git push -u origin release/v1.8.2',
    'git push -u origin feat/121-reload-toast',
    'git push origin fix/main-menu-label',
    'git tag -a v1.8.2 -m "release"',
    'gh release view v1.8.2-test',
    'gh release create v1.8.2-test --prerelease',
    'npm run build:chrome',
    'gh workflow list',
    'git log --oneline origin/main',
  ])('통과시킨다: %s', (command) => {
    expect(runHook(command).status).toBe(0);
  });

  it('입력이 JSON이 아니면 통과시킨다', () => {
    const result = spawnSync('node', [HOOK], { input: 'not json', encoding: 'utf8' });
    expect(result.status).toBe(0);
  });
});
