import { base44 } from '@/api/base44Client';

let cache = null;
let cacheAt = 0;
let pending = null;
let officerCache = null;
let officerCacheAt = 0;
let officerPending = null;
const TTL_MS = 15_000;

const normalizedIdentity = value => String(value || '').trim().toLowerCase();

export function directoryUserEmails(user) {
  return [...new Set([
    user?.email,
    user?.work_email,
    user?.pathfinder_email,
    user?.microsoft_email,
    user?.outlook_email,
    ...(Array.isArray(user?.email_aliases) ? user.email_aliases : []),
  ].map(normalizedIdentity).filter(Boolean))];
}

export function directoryUserMatches(user, reference) {
  if (!user || reference === undefined || reference === null) return false;
  const value = String(reference).trim();
  if (value && String(user.id || '') === value) return true;
  const normalized = normalizedIdentity(value);
  return Boolean(normalized && directoryUserEmails(user).includes(normalized));
}

export function findDirectoryUser(users, ...references) {
  const list = Array.isArray(users) ? users : [];
  return list.find(user => references.some(reference => directoryUserMatches(user, reference))) || null;
}

export function primaryDirectoryEmail(user) {
  return normalizedIdentity(user?.work_email || user?.pathfinder_email || user?.email);
}

export function directoryEmailLabel(user) {
  const work = primaryDirectoryEmail(user);
  const microsoft = normalizedIdentity(user?.microsoft_email || user?.outlook_email);
  return microsoft && microsoft !== work ? `${work} · Outlook: ${microsoft}` : work;
}

export async function getAppDirectory(force = false) {
  const now = Date.now();
  if (!force && cache && now - cacheAt < TTL_MS) return cache;
  if (pending) return pending;
  pending = base44.functions.invoke('getAppDirectory', {}).then(result => {
    let payload = result?.data || result || {};
    // Base44 function responses can be wrapped once more by different SDK builds.
    // Unwrap that envelope so directory joins never silently become an empty list.
    if (!Array.isArray(payload.users) && payload?.data && typeof payload.data === 'object') {
      payload = payload.data;
    }
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
  officerCache = null;
  officerCacheAt = 0;
}

export async function listOfficerDirectory(sort = 'last_name', limit = 1000, force = false) {
  const now = Date.now();
  if (!force && officerCache && now - officerCacheAt < TTL_MS) {
    return sortRows(officerCache, sort).slice(0, Number(limit) || 1000);
  }
  if (!officerPending) {
    officerPending = base44.functions.invoke('getOfficerDirectory', {}).then(result => {
      const payload = result?.data || result || {};
      if (payload.error) throw new Error(payload.error);
      officerCache = Array.isArray(payload.officers) ? payload.officers : [];
      officerCacheAt = Date.now();
      return officerCache;
    }).finally(() => { officerPending = null; });
  }
  const officers = await officerPending;
  return sortRows(officers, sort).slice(0, Number(limit) || 1000);
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

export const listDirectoryUsers = async (sort, limit) => {
  let rows = [];
  try {
    rows = await listBucket('users', sort, limit);
  } catch (error) {
    console.warn('[Directory] Full user directory unavailable; retaining the signed-in identity.', error?.message || error);
  }

  // The authenticated user is the immutable fallback for every ID-based join.
  // This protects reports, schedules, posts, chat, and performance views if a
  // directory request is delayed or rate-limited while the page is mounting.
  try {
    const me = await base44.auth.me();
    if (me?.id && !rows.some(row => String(row?.id) === String(me.id))) rows = [...rows, me];
  } catch {}

  return sortRows(rows, sort).slice(0, Number(limit) || 1000);
};
export const filterDirectoryUsers = (query, sort, limit) => filterBucket('users', query, sort, limit);
export const listDirectoryLocations = (sort, limit) => listBucket('locations', sort, limit);
export const filterDirectoryLocations = (query, sort, limit) => filterBucket('locations', query, sort, limit);
export const listDirectoryDivisions = (sort, limit) => listBucket('divisions', sort, limit);
export const filterDirectoryDivisions = (query, sort, limit) => filterBucket('divisions', query, sort, limit);
