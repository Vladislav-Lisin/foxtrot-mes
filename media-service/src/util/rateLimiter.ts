/**
 * Простой sliding-window лимитер по ключу (userId) - защита сигнального канала от
 * спама (join-room/produce и т.п.), тот же принцип, что CallRateLimiter на Java-стороне.
 */
export class RateLimiter {
  private readonly hits = new Map<string, number[]>();

  constructor(private readonly maxHits: number, private readonly windowMs: number) {}

  allow(key: string): boolean {
    const now = Date.now();
    const timestamps = (this.hits.get(key) ?? []).filter((t) => now - t < this.windowMs);

    if (timestamps.length >= this.maxHits) {
      this.hits.set(key, timestamps);
      return false;
    }

    timestamps.push(now);
    this.hits.set(key, timestamps);
    return true;
  }

  clear(key: string): void {
    this.hits.delete(key);
  }
}
