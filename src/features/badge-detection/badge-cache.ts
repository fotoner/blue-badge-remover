const MAX_CACHE_SIZE = 10000;

export class BadgeCache {
  private cache = new Map<string, boolean>();

  get(userId: string): boolean | undefined {
    return this.cache.get(userId);
  }

  set(userId: string, isFadak: boolean): void {
    if (this.cache.size >= MAX_CACHE_SIZE) {
      const firstKey = this.cache.keys().next().value;
      if (firstKey !== undefined) this.cache.delete(firstKey);
    }
    this.cache.set(userId, isFadak);
  }

  has(userId: string): boolean {
    return this.cache.has(userId);
  }
}
