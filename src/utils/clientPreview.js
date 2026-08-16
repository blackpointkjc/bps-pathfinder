import { base44 } from '@/api/base44Client';
import { listDirectoryLocations, listDirectoryUsers } from '@/lib/appDirectory';

const KEY = 'bps-client-preview-user-id';
const PROFILE_KEY = 'bps-client-preview-profile';

export async function getClientPortalUser() {
  const authUser = await base44.auth.me();
  const roles = new Set((authUser?.additional_roles || []).map(role => String(role).toLowerCase()));
  const canPreview = authUser?.role === 'admin' || roles.has('full_access');
  if (!canPreview) return authUser;

  const selectedId = localStorage.getItem(KEY) || '';
  if (!selectedId) return authUser;

  try {
    const stored = JSON.parse(localStorage.getItem(PROFILE_KEY) || 'null');
    if (stored?.id === selectedId) return stored;
  } catch (_) {}

  const users = await listDirectoryUsers('-last_updated', 1000);
  const selectedUser = users.find(user => user.id === selectedId);
  if (!selectedUser) return authUser;

  const locations = await listDirectoryLocations('site_name', 1000);
  const email = String(selectedUser.email || '').toLowerCase();
  const assignedLocations = [...new Set([
    ...(Array.isArray(selectedUser.assigned_locations) ? selectedUser.assigned_locations : []),
    ...(selectedUser.assigned_location ? [selectedUser.assigned_location] : []),
    ...(locations || []).filter(location => String(location.assigned_client_email || '').toLowerCase() === email).map(location => location.site_name),
  ].filter(Boolean))];

  const profile = {
    ...selectedUser,
    assigned_locations: assignedLocations,
    assigned_location: selectedUser.assigned_location || assignedLocations[0] || '',
    __client_preview: true,
    __auth_admin_id: authUser.id,
  };
  localStorage.setItem(PROFILE_KEY, JSON.stringify(profile));
  return profile;
}

export function getClientPreviewId() {
  return localStorage.getItem(KEY) || '';
}

export function setClientPreviewId(id, profile = null) {
  if (id) {
    localStorage.setItem(KEY, id);
    if (profile) localStorage.setItem(PROFILE_KEY, JSON.stringify(profile));
  } else {
    localStorage.removeItem(KEY);
    localStorage.removeItem(PROFILE_KEY);
  }
  window.dispatchEvent(new CustomEvent('bps-client-preview-change', { detail: { id: id || '' } }));
}
