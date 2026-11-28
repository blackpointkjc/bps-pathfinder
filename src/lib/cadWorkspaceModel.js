// Pure CAD presentation helpers; never change the underlying call records.
export const isFieldInitiated = call => /officer|field|mdt|helpm|self|patrol/i.test([call?.source,call?.source_channel].filter(Boolean).join(' '));
export const isOpenIncident = call => !!call&&!call.manual_dismissed&&!call.time_cleared&&!['cleared','cancelled','canceled','closed','completed','resolved'].includes(String(call?.status||'').trim().toLowerCase());
export const isOperationalPropertyAlert=alert=>!!alert?.callId&&!!alert.propertyId&&alert.propertyId!=='public-helpme'&&alert.is_test!==true&&!['resolved','false_alarm','test','inactive','closed'].includes(String(alert.lifecycle_status||'').toLowerCase());
export const needsPropertyAssignment=(call,propertyIds=new Set(),assignmentIds=new Set())=>isOpenIncident(call)&&propertyIds.has(String(call.id))&&!(call.assigned_units||[]).some(Boolean)&&!assignmentIds.has(String(call.id));
export function splitCadIncidents(calls=[],fieldOnly=false,propertyIds=null,ownIds=[]){
 const own=new Set(ownIds.filter(Boolean).map(String));
 const pending=[],active=[];
 for(const call of calls){
  if(!call?.id||!isOpenIncident(call)||(fieldOnly&&!isFieldInitiated(call)))continue;
  if(propertyIds!==null){
   if(needsPropertyAssignment(call,propertyIds))pending.push(call);
   else if(!(call.assigned_units||[]).some(id=>own.has(String(id))))active.push(call);
  }else (Array.isArray(call.assigned_units)&&call.assigned_units.length?active:pending).push(call);
 }
 return {pending,active};
}
export const cadDisplayUnitState = unit => unit?.connection_stale||unit?.presence_state==='stale'?'stale':unit?.dispatch_hold_new_calls?'hold':!(unit?.presence_online===true||unit?.session_active===true)||unit?.session_active===false||unit?.presence_state==='offline'?'offline':String(unit?.status||'unknown').toLowerCase();
