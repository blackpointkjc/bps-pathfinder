// Per warm worker: serialize background reads, coalesce identical requests,
// reuse successful sections, and stop the whole snapshot on API throttling.
const cache = new Map();
const inflight = new Map();
let tail = Promise.resolve();
let nextStart = 0;
let pausedUntil = 0;
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
export const briefingRetryAt = () => pausedUntil;
export async function readBriefingSource(key, loader) {
  const hit = cache.get(key);
  if (hit && hit.until > Date.now()) return hit.value;
  if (inflight.has(key)) return inflight.get(key);
  const task = tail.catch(() => {}).then(async () => {
    if (pausedUntil > Date.now()) throw Object.assign(new Error('Briefing source recovery pending'), {status:429});
    await sleep(Math.max(0, nextStart - Date.now()));
    nextStart = Date.now() + 350;
    try {
      const value = await loader();
      cache.set(key, {value,until:Date.now() + 90000});
      for (const [oldKey, record] of cache) if (record.until < Date.now()) cache.delete(oldKey);
      if (cache.size > 2000) cache.delete(cache.keys().next().value);
      return value;
    } catch (error) {
      if (Number(error?.response?.status || error?.status) === 429 || /rate limit|too many requests|\b429\b/i.test(String(error?.message))) {
        const headers = error?.response?.headers;
        const raw = headers?.get?.('retry-after') ?? headers?.['retry-after'];
        const seconds = Number(raw);
        const retryAt = raw ? (Number.isFinite(seconds) ? Date.now() + seconds * 1000 : Date.parse(raw)) : 0;
        pausedUntil = Math.max(pausedUntil, Date.now() + 60000, Number.isFinite(retryAt) ? retryAt : 0);
      }
      throw error;
    }
  }).finally(() => inflight.delete(key));
  inflight.set(key, task);
  tail = task.catch(() => {});
  return task;
}
