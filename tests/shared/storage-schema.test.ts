import { describe, expect, it } from 'vitest';
import { STORAGE_KEYS } from '@shared/constants';
import type { StorageSchema } from '@shared/types';

const STORAGE_SCHEMA_KEYS = [
  'settings',
  'whitelist',
  'followList',
  'followCache',
  'currentUserId',
  'lastSyncAt',
  'customFilterList',
  'collectedFadaks',
  'disabledFilterCategories',
  'filterPacks',
] as const satisfies readonly (keyof StorageSchema)[];

describe('StorageSchema', () => {
  it('stays in sync with STORAGE_KEYS values', () => {
    expect([...Object.values(STORAGE_KEYS)].sort()).toEqual([...STORAGE_SCHEMA_KEYS].sort());
  });
});
