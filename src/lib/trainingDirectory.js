import { base44 } from '@/api/base44Client';

let cache = null;
let cacheAt = 0;
const TTL_MS = 15000;

export async function listTrainingUsers(force = false) {
  if (!force && cache && Date.now() - cacheAt < TTL_MS) return cache;
  const result = await base44.functions.invoke('getTrainingUsers', {});
  const payload = result?.data || result || {};
  if (payload.error) throw new Error(payload.error);
  cache = Array.isArray(payload.users) ? payload.users : [];
  cacheAt = Date.now();
  return cache;
}

export function invalidateTrainingUsers() {
  cache = null;
  cacheAt = 0;
}
