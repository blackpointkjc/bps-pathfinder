import { base44 } from '@/api/base44Client';

export async function loadLegalRecordHistory(type) {
  const response = await base44.functions.invoke('getLegalRecordHistory', { type });
  const payload = response?.data || response || {};
  if (payload.error) throw new Error(payload.error);
  return Array.isArray(payload.rows) ? payload.rows : [];
}
