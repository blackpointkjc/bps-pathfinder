const KEY = 'bps-officer-preview-user-id';
const PROFILE_KEY = 'bps-officer-preview-profile';

function storage() {
  return typeof window !== 'undefined' ? window.localStorage : null;
}

export function getOfficerPreviewId() {
  return storage()?.getItem(KEY) || '';
}

export function getOfficerPreviewProfile() {
  const selectedId = getOfficerPreviewId();
  if (!selectedId) return null;
  try {
    const profile = JSON.parse(storage()?.getItem(PROFILE_KEY) || 'null');
    return String(profile?.id || '') === String(selectedId) ? profile : null;
  } catch {
    return null;
  }
}

export function getOfficerPreviewRequest() {
  const profile = getOfficerPreviewProfile();
  return profile?.id ? { preview_user_id: profile.id } : {};
}

export function setOfficerPreviewId(id, profile = null) {
  const target = storage();
  if (!target) return;
  if (id) {
    target.setItem(KEY, String(id));
    if (profile) target.setItem(PROFILE_KEY, JSON.stringify(profile));
  } else {
    target.removeItem(KEY);
    target.removeItem(PROFILE_KEY);
  }
  window.dispatchEvent(new CustomEvent('bps-officer-preview-change', { detail: { id: id || '' } }));
}
