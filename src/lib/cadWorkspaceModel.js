// Pure CAD presentation helpers; never change the underlying call records.
export const isFieldInitiated = call => /officer|field|mdt|helpm|self|patrol/i.test([call?.source,call?.source_channel].filter(Boolean).join(' '));
export const isOpenIncident = call => !!call&&!call.manual_dismissed&&!call.time_cleared&&!['cleared','cancelled','canceled','closed','completed','resolved'].includes(String(call?.status||'').trim().toLowerCase());
export const isOperationalPropertyAlert=alert=>!!alert?.callId&&!!alert.propertyId&&alert.propertyId!=='public-helpme'&&alert.is_test!==true&&!['resolved','false_alarm','test','inactive','closed'].includes(String(alert.lifecycle_status||'').toLowerCase());
export const assignedCadUnitIds=call=>[...new Set([...(Array.isArray(call?.assigned_units)?call.assigned_units:[]),...(Array.isArray(call?.pathfinder_assignment_unit_ids)?call.pathfinder_assignment_unit_ids:[])].filter(Boolean).map(String))];
export const isVerifiedPropertyCall=(call,propertyIds=new Set())=>call?.pathfinder_property_alert===true||propertyIds.has(String(call?.id));
export const needsPropertyAssignment=(call,propertyIds=new Set(),assignmentIds=new Set())=>isOpenIncident(call)&&isVerifiedPropertyCall(call,propertyIds)&&assignedCadUnitIds(call).length===0&&!assignmentIds.has(String(call.id));
export function splitCadIncidents(calls=[],fieldOnly=false,propertyIds=null,ownIds=[]){
 const own=new Set(ownIds.filter(Boolean).map(String));
 const pending=[],active=[];
 for(const call of calls){
  if(!call?.id||!isOpenIncident(call)||(fieldOnly&&!isFieldInitiated(call)))continue;
  if(propertyIds!==null){
   if(needsPropertyAssignment(call,propertyIds))pending.push(call);
   else if(!assignedCadUnitIds(call).some(id=>own.has(String(id))))active.push(call);
  }else (Array.isArray(call.assigned_units)&&call.assigned_units.length?active:pending).push(call);
 }
 return {pending,active};
}
export const cadDisplayUnitState = unit => unit?.connection_stale||unit?.presence_state==='stale'?'stale':unit?.dispatch_hold_new_calls?'hold':!(unit?.presence_online===true||unit?.session_active===true)||unit?.session_active===false||unit?.presence_state==='offline'?'offline':String(unit?.status||'unknown').toLowerCase();

export function recentPropertyRows(rows=[],now=Date.now()){
 const stamp=c=>{const raw=String(c?.time_received||'').trim();return raw?Date.parse(/(?:Z|[+-]\\d{2}:?\\d{2})$/i.test(raw)?raw:raw+'Z'):NaN;};
 const result=new Map();
 for(const c of rows){const at=stamp(c);if(c?.id&&Number.isFinite(at)&&at>=now-12*3600000&&at<=now)result.set(String(c.id),c);}
 return [...result.values()].sort((a,b)=>stamp(a)-stamp(b)||String(a.id).localeCompare(String(b.id)));
}
