const KEY = 'bps-officer-preview-user-id';
const PROFILE_KEY = 'bps-officer-preview-profile';

function storage() {
  return typeof window !== 'undefined' ? window.localStorage : null;
}

export function getOfficerPreviewId() {
  try {return storage()?.getItem(KEY) || '';} catch {return '';}
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
    try {target.setItem(KEY, String(id));} catch { /* Browser storage can be full. Preview selection still works in current session. */ }
    // Profile may contain extensive HR/certification/photograph data and should
    // never be serialized in full into localStorage (5MB quota on many browsers).
    if (profile) {
      const small={id:profile.id,email:profile.email,first_name:profile.first_name,last_name:profile.last_name,
        full_name:profile.full_name,rank:profile.rank,unit_number:profile.unit_number,role:profile.role,
        additional_roles:profile.additional_roles,auth_email:profile.auth_email};
      try {target.setItem(PROFILE_KEY,JSON.stringify(small));}
      catch {try {target.removeItem(PROFILE_KEY);} catch {}}
    }
  } else {
    try {target.removeItem(KEY);target.removeItem(PROFILE_KEY);} catch {}
  }
  window.dispatchEvent(new CustomEvent('bps-officer-preview-change', { detail: { id: id || '' } }));
}
