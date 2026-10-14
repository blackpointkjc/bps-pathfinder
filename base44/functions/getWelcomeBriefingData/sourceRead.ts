// Coalesce the same source per worker and serve recent successful results when
// temporary API throttling occurs. Do not poison every subsequent source read.
const cache = new Map();
const inflight = new Map();
let tail = Promise.resolve();
let nextStart = 0;
let pausedUntil = 0;
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
export const briefingRetryAt = () => pausedUntil;
const rateLimited = error => Number(error?.response?.status || error?.status) === 429 || /rate limit|too many requests|\b429\b/i.test(String(error?.message || ''));
export async function readBriefingSource(key, loader) {
  const hit = cache.get(key);
  if (hit?.freshUntil > Date.now()) return hit.value;
  if (inflight.has(key)) return inflight.get(key);
  const task = tail.catch(() => {}).then(async () => {
    // If recovery is active, use a recently confirmed value rather than claiming
    // an empty source. For a source without a valid snapshot, retry normally.
    if (pausedUntil > Date.now() && hit?.staleUntil > Date.now()) return hit.value;
    const recoveryWait = Math.max(0, pausedUntil - Date.now());
    if (recoveryWait) await sleep(Math.min(recoveryWait, 15000));
    await sleep(Math.max(0, nextStart - Date.now()));
    nextStart = Date.now() + 650;
    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        const value = await loader();
        cache.set(key, { value, freshUntil: Date.now() + 90000, staleUntil: Date.now() + 10 * 60000 });
        for (const [oldKey, record] of cache) if (record.staleUntil < Date.now()) cache.delete(oldKey);
        if (cache.size > 2000) cache.delete(cache.keys().next().value);
        return value;
      } catch (error) {
        if (!rateLimited(error)) {
          if (hit?.staleUntil > Date.now()) return hit.value;
          throw error;
        }
        const headers = error?.response?.headers;
        const raw = headers?.get?.('retry-after') ?? headers?.['retry-after'];
        const seconds = Number(raw);
        const serverRetryAt = raw ? (Number.isFinite(seconds) ? Date.now() + seconds * 1000 : Date.parse(raw)) : 0;
        const waitMs = Number.isFinite(serverRetryAt) && serverRetryAt > Date.now() ? Math.min(serverRetryAt - Date.now(), 30000) : 3000;
        pausedUntil = Math.max(pausedUntil, Date.now() + waitMs);
        if (hit?.staleUntil > Date.now()) return hit.value;
        if (attempt === 0) await sleep(waitMs);
        else throw error;
      }
    }
  }).finally(() => inflight.delete(key));
  inflight.set(key, task);
  tail = task.catch(() => {});
  return task;
}
