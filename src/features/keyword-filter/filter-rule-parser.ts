import type { FilterRule } from '@shared/types';

const MAX_WILDCARDS = 5;

function wildcardToRegExp(pattern: string): RegExp {
  const parts = pattern.split('*');
  // wildcard 과다 시 backtracking 방지 — 초과분은 리터럴로 취급
  if (parts.length - 1 > MAX_WILDCARDS) {
    const escaped = pattern.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    return new RegExp(escaped, 'i');
  }
  const escapedParts = parts.map((part) => part.replace(/[.+?^${}()|[\]\\]/g, '\\$&'));

  let regex = '';

  // Add anchor at start if pattern doesn't start with *
  if (!pattern.startsWith('*')) {
    regex = '^';
  }

  regex += escapedParts.join('.*');

  // Add anchor at end if pattern doesn't end with *
  if (!pattern.endsWith('*')) {
    regex += '$';
  }

  return new RegExp(regex, 'i');
}

export function parseFilterList(text: string): FilterRule[] {
  const rules: FilterRule[] = [];

  for (const rawLine of text.split('\n')) {
    const line = rawLine.trim();
    if (!line || line.startsWith('!')) continue;

    if (line.startsWith('@@')) {
      rules.push({ type: 'exception', handle: line.slice(2).trim() });
    } else if (line.includes('*')) {
      rules.push({ type: 'wildcard', pattern: wildcardToRegExp(line), original: line });
    } else {
      rules.push({ type: 'keyword', value: line });
    }
  }

  return rules;
}
