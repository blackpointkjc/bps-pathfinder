import { base44 } from '@/api/base44Client';

export async function loadLegalRecordHistory(type) {
  const response = await base44.functions.invoke('getLegalRecordHistory', { type, action: 'list' });
  const payload = response?.data || response || {};
  if (payload.error) throw new Error(payload.error);
  return Array.isArray(payload.rows) ? payload.rows : [];
}

export async function updateLegalRecord(type, id, data) {
  const response = await base44.functions.invoke('getLegalRecordHistory', { type, action: 'update', id, data });
  const payload = response?.data || response || {};
  if (payload.error) throw new Error(payload.error);
  return payload.record;
}
