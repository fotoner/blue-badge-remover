import type { FilterRule } from '@shared/types';

function wildcardToRegExp(pattern: string): RegExp {
  const parts = pattern.split('*').map((part) => part.replace(/[.+?^${}()|[\]\\]/g, '\\$&'));

  let regex = '';

  // Add anchor at start if pattern doesn't start with *
  if (!pattern.startsWith('*')) {
    regex = '^';
  }

  regex += parts.join('.*');

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
