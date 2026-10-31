// Shared handling for the platform's entity rate limit.
//
// A 429 means "pause, then continue" — it is not a permanent failure. Functions
// that fan out several entity reads per call (GPS pings, on-duty unit reads,
// CAD ingestion) used to surface the 429 straight to the caller, which showed up
// as a failed request in the client trace and dropped the work. Waiting for the
// window the platform asks for and retrying once keeps the work and the trace clean.

const DEFAULT_WAIT_MS = 4200;
const MAX_WAIT_MS = 8000;

export function isRateLimitError(error: unknown): boolean {
  const message = String((error as any)?.message || error || '');
  return Number((error as any)?.response?.status || (error as any)?.status) === 429
    || /rate limit|too many requests|\b429\b/i.test(message);
}

// The API states the wait ("Retry after 4s"); honour it instead of guessing.
export function rateLimitWaitMillis(error: unknown): number {
  const message = String((error as any)?.message || error || '');
  const stated = Number(message.match(/retry after (\d+)\s*s/i)?.[1]);
  if (Number.isFinite(stated) && stated > 0) return Math.min(MAX_WAIT_MS, stated * 1000 + 300);
  return DEFAULT_WAIT_MS;
}

const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

export async function withRateLimitRetry<T>(
  operation: () => Promise<T>,
  options: { attempts?: number; label?: string } = {},
): Promise<T> {
  const attempts = Math.max(1, options.attempts || 2);
  let lastError: unknown = null;
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    try {
      return await operation();
    } catch (error) {
      lastError = error;
      if (!isRateLimitError(error) || attempt === attempts - 1) break;
      if (options.label) {
        console.warn(`${options.label} was throttled; pausing before retry`, String((error as any)?.message || error));
      }
      await delay(rateLimitWaitMillis(error));
    }
  }
  throw lastError;
}