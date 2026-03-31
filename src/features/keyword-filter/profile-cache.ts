import type { ProfileInfo } from '@shared/types';

const DEFAULT_MAX_SIZE = 10000;

export class ProfileCache {
  private cache = new Map<string, ProfileInfo>();
  private readonly maxSize: number;

  constructor(maxSize = DEFAULT_MAX_SIZE) {
    this.maxSize = maxSize;
  }

  get(userId: string): ProfileInfo | undefined {
    const value = this.cache.get(userId);
    if (value !== undefined) {
      // Move to end (most recently used position)
      this.cache.delete(userId);
      this.cache.set(userId, value);
    }
    return value;
  }

  set(userId: string, profile: ProfileInfo): void {
    if (this.cache.size >= this.maxSize) {
      const firstKey = this.cache.keys().next().value;
      if (firstKey !== undefined) this.cache.delete(firstKey);
    }
    this.cache.set(userId, profile);
  }

  has(userId: string): boolean {
    return this.cache.has(userId);
  }
}
