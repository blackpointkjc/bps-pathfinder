import { base44 } from '@/api/base44Client';

async function invoke(payload) {
  const result = await base44.functions.invoke('manageAccountingRecords', payload);
  const data = result?.data || result || {};
  if (data.error) throw new Error(data.error);
  return data;
}

export async function accountingCreate(entity, data) {
  return (await invoke({ entity, action: 'create', data })).record;
}

export async function accountingBulkCreate(entity, data) {
  return (await invoke({ entity, action: 'bulkCreate', data })).records || [];
}

export async function accountingUpdate(entity, id, data) {
  return (await invoke({ entity, action: 'update', id, data })).record;
}

export async function accountingDelete(entity, id) {
  return invoke({ entity, action: 'delete', id });
}
