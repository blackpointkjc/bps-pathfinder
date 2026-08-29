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

export function isCompanyEmployeeAccount(user) {
  if (!user?.email || isClientAccount(user)) return false;
  const roles = new Set((user.additional_roles || []).map(role => String(role).toLowerCase()));
  const rank = String(user.rank || '').trim().toLowerCase();
  const type = String(user.user_type || user.account_type || user.portal_type || '').trim().toLowerCase();
  const status = String(user.account_status || '').trim().toLowerCase();
  const officerRanks = new Set([
    'officer','unarmed officer','senior officer','corporal','sergeant','first sergeant',
    'lieutenant','captain','major','lt colonel','lieutenant colonel','colonel','supervisor'
  ]);
  const isOfficer = roles.has('officer') || roles.has('cad_access') || roles.has('supervisor') || officerRanks.has(rank);
  if (isOfficer) return true;
  if (roles.has('student') || rank === 'student' || type === 'student') return false;
  if ((type === 'pending' || status === 'pending') && !user.termination_date) return false;
  return user.role === 'admin'
    || roles.has('hr')
    || roles.has('support')
    || roles.has('support_staff')
    || roles.has('accounting')
    || roles.has('trainer')
    || roles.has('full_access')
    || ['human resources', 'support staff'].includes(rank)
    || String(user.employment_status || '').toLowerCase() === 'active'
    || Boolean(user.termination_date);
}

export function isInternalMember(user) {
  return Boolean(!user?.termination_date && isCompanyEmployeeAccount(user));
}

export function displayDirectoryName(user) {
  if (!user) return '';
  return [user.first_name, user.last_name].filter(Boolean).join(' ') || user.full_name || user.email || '';
}
