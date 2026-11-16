// Bounded single-process fixed-window limiter. Unknown keys fail closed at capacity.
export function attemptLimiter(limit: number, windowMs = 15 * 60 * 1000, now = Date.now) {
  const attempts = new Map<string, { count: number; until: number }>();
  return (key: string): number => {
    const time = now();
    for (const [entry, value] of attempts) if (value.until <= time) attempts.delete(entry);
    const item = attempts.get(key) ?? { count: 0, until: time + windowMs };
    if (item.count >= limit || (!attempts.has(key) && attempts.size >= 10000)) return Math.max(1, Math.ceil((item.until - time) / 1000));
    item.count++;
    attempts.set(key, item);
    return 0;
  };
}
