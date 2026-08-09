export function isOperationalOfficer(user) {
  if (!user?.email || user.termination_date) return false;
  const roles = new Set((user.additional_roles || []).map(role => String(role).toLowerCase()));
  const rank = String(user.rank || '').trim().toLowerCase();
  const type = String(user.user_type || user.account_type || user.portal_type || '').toLowerCase();
  const status = String(user.account_status || '').toLowerCase();
  if (roles.has('client') || roles.has('student') || roles.has('pending')) return false;
  if (['client', 'student', 'pending'].includes(type) || status === 'pending') return false;
  const operationalRanks = new Set([
    'officer','unarmed officer','senior officer','corporal','sergeant','first sergeant',
    'lieutenant','captain','major','lt colonel','lieutenant colonel','colonel','supervisor'
  ]);
  return roles.has('officer') || roles.has('cad_access') || roles.has('supervisor') || operationalRanks.has(rank);
}

export function hasOfficerAdditionalRole(user) {
  return Boolean(user?.email && !user?.termination_date && (user.additional_roles || []).map(role => String(role).toLowerCase()).includes('officer'));
}

export function isClientAccount(user) {
  const roles = new Set((user?.additional_roles || []).map(role => String(role).toLowerCase()));
  const rank = String(user?.rank || '').trim().toLowerCase();
  const type = String(user?.user_type || user?.account_type || user?.portal_type || '').trim().toLowerCase();
  return roles.has('client') || rank === 'client' || type === 'client';
}

export function isInternalMember(user) {
  if (!user?.email || user.termination_date || isClientAccount(user)) return false;
  const roles = new Set((user.additional_roles || []).map(role => String(role).toLowerCase()));
  const rank = String(user.rank || '').trim().toLowerCase();
  const type = String(user.user_type || user.account_type || user.portal_type || '').trim().toLowerCase();
  if (roles.has('student') || rank === 'student' || type === 'student' || type === 'pending') return false;
  return user.role === 'admin' || roles.has('officer') || roles.has('hr') || roles.has('support') || roles.has('support_staff') || roles.has('accounting') || roles.has('trainer') || roles.has('supervisor') || roles.has('full_access') || String(user.employment_status || '').toLowerCase() === 'active';
}

export function displayDirectoryName(user) {
  if (!user) return '';
  return [user.first_name, user.last_name].filter(Boolean).join(' ') || user.full_name || user.email || '';
}
