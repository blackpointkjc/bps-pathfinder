export const OPERATIONAL_RANKS = ['Colonel','Lt Colonel','Major','Captain','Lieutenant','First Sergeant','Sergeant','Corporal','Senior officer','Officer','Unarmed Officer'];
export const SHARED_COMMAND_RANKS = new Set(['Colonel','Lt Colonel','Major']);

export const normalizedRoles = user => new Set((user?.additional_roles || []).map(role => String(role).toLowerCase()));

export const isOperationalUser = user => {
  const roles = normalizedRoles(user);
  return !user?.termination_date && OPERATIONAL_RANKS.includes(user?.rank) && roles.has('officer') && roles.has('cad_access');
};

export const displayCommandName = user => `${user?.rank || 'Officer'} ${user?.last_name || user?.first_name || user?.email || ''}`.trim();

export function commandDescendants(currentUser, users = []) {
  if (!currentUser?.id) return [];
  const operational = users.filter(isOperationalUser);
  if (SHARED_COMMAND_RANKS.has(currentUser.rank)) {
    return operational.filter(user => user.id !== currentUser.id);
  }
  const children = new Map();
  for (const user of operational) {
    if (!user.supervisor_id) continue;
    if (!children.has(user.supervisor_id)) children.set(user.supervisor_id, []);
    children.get(user.supervisor_id).push(user);
  }
  const result = [];
  const seen = new Set([currentUser.id]);
  const stack = [...(children.get(currentUser.id) || [])];
  while (stack.length) {
    const person = stack.shift();
    if (!person || seen.has(person.id)) continue;
    seen.add(person.id);
    result.push(person);
    stack.push(...(children.get(person.id) || []));
  }
  return result;
}
