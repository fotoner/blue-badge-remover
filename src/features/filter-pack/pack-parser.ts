import type { FilterPack } from '@shared/types';

const DEFAULT_VERSION = '1.0.0';

function recordFrom(value: unknown): Record<string, unknown> {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error('Invalid pack format: expected object');
  }
  return value as Record<string, unknown>;
}

function stringField(record: Record<string, unknown>, key: string, maxLength: number, fallback = ''): string {
  const value = record[key];
  if (typeof value !== 'string') return fallback;
  return value.slice(0, maxLength);
}

export function parseFilterPack(value: unknown, now = () => new Date().toISOString()): FilterPack {
  const record = recordFrom(value);
  if (!record['id'] || !record['name'] || typeof record['rules'] !== 'string') {
    throw new Error('Invalid pack format: expected JSON with id, name, rules fields');
  }

  const homepage = stringField(record, 'homepage', 500);

  return {
    id: String(record['id']),
    name: String(record['name']).slice(0, 100),
    description: stringField(record, 'description', 500),
    author: stringField(record, 'author', 100),
    version: stringField(record, 'version', 20, DEFAULT_VERSION),
    updatedAt: stringField(record, 'updatedAt', 100, now()),
    rules: record['rules'],
    category: stringField(record, 'category', 50) || undefined,
    homepage: homepage.startsWith('https://') ? homepage : undefined,
  };
}

export function parseFilterPackJson(text: string, now?: () => string): FilterPack {
  return parseFilterPack(JSON.parse(text) as unknown, now);
}
