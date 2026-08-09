import { createClient } from '@base44/sdk';
import { appParams } from '@/lib/app-params';
const { appId, serverUrl, token, functionsVersion } = appParams;

//Create a client with authentication required
export const base44 = createClient({
  appId,
  serverUrl,
  token,
  functionsVersion,
  requiresAuth: false
});

// Force every browser-side email through one backend gateway. That gateway applies
// the Black Point template server-side, so individual pages cannot accidentally
// bypass branding by calling SendEmail directly.
if (base44.integrations?.Core?.SendEmail) {
  base44.integrations.Core.SendEmail = payload => base44.functions.invoke('sendBrandedEmail', payload);
}

// One role-aware directory source for the entire app. Historically each page called
// User/Location/Division directly with different RLS visibility and different filters,
// which caused empty officer/location dropdowns across HR, Training, Supervisor,
// Officer, Client and Accounting. Keep the existing entity API shape so legacy pages
// automatically receive the same authorized directory without one-off page patches.
let directoryCache = null;
let directoryCacheAt = 0;
let directoryPromise = null;
const DIRECTORY_TTL_MS = 15_000;

async function loadAppDirectory(force = false) {
  const now = Date.now();
  if (!force && directoryCache && now - directoryCacheAt < DIRECTORY_TTL_MS) return directoryCache;
  if (directoryPromise) return directoryPromise;
  directoryPromise = base44.functions.invoke('getAppDirectory', {}).then(result => {
    const payload = result?.data || result || {};
    if (payload.error) throw new Error(payload.error);
    directoryCache = {
      users: Array.isArray(payload.users) ? payload.users : [],
      locations: Array.isArray(payload.locations) ? payload.locations : [],
      divisions: Array.isArray(payload.divisions) ? payload.divisions : [],
    };
    directoryCacheAt = Date.now();
    return directoryCache;
  }).finally(() => { directoryPromise = null; });
  return directoryPromise;
}

function sortRows(rows, sort) {
  if (!sort || !Array.isArray(rows)) return rows;
  const desc = String(sort).startsWith('-');
  const field = desc ? String(sort).slice(1) : String(sort);
  return [...rows].sort((a, b) => {
    const av = a?.[field] ?? '';
    const bv = b?.[field] ?? '';
    const cmp = String(av).localeCompare(String(bv), undefined, { numeric: true, sensitivity: 'base' });
    return desc ? -cmp : cmp;
  });
}

function matchesDirectoryQuery(row, query = {}) {
  return Object.entries(query || {}).every(([key, expected]) => {
    const actual = row?.[key];
    if (expected && typeof expected === 'object' && !Array.isArray(expected)) {
      if ('$in' in expected) return expected.$in.includes(actual);
      if ('$ne' in expected) return actual !== expected.$ne;
    }
    return actual === expected;
  });
}

function installDirectoryAdapter(entityName, bucket) {
  const entity = base44.entities?.[entityName];
  if (!entity) return;
  const originalList = entity.list?.bind(entity);
  const originalFilter = entity.filter?.bind(entity);

  entity.list = async (sort, limit) => {
    try {
      const directory = await loadAppDirectory();
      let rows = sortRows(directory[bucket] || [], sort);
      if (Number(limit) > 0) rows = rows.slice(0, Number(limit));
      return rows;
    } catch (error) {
      console.warn(`[Directory] ${entityName}.list fallback`, error?.message || error);
      if (originalList) return originalList(sort, limit);
      return [];
    }
  };

  entity.filter = async (query = {}, sort, limit) => {
    try {
      const directory = await loadAppDirectory();
      let rows = (directory[bucket] || []).filter(row => matchesDirectoryQuery(row, query));
      rows = sortRows(rows, sort);
      if (Number(limit) > 0) rows = rows.slice(0, Number(limit));
      return rows;
    } catch (error) {
      console.warn(`[Directory] ${entityName}.filter fallback`, error?.message || error);
      if (originalFilter) return originalFilter(query, sort, limit);
      return [];
    }
  };
}

installDirectoryAdapter('User', 'users');
installDirectoryAdapter('Location', 'locations');
installDirectoryAdapter('Division', 'divisions');

export function invalidateAppDirectory() {
  directoryCache = null;
  directoryCacheAt = 0;
}
