const WINDOW_MS = 60_000;
const MAX_KEYS = 20_000;

export class SlidingWindowLimiter {
  private hits = new Map<string, number[]>();

  constructor(
    private readonly windowMs = WINDOW_MS,
    private readonly max: number,
  ) {}

  allow(key: string, now: number): boolean {
    const cutoff = now - this.windowMs;
    const next = (this.hits.get(key) ?? []).filter((t) => t > cutoff);
    if (next.length >= this.max) {
      this.hits.set(key, next);
      return false;
    }
    next.push(now);
    this.hits.set(key, next);
    if (this.hits.size > MAX_KEYS) this.prune(now);
    return true;
  }

  /** True if `key` already used up the window, without counting a hit. */
  exhausted(key: string, now: number): boolean {
    const cutoff = now - this.windowMs;
    return (this.hits.get(key) ?? []).filter((t) => t > cutoff).length >= this.max;
  }

  prune(now: number): void {
    const cutoff = now - this.windowMs;
    for (const [key, times] of this.hits) {
      const next = times.filter((t) => t > cutoff);
      if (next.length === 0) this.hits.delete(key);
      else this.hits.set(key, next);
    }
  }
}

export type SubmitLimits = {
  ip: SlidingWindowLimiter;
  form: SlidingWindowLimiter;
};

export function createSubmitLimits(): SubmitLimits {
  return {
    ip: new SlidingWindowLimiter(WINDOW_MS, 30),
    form: new SlidingWindowLimiter(WINDOW_MS, 60),
  };
}
