import { base44 } from '@/api/base44Client';

// Single client gateway for Pathfinder live officer location.
// No page/component should read/write ActiveOfficer or invoke getOnDutyUnits/logLocation directly.

export async function publishOfficerLocation(data = {}) {
  const response = await base44.functions.invoke('logLocation', data);
  const payload = response?.data || response || {};
  if (payload.error) throw new Error(payload.error);
  return payload;
}

export async function endOfficerLocationSession() {
  const response = await base44.functions.invoke('logLocation', { end_session: true });
  const payload = response?.data || response || {};
  if (payload.error) throw new Error(payload.error);
  return payload;
}

export async function getOfficerLocationSnapshot({ locationOnly = false } = {}) {
  const response = await base44.functions.invoke('getOnDutyUnits', locationOnly ? { location_only: true } : {});
  const payload = response?.data || response || {};
  if (payload.error) throw new Error(payload.error);
  return payload;
}

export async function getOfficerLocationHistory(officerEmail) {
  if (!officerEmail) return [];
  const response = await base44.functions.invoke('getOnDutyUnits', { history_email: officerEmail });
  const payload = response?.data || response || {};
  if (payload.error) throw new Error(payload.error);
  return Array.isArray(payload.history) ? payload.history : [];
}

export function subscribeOfficerLocationChanges(listener) {
  if (typeof listener !== 'function') return () => {};
  try {
    const unsubscribe = base44.entities.ActiveOfficer.subscribe(listener);
    return typeof unsubscribe === 'function' ? unsubscribe : () => {};
  } catch {
    return () => {};
  }
}
