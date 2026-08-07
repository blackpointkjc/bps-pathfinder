import { base44 } from '@/api/base44Client';

const KEY = 'bps-client-preview-user-id';

export async function getClientPortalUser() {
  const authUser = await base44.auth.me();
  const selectedId = authUser?.role === 'admin' ? localStorage.getItem(KEY) : '';
  const users = selectedId ? await base44.entities.User.list('-last_updated', 500) : [];
  const selectedUser = selectedId ? users.find(user => user.id === selectedId) : null;
  const portalUser = selectedUser || authUser;

  // Client assignments may live on the User record, the Location record, or both.
  // Merge all sources so Admin Preview sees the same properties the client owns.
  const locations = await base44.entities.Location.list('site_name', 500).catch(() => []);
  const email = String(portalUser?.email || '').toLowerCase();
  const userAssigned = [
    ...(Array.isArray(portalUser?.assigned_locations) ? portalUser.assigned_locations : []),
    ...(portalUser?.assigned_location ? [portalUser.assigned_location] : []),
  ];
  const locationAssigned = (locations || [])
    .filter(location => String(location.assigned_client_email || '').toLowerCase() === email)
    .map(location => location.site_name)
    .filter(Boolean);
  const assignedLocations = [...new Set([...userAssigned, ...locationAssigned].filter(Boolean))];

  return {
    ...portalUser,
    assigned_locations: assignedLocations,
    assigned_location: portalUser?.assigned_location || assignedLocations[0] || '',
    __client_preview: Boolean(selectedUser),
    __auth_admin_id: selectedUser ? authUser.id : undefined,
  };
}

export function getClientPreviewId() {
  return localStorage.getItem(KEY) || '';
}

export function setClientPreviewId(id) {
  if (id) localStorage.setItem(KEY, id);
  else localStorage.removeItem(KEY);
  window.dispatchEvent(new CustomEvent('bps-client-preview-change', { detail: { id: id || '' } }));
}
