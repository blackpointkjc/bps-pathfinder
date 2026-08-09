import { base44 } from '@/api/base44Client';

export async function trainingCreate(entity, data) {
  const result = await base44.functions.invoke('manageTrainingRecords', { entity, action: 'create', data });
  const payload = result?.data || result || {};
  if (payload.error) throw new Error(payload.error);
  return payload.record;
}

export async function trainingUpdate(entity, id, data) {
  const result = await base44.functions.invoke('manageTrainingRecords', { entity, action: 'update', id, data });
  const payload = result?.data || result || {};
  if (payload.error) throw new Error(payload.error);
  return payload.record;
}

export async function trainingDelete(entity, id) {
  const result = await base44.functions.invoke('manageTrainingRecords', { entity, action: 'delete', id });
  const payload = result?.data || result || {};
  if (payload.error) throw new Error(payload.error);
  return payload;
}

export async function trainingBulkCreate(entity, data) {
  const result = await base44.functions.invoke('manageTrainingRecords', { entity, action: 'bulkCreate', data });
  const payload = result?.data || result || {};
  if (payload.error) throw new Error(payload.error);
  return payload.records || [];
}
