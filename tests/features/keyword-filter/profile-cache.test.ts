import { describe, it, expect, beforeEach } from 'vitest';
import { ProfileCache } from '@features/keyword-filter/profile-cache';
import type { ProfileInfo } from '@shared/types';

describe('ProfileCache', () => {
  let cache: ProfileCache;

  beforeEach(() => {
    cache = new ProfileCache();
  });

  it('should return undefined for unknown userId', () => {
    expect(cache.get('unknown')).toBeUndefined();
  });

  it('should store and retrieve a profile', () => {
    const profile: ProfileInfo = { handle: 'testuser', displayName: 'Test', bio: 'hello' };
    cache.set('123', profile);
    expect(cache.get('123')).toEqual(profile);
  });

  it('should evict oldest entry when max size is exceeded', () => {
    const smallCache = new ProfileCache(3);
    smallCache.set('a', { handle: 'a', displayName: '', bio: '' });
    smallCache.set('b', { handle: 'b', displayName: '', bio: '' });
    smallCache.set('c', { handle: 'c', displayName: '', bio: '' });
    smallCache.set('d', { handle: 'd', displayName: '', bio: '' });
    expect(smallCache.get('a')).toBeUndefined();
    expect(smallCache.get('d')).toBeDefined();
  });

  it('should not evict recently accessed entry', () => {
    const smallCache = new ProfileCache(3);
    smallCache.set('a', { handle: 'a', displayName: '', bio: '' });
    smallCache.set('b', { handle: 'b', displayName: '', bio: '' });
    smallCache.set('c', { handle: 'c', displayName: '', bio: '' });
    // Access 'a' to make it recently used
    smallCache.get('a');
    // Adding 'd' should evict 'b' (oldest unused), not 'a'
    smallCache.set('d', { handle: 'd', displayName: '', bio: '' });
    expect(smallCache.get('b')).toBeUndefined();
    expect(smallCache.get('a')).toBeDefined();
    expect(smallCache.get('d')).toBeDefined();
  });

  it('should report has() correctly', () => {
    cache.set('xyz', { handle: 'xyz', displayName: 'X', bio: '' });
    expect(cache.has('xyz')).toBe(true);
    expect(cache.has('other')).toBe(false);
  });
});
