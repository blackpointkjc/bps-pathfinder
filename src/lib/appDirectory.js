import { base44 } from '@/api/base44Client';

let cache = null;
let cacheAt = 0;
let pending = null;
const TTL_MS = 15_000;

export async function getAppDirectory(force = false) {
  const now = Date.now();
  if (!force && cache && now - cacheAt < TTL_MS) return cache;
  if (pending) return pending;
  pending = base44.functions.invoke('getAppDirectory', {}).then(result => {
    const payload = result?.data || result || {};
    if (payload.error) throw new Error(payload.error);
    cache = {
      users: Array.isArray(payload.users) ? payload.users : [],
      locations: Array.isArray(payload.locations) ? payload.locations : [],
      divisions: Array.isArray(payload.divisions) ? payload.divisions : [],
      meta: payload.meta || {},
    };
    cacheAt = Date.now();
    return cache;
  }).finally(() => { pending = null; });
  return pending;
}

export function invalidateAppDirectory() {
  cache = null;
  cacheAt = 0;
}

function sortRows(rows, sort) {
  if (!sort || !Array.isArray(rows)) return rows || [];
  const desc = String(sort).startsWith('-');
  const field = desc ? String(sort).slice(1) : String(sort);
  return [...rows].sort((a, b) => {
    const av = a?.[field] ?? '';
    const bv = b?.[field] ?? '';
    const cmp = String(av).localeCompare(String(bv), undefined, { numeric: true, sensitivity: 'base' });
    return desc ? -cmp : cmp;
  });
}

function matchesQuery(row, query = {}) {
  return Object.entries(query || {}).every(([key, expected]) => {
    const actual = row?.[key];
    if (expected && typeof expected === 'object' && !Array.isArray(expected)) {
      if ('$in' in expected) return Array.isArray(expected.$in) && expected.$in.includes(actual);
      if ('$nin' in expected) return Array.isArray(expected.$nin) && !expected.$nin.includes(actual);
      if ('$ne' in expected) return actual !== expected.$ne;
      if ('$exists' in expected) return expected.$exists ? actual !== undefined && actual !== null : actual === undefined || actual === null;
      return true;
    }
    return actual === expected;
  });
}

async function listBucket(bucket, sort, limit) {
  const directory = await getAppDirectory();
  let rows = sortRows(directory[bucket] || [], sort);
  if (Number(limit) > 0) rows = rows.slice(0, Number(limit));
  return rows;
}

async function filterBucket(bucket, query = {}, sort, limit) {
  const directory = await getAppDirectory();
  let rows = (directory[bucket] || []).filter(row => matchesQuery(row, query));
  rows = sortRows(rows, sort);
  if (Number(limit) > 0) rows = rows.slice(0, Number(limit));
  return rows;
}

export const listDirectoryUsers = (sort, limit) => listBucket('users', sort, limit);
export const filterDirectoryUsers = (query, sort, limit) => filterBucket('users', query, sort, limit);
export const listDirectoryLocations = (sort, limit) => listBucket('locations', sort, limit);
export const filterDirectoryLocations = (query, sort, limit) => filterBucket('locations', query, sort, limit);
export const listDirectoryDivisions = (sort, limit) => listBucket('divisions', sort, limit);
export const filterDirectoryDivisions = (query, sort, limit) => filterBucket('divisions', query, sort, limit);
