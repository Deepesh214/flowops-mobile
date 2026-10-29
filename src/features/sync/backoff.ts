/** Bounded backoff schedule: 2s, 5s, 15s, 30s, 60s. */
export const RETRY_DELAYS_MS = [2_000, 5_000, 15_000, 30_000, 60_000] as const;

export const MAX_AUTO_RETRIES = RETRY_DELAYS_MS.length;

/** Delay before attempt number `retryCount` (1-based), or null when exhausted. */
export function retryDelayMs(retryCount: number): number | null {
  if (retryCount < 1 || retryCount > MAX_AUTO_RETRIES) return null;
  return RETRY_DELAYS_MS[retryCount - 1];
}
