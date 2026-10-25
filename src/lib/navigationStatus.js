// Only an explicit route to an assigned dispatch call can change duty status.
// Search results, saved properties, map pins and automatic reroutes never do.
export function shouldSetDispatchEnroute(options = {}, user) {
  const call = options.dispatchCall;
  if (options.setEnroute === false || !call?.id || !user?.id) return false;
  return String(user.current_call_id || '') === String(call.id) ||
    (Array.isArray(call.assigned_units) && call.assigned_units.some(id => String(id) === String(user.id)));
}
