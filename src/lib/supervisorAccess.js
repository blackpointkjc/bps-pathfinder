/** UI hint only. Server-side endpoints must independently authorize the actor. */
export function hasSupervisorAccess(user) {
  if (!user) return false;
  const roles = new Set([user.role, ...(Array.isArray(user.additional_roles) ? user.additional_roles : [])].filter(Boolean).map(role => String(role).trim().toLowerCase()));
  const rank = String(user.rank || '').trim().toLowerCase().replace(/[.]/g, '').replace(/\s+/g, ' ');
  return roles.has('admin') || roles.has('full_access') || roles.has('supervisor') || user.is_supervisor === true ||
    ['corporal', 'first sergeant', 'sergeant', 'sgt', 'lieutenant', 'lt', 'lt colonel', 'lt col', 'lieutenant colonel', 'captain', 'major', 'colonel'].includes(rank);
}
