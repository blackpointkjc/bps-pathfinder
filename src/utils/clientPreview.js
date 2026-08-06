import { base44 } from '@/api/base44Client';

const KEY = 'bps-client-preview-user-id';

export async function getClientPortalUser() {
  const authUser = await base44.auth.me();
  if (authUser?.role !== 'admin') return authUser;
  const selectedId = localStorage.getItem(KEY);
  if (!selectedId) return authUser;
  const users = await base44.entities.User.list('-last_updated', 500);
  return users.find(user => user.id === selectedId) || authUser;
}

export function getClientPreviewId() {
  return localStorage.getItem(KEY) || '';
}

export function setClientPreviewId(id) {
  if (id) localStorage.setItem(KEY, id);
  else localStorage.removeItem(KEY);
  window.dispatchEvent(new CustomEvent('bps-client-preview-change', { detail: { id: id || '' } }));
}
