import { base44 } from '@/api/base44Client';
import { getOfficerPreviewProfile } from '@/utils/officerPreview';
import { withRequestTimeout } from '@/lib/requestTimeout';

let cache = null;
let cacheAt = 0;
let pending = null;
let officerCache = null;
let officerCacheAt = 0;
let officerPending = null;
let supervisorOfficerCache = null;
let supervisorOfficerCacheAt = 0;
let supervisorOfficerPending = null;
// Directory data changes infrequently and every management mutation explicitly
// invalidates this cache. A longer TTL prevents each page transition from reloading
// five large directory entities and competing with CAD/time-clock requests.
const TTL_MS = 10 * 60_000;
const STALE_CACHE_MAX_MS = 24 * 60 * 60_000;
const DIRECTORY_STORAGE_KEY = 'bps:app-directory:last-good:v2';

function readPersistedDirectory() {
  try {
    const parsed = JSON.parse(localStorage.getItem(DIRECTORY_STORAGE_KEY) || 'null');
    if (!parsed?.data || !parsed?.savedAt) return null;
    if (Date.now() - Number(parsed.savedAt) > STALE_CACHE_MAX_MS) return null;
    return parsed;
  } catch { return null; }
}

function persistDirectory(data) {
  try { localStorage.setItem(DIRECTORY_STORAGE_KEY, JSON.stringify({ savedAt: Date.now(), data })); } catch {}
}

const persistedDirectory = typeof window !== 'undefined' ? readPersistedDirectory() : null;
if (persistedDirectory?.data) {
  cache = persistedDirectory.data;
  cacheAt = Number(persistedDirectory.savedAt || 0);
}

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

export function recordBelongsToDirectoryUser(user, record, extraReferences = []) {
  if (!user || !record) return false;
  const references = [
    record.created_by_id,
    record.created_by,
    record.created_by_email,
    record.officer_email,
    record.submitted_by,
    record.submitted_by_email,
    record.reporting_officer_email,
    record.primary_officer_id,
    record.primary_officer_email,
    ...(Array.isArray(extraReferences) ? extraReferences : [extraReferences]),
  ];
  return references.some(reference => directoryUserMatches(user, reference));
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
  if (pending) return (!force && cache) ? cache : pending;
  const refresh = withRequestTimeout(base44.functions.invoke('getAppDirectory', {}), 15000, 'App directory request').then(result => {
    let payload = result?.data || result || {};
    // Base44 function responses can be wrapped once more by different SDK builds.
    // Unwrap that envelope so directory joins never silently become an empty list.
    if (!Array.isArray(payload.users) && payload?.data && typeof payload.data === 'object') {
      payload = payload.data;
    }
    if (payload.error) throw new Error(payload.error);
    const degraded = new Set(payload?.meta?.degraded_sources || []);
    const next = {
      users: Array.isArray(payload.users) ? payload.users : [],
      locations: Array.isArray(payload.locations) ? payload.locations : [],
      divisions: Array.isArray(payload.divisions) ? payload.divisions : [],
      meta: payload.meta || {},
    };
    // A partial directory refresh must never erase previously verified roster/site
    // data. Keep the last good bucket only for the source that failed.
    if (cache) {
      if (degraded.has('company employees') && Array.isArray(cache.users) && cache.users.length) next.users = cache.users;
      if (degraded.has('locations') && Array.isArray(cache.locations) && cache.locations.length) next.locations = cache.locations;
      if (degraded.has('divisions') && Array.isArray(cache.divisions) && cache.divisions.length) next.divisions = cache.divisions;
    }
    cache = next;
    cacheAt = Date.now();
    persistDirectory(cache);
    return cache;
  });
  pending = refresh.finally(() => { pending = null; });
  // Stale-while-revalidate: previously verified directory/site data paints
  // immediately while a fresh copy is fetched in the background. Management
  // mutations explicitly invalidate this cache, so normal navigation never needs
  // to blank the screen waiting for the directory function.
  if (!force && cache && now - cacheAt < STALE_CACHE_MAX_MS) {
    pending.catch(error => console.warn('[Directory] Background refresh failed; keeping last verified directory.', error?.message || error));
    return cache;
  }
  return pending;
}

async function resolveAuthenticatedDirectoryUser(authenticated, force = false) {
  if (!authenticated?.id) return authenticated;
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

export async function getAuthenticatedDirectoryUser(force = false) {
  const authenticated = await withRequestTimeout(base44.auth.me(), 12000, 'Directory authentication');
  return resolveAuthenticatedDirectoryUser(authenticated, force);
}

export async function getCurrentDirectoryUser(force = false) {
  const authenticated = await withRequestTimeout(base44.auth.me(), 12000, 'Directory authentication');
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

  return resolveAuthenticatedDirectoryUser(authenticated, force);
}

export function invalidateAppDirectory() {
  cache = null;
  cacheAt = 0;
  try { localStorage.removeItem(DIRECTORY_STORAGE_KEY); } catch {}
  officerCache = null;
  officerCacheAt = 0;
  supervisorOfficerCache = null;
  supervisorOfficerCacheAt = 0;
}

// Directory-backed pages share a five-minute in-memory cache. Clear it centrally
// whenever an account/location/division management write succeeds so one screen
// can never keep stale people/site data after another screen changes it.
if (typeof window !== 'undefined' && !window.__bpsDirectorySyncInstalled) {
  const shouldClearDirectory = detail => {
    const kind = String(detail?.kind || '');
    const name = String(detail?.name || '');
    const method = String(detail?.method || '').toLowerCase();
    const remote = detail?.remote === true;
    if (kind === 'entity') {
      if (!['User', 'Location', 'Division', 'OfficerRoster'].includes(name)) return false;
      // Realtime User updates are often PTO/status metadata changes that do not
      // alter the directory roster. Do not throw away the 10-minute directory
      // cache for every background field update. Explicit management functions
      // below still invalidate immediately, and create/delete events still do.
      if (remote && method === 'update') return false;
      return true;
    }
    if (kind === 'function') return [
      'updateUser',
      'createPortalAccount',
      'manageHRDivisions',
      'manageLocations',
      'manageClientAssignments',
      'manageOfficerCertifications',
      'syncCertToOfficer',
    ].includes(name);
    return false;
  };
  const handleDirectoryChange = event => {
    if (shouldClearDirectory(event?.detail)) invalidateAppDirectory();
  };
  window.addEventListener('bps-data-changed', handleDirectoryChange);
  try {
    const channel = new BroadcastChannel('bps-pathfinder-data-sync');
    channel.addEventListener('message', event => {
      if (shouldClearDirectory(event?.data)) invalidateAppDirectory();
    });
    window.__bpsDirectorySyncChannel = channel;
  } catch {}
  window.__bpsDirectorySyncInstalled = true;
}

export async function listOfficerDirectory(sort = 'last_name', limit = 1000, force = false) {
  const now = Date.now();
  if (!force && officerCache && now - officerCacheAt < TTL_MS) {
    return sortRows(officerCache, sort).slice(0, Number(limit) || 1000);
  }
  if (!officerPending) {
    officerPending = withRequestTimeout(base44.functions.invoke('getOfficerDirectory', {}), 15000, 'Officer directory request').then(result => {
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
    supervisorOfficerPending = withRequestTimeout(base44.functions.invoke('getSupervisorScopedTasks', { peopleOnly: true }), 15000, 'Supervisor directory request').then(result => {
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
  const degraded = new Set(directory?.meta?.degraded_sources || []);
  const sourceByBucket = { users: 'company employees', locations: 'locations', divisions: 'divisions' };
  const entityByBucket = { users: 'User', locations: 'Location', divisions: 'Division' };
  if (!rows.length && degraded.has(sourceByBucket[bucket]) && entityByBucket[bucket]) {
    try {
      rows = await base44.entities[entityByBucket[bucket]].list(sort, Number(limit) || 1000);
    } catch (error) {
      console.warn(`[Directory] Direct ${bucket} fallback unavailable:`, error?.message || error);
    }
  }
  rows = sortRows(rows || [], sort);
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

  // If the composite directory is temporarily degraded, fall back to the User
  // entity itself before collapsing to only the signed-in identity. Officer
  // pickers, HR dropdowns, planned shifts, fleet, and rank structure all require
  // the complete roster to remain usable during a directory-function outage.
  if (!rows.length) {
    try {
      const direct = await withRequestTimeout(
        base44.entities.User.list(sort || 'last_name', Number(limit) || 1000),
        15000,
        'Direct user directory request'
      );
      if (Array.isArray(direct) && direct.length) rows = direct;
    } catch (error) {
      if (strict) throw error;
      console.warn('[Directory] Direct user fallback unavailable:', error?.message || error);
    }
  }

  if (!rows.length && !strict) {
    try {
      const me = await withRequestTimeout(base44.auth.me(), 12000, 'Directory user request');
      if (me?.id) rows = [me];
    } catch {}
  }

  return sortRows(rows, sort).slice(0, Number(limit) || 1000);
};
export const filterDirectoryUsers = (query, sort, limit) => filterBucket('users', query, sort, limit);
export const listDirectoryLocations = (sort, limit) => listBucket('locations', sort, limit);
export const filterDirectoryLocations = (query, sort, limit) => filterBucket('locations', query, sort, limit);
export const listDirectoryDivisions = (sort, limit) => listBucket('divisions', sort, limit);
export const filterDirectoryDivisions = (query, sort, limit) => filterBucket('divisions', query, sort, limit);
