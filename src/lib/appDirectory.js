import { base44 } from '@/api/base44Client';
import { getOfficerPreviewProfile } from '@/utils/officerPreview';

let cache = null;
let cacheAt = 0;
let pending = null;
let officerCache = null;
let officerCacheAt = 0;
let officerPending = null;
let supervisorOfficerCache = null;
let supervisorOfficerCacheAt = 0;
let supervisorOfficerPending = null;
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

export async function getCurrentDirectoryUser(force = false) {
  const authenticated = await base44.auth.me();
  if (!authenticated?.id) return authenticated;

  const roles = new Set((authenticated.additional_roles || []).map(role => String(role).toLowerCase()));
  const preview = (authenticated.role === 'admin' || roles.has('full_access')) ? getOfficerPreviewProfile() : null;
  if (preview?.id) {
    return {
      ...authenticated,
      ...preview,
      id: preview.id,
      auth_id: authenticated.id,
      auth_email: normalizedIdentity(authenticated.email),
      email: primaryDirectoryEmail(preview) || normalizedIdentity(preview.email),
      email_aliases: directoryUserEmails(preview),
      __officer_preview: true,
      __auth_admin_id: authenticated.id,
    };
  }

  try {
    const directory = await getAppDirectory(force);
    const directoryUser = findDirectoryUser(directory?.users, authenticated.id);
    if (!directoryUser) return authenticated;
    return {
      ...authenticated,
      ...directoryUser,
      id: authenticated.id,
      auth_email: normalizedIdentity(authenticated.email),
      email: primaryDirectoryEmail(directoryUser) || normalizedIdentity(authenticated.email),
      email_aliases: [...new Set([
        ...directoryUserEmails(directoryUser),
        normalizedIdentity(authenticated.email),
      ].filter(Boolean))],
    };
  } catch (error) {
    console.warn('[Directory] Linked identity unavailable; using the authenticated user.', error?.message || error);
    return authenticated;
  }
}

export function invalidateAppDirectory() {
  cache = null;
  cacheAt = 0;
  officerCache = null;
  officerCacheAt = 0;
  supervisorOfficerCache = null;
  supervisorOfficerCacheAt = 0;
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

export async function listSupervisorDirectoryOfficers(sort = 'last_name', limit = 1000, force = false) {
  const now = Date.now();
  if (!force && supervisorOfficerCache && now - supervisorOfficerCacheAt < TTL_MS) {
    return sortRows(supervisorOfficerCache, sort).slice(0, Number(limit) || 1000);
  }
  if (!supervisorOfficerPending) {
    supervisorOfficerPending = base44.functions.invoke('getSupervisorScopedTasks', { peopleOnly: true }).then(result => {
      let payload = result?.data || result || {};
      if (!Array.isArray(payload.assignedPeople) && payload?.data && typeof payload.data === 'object') payload = payload.data;
      if (payload.error) throw new Error(payload.error);
      supervisorOfficerCache = Array.isArray(payload.assignedPeople) ? payload.assignedPeople : [];
      supervisorOfficerCacheAt = Date.now();
      return supervisorOfficerCache;
    }).finally(() => { supervisorOfficerPending = null; });
  }
  const officers = await supervisorOfficerPending;
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

export const listDirectoryUsers = async (sort, limit, strict = false) => {
  let rows = [];
  try {
    rows = await listBucket('users', sort, limit);
  } catch (error) {
    if (strict) throw error;
    console.warn('[Directory] Full user directory unavailable; retaining the signed-in identity.', error?.message || error);
  }

  // General identity joins may use the signed-in account as a temporary fallback.
  // Management screens pass strict=true so a failed directory request is shown as
  // an error instead of falsely making every other employee disappear.
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
