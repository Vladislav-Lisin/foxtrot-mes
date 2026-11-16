export function reconnectDelayMs(
  attempt: number,
  random: () => number = Math.random,
  baseMs = 1_000,
  maxMs = 30_000,
): number {
  const exponent = Math.max(0, Math.floor(attempt));
  const baseDelay = Math.min(maxMs, baseMs * (2 ** exponent));
  const jitter = 0.5 + Math.min(1, Math.max(0, random())) * 0.5;
  return Math.round(baseDelay * jitter);
}
