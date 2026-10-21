export function canEditIncidentPriority(user) {
 const roles = new Set((user?.additional_roles || []).map(role => String(role).trim().toLowerCase()));
 return String(user?.role || '').trim().toLowerCase() === 'dispatch' || user?.dispatch_role === true || roles.has('dispatch');
}
