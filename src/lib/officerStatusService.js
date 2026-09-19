import { base44 } from '@/api/base44Client';

const STATUS_KEY = 'bps:pathfinder:last-status-write:v1';
let localInflight = null;

function readLast() {
  try {
    const value = JSON.parse(localStorage.getItem(STATUS_KEY) || 'null');
    return value && typeof value === 'object' ? value : null;
  } catch {
    return null;
  }
}

function writeLast(status) {
  try { localStorage.setItem(STATUS_KEY, JSON.stringify({ status, at: Date.now() })); } catch {}
}

export async function persistOfficerStatus(status, { force = false } = {}) {
  const normalized = String(status || '').trim();
  if (!normalized) throw new Error('A status is required.');

  const execute = async () => {
    const last = readLast();
    if (!force && last?.status === normalized && Date.now() - Number(last.at || 0) < 60_000) {
      return { success: true, status: normalized, suppressed: true, suppressed_reason: 'same_status_recently_saved' };
    }
    const response = await base44.functions.invoke('updateOfficerStatus', { status: normalized });
    const payload = response?.data || response || {};
    if (payload.error) throw new Error(payload.error);
    writeLast(payload.status || normalized);
    return payload;
  };

  if (typeof navigator !== 'undefined' && navigator.locks?.request) {
    return navigator.locks.request('bps-officer-status-write', { mode: 'exclusive' }, execute);
  }
  if (localInflight) return localInflight;
  localInflight = execute().finally(() => { localInflight = null; });
  return localInflight;
}

export function clearOfficerStatusWriteCache() {
  try { localStorage.removeItem(STATUS_KEY); } catch {}
}
