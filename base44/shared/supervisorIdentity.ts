const SUPERVISOR_RANKS = new Set(['sergeant','first sergeant','lieutenant','lt colonel','lieutenant colonel','captain','major','colonel']);

export const clean = (value: any) => String(value ?? '').trim();
export const lower = (value: any) => clean(value).toLowerCase();
export const rolesOf = (user: any) => new Set((user?.additional_roles || []).map(lower));
export const normalizeRank = (user: any) => lower(user?.rank).replace(/\./g, '').replace(/[_-]+/g, ' ').replace(/\s+/g, ' ');

export const isAdminAccount = (user: any) => user?.role === 'admin' || rolesOf(user).has('full_access');

export const isSupervisorRole = (user: any) =>
  user?.role === 'supervisor' || user?.is_supervisor === true || rolesOf(user).has('supervisor') || SUPERVISOR_RANKS.has(normalizeRank(user));

export const isSupervisorAccount = (user: any) =>
  !!user?.email
  && !user?.termination_date
  && !['terminated', 'on_leave'].includes(lower(user?.employment_status))
  && (isAdminAccount(user) || isSupervisorRole(user));

export const isAvailable = (user: any) => {
  if (!user?.email || user?.termination_date) return false;
  if (['terminated', 'on_leave'].includes(lower(user?.employment_status))) return false;
  if (user?.out_of_office === true) {
    const returnAt = new Date(user?.out_of_office_return || user?.out_of_office_until || 0).getTime();
    if (!Number.isFinite(returnAt) || returnAt > Date.now()) return false;
  }
  return true;
};

export const supervisorDisplayName = (user: any) => {
  const last = clean(user?.last_name) || clean(user?.full_name).split(/\s+/).pop() || '';
  return [clean(user?.rank), last].filter(Boolean).join(' ') || clean(user?.full_name) || clean(user?.email) || 'Supervisor';
};