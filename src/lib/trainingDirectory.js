import { base44, clearBase44ReadCacheMatching } from '@/api/base44Client';
let cache = null, cacheAt = 0, pending = null;
export async function listTrainingUsers(force = false) {
  if (pending) return pending;
  if (cache && Date.now() - cacheAt < (force ? 15000 : 120000)) return cache;
  pending = (async () => {
    const result = await base44.functions.invoke('getTrainingUsers', {});
    let payload = result;
    for (let i=0; i<3 && payload?.data; i++) payload = payload.data;
    if (payload?.error || !Array.isArray(payload?.users)) throw new Error(payload?.error || 'Unable to load officer certification records');
    cache = payload.users; cacheAt = Date.now(); return cache;
  })();
  try { return await pending; } finally { pending = null; }
}
export function invalidateTrainingUsers() {
  cache = null; cacheAt = 0;
  clearBase44ReadCacheMatching(key => key.includes('getTrainingUsers'));
}
