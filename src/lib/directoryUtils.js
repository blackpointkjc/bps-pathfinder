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

export function displayDirectoryName(user) {
  if (!user) return '';
  return [user.first_name, user.last_name].filter(Boolean).join(' ') || user.full_name || user.email || '';
}
