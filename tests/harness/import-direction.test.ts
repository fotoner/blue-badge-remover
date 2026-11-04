// @vitest-environment node
import { ESLint } from 'eslint';
import { describe, expect, it } from 'vitest';

// 의존성 방향(AGENTS.md "구조")을 eslint.config.js의 no-restricted-imports가 실제로 막는지 본다
const eslint = new ESLint({ cwd: process.cwd() });

async function restricted(filePath: string, source: string): Promise<boolean> {
  const results = await eslint.lintText(`import '${source}';\nexport {};\n`, { filePath });
  return results.some((result) => result.messages.some((message) => message.ruleId === 'no-restricted-imports'));
}

describe('의존성 방향', () => {
  it.each([
    ['src/features/stats/probe.ts', '../settings/index'],
    ['src/features/stats/probe.ts', '@features/settings'],
    ['src/injected/probe.ts', '../popup/index'],
    ['src/injected/probe.ts', '@features/stats'],
    ['src/injected/probe.ts', 'wxt/browser'],
    ['src/shared/utils/probe.ts', '../../features/stats'],
  ])('막는다: %s → %s', async (filePath, source) => {
    expect(await restricted(filePath, source)).toBe(true);
  });

  it.each([
    ['src/features/stats/probe.ts', './index'],
    ['src/features/stats/probe.ts', '@shared/constants'],
    ['src/injected/probe.ts', './data-extractors'],
    ['src/content/probe.ts', '@features/stats'],
  ])('통과시킨다: %s → %s', async (filePath, source) => {
    expect(await restricted(filePath, source)).toBe(false);
  });
});
