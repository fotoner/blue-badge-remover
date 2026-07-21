import { browser } from 'wxt/browser';
import { MESSAGE_TYPES, STORAGE_KEYS } from '@shared/constants';

type WhitelistOperation = 'get' | 'add' | 'remove';

export interface WhitelistRequest {
  type: typeof MESSAGE_TYPES.WHITELIST;
  operation: WhitelistOperation;
  handles?: string[];
}

export interface WhitelistResponse {
  whitelist: string[];
}

function normalizeWhitelistEntry(handle: string): string {
  const stripped = handle.trim().replace(/^@+/, '');
  return `@${stripped.toLowerCase()}`;
}

function dedupeNormalized(list: string[]): string[] {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const raw of list) {
    const normalized = normalizeWhitelistEntry(raw);
    if (!seen.has(normalized)) {
      seen.add(normalized);
      result.push(normalized);
    }
  }
  return result;
}

function listsEqual(a: string[], b: string[]): boolean {
  return a.length === b.length && a.every((value, index) => value === b[index]);
}

function isWhitelistRequest(value: unknown): value is WhitelistRequest {
  if (!value || typeof value !== 'object') return false;
  const request = value as Record<string, unknown>;
  if (request['type'] !== MESSAGE_TYPES.WHITELIST) return false;
  if (!['get', 'add', 'remove'].includes(request['operation'] as string)) return false;
  if (request['operation'] === 'get') return request['handles'] === undefined;
  return Array.isArray(request['handles'])
    && request['handles'].length <= 1000
    && request['handles'].every((handle) => typeof handle === 'string');
}

async function readWhitelist(): Promise<string[]> {
  const result = await browser.storage.local.get([STORAGE_KEYS.WHITELIST]);
  const stored = (result[STORAGE_KEYS.WHITELIST] as string[] | undefined) ?? [];
  const normalized = dedupeNormalized(stored);
  if (!listsEqual(stored, normalized)) {
    await browser.storage.local.set({ [STORAGE_KEYS.WHITELIST]: normalized });
  }
  return normalized;
}

async function applyWhitelistRequest(request: WhitelistRequest): Promise<WhitelistResponse> {
  const list = await readWhitelist();
  if (request.operation === 'get') return { whitelist: list };

  const handles = request.handles ?? [];
  const next = request.operation === 'add'
    ? dedupeNormalized([...list, ...handles])
    : list.filter((handle) => !new Set(handles.map(normalizeWhitelistEntry)).has(handle));
  if (!listsEqual(list, next)) {
    await browser.storage.local.set({ [STORAGE_KEYS.WHITELIST]: next });
  }
  return { whitelist: next };
}

let whitelistRequestQueue: Promise<void> = Promise.resolve();

export function handleWhitelistRequest(request: unknown): Promise<WhitelistResponse | undefined> {
  if (!isWhitelistRequest(request)) return Promise.resolve(undefined);
  const run = whitelistRequestQueue.then(() => applyWhitelistRequest(request));
  whitelistRequestQueue = run.then(() => undefined, () => undefined);
  return run;
}
