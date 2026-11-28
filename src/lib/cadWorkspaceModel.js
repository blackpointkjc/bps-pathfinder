// Pure CAD presentation helpers; never change the underlying call records.
export const isFieldInitiated = call => /officer|field|mdt|helpm|self|patrol/i.test([call?.source,call?.source_channel].filter(Boolean).join(' '));
export const isOpenIncident = call => !['cleared','cancelled','canceled','closed','completed'].includes(String(call?.status||'').trim().toLowerCase());
export function splitCadIncidents(calls=[],fieldOnly=false){
 const pending=[],active=[];
 for(const call of calls){
  if(!call?.id||!isOpenIncident(call)||(fieldOnly&&!isFieldInitiated(call)))continue;
  (Array.isArray(call.assigned_units)&&call.assigned_units.length?active:pending).push(call);
 }
 return {pending,active};
}
export const cadDisplayUnitState = unit => unit?.connection_stale||unit?.presence_state==='stale'?'stale':unit?.dispatch_hold_new_calls?'hold':!(unit?.presence_online===true||unit?.session_active===true)||unit?.session_active===false||unit?.presence_state==='offline'?'offline':String(unit?.status||'unknown').toLowerCase();
