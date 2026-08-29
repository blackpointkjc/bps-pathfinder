const norm = value => String(value || '').trim().toLowerCase();

export function buildDirectoryIndex(users = []) {
  const byEmail = new Map();
  const byId = new Map();
  (Array.isArray(users) ? users : []).forEach(user => {
    if (user?.email) byEmail.set(norm(user.email), user);
    if (user?.id != null) byId.set(String(user.id), user);
  });
  return { byEmail, byId };
}

export function operationalName(ref, usersOrIndex = [], options = {}) {
  const index = usersOrIndex?.byEmail ? usersOrIndex : buildDirectoryIndex(usersOrIndex);
  const email = norm(typeof ref === 'object' ? (ref?.officer_email || ref?.email || ref?.created_by || ref?.user_email) : ref);
  const id = String(typeof ref === 'object' ? (ref?.officer_id || ref?.user_id || ref?.created_by_id || ref?.id || '') : ref || '');
  const row = index.byEmail.get(email) || index.byId.get(id);
  const rank = String(row?.rank || '').trim();
  const last = String(row?.last_name || '').trim();
  if (rank && last) return `${rank} ${last}`;
  if (last) return last;
  const unit = row?.unit_number || (typeof ref === 'object' ? ref?.unit_number : '');
  if (unit) return `Unit ${unit}`;
  return options.fallback || 'Officer';
}

export function clientSafeOperationalName(ref, usersOrIndex = []) {
  return operationalName(ref, usersOrIndex, { fallback: 'Assigned Officer' });
}
