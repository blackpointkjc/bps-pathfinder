// Explicit action policies for CAD mixed endpoints. Do not classify a mutation
// as a read based on the name alone.
const CAD_READS={getCallHistoryFeed:new Set(['','recent_property_incidents','call_details','list','history','search']),sharedCadTimeline:new Set(['read']),getActiveDispatchCalls:new Set(['','list']),getMyDispatchQueue:new Set(['','list']),getOnDutyUnits:new Set(['','list']),getWelcomeBriefingData:new Set(['','get','list'])};
export function cadReadAction(name,action=''){return CAD_READS[name]?.has(action)??false;}
export function isCriticalCadRead(meta){return meta?.kind==='function'&&['getActiveDispatchCalls','getMyDispatchQueue','getOnDutyUnits','sharedCadTimeline'].includes(meta.name)&&cadReadAction(meta.name,meta.action||'');}
export function isCadWorkspace(page){return ['CADCenter','CommandDashboard','DispatchCenter','OfficerDispatchQueue','Navigation','UnitStatus'].includes(page);}
export function retryDeadline(now,header,message,fallback=8000){
 const value=String(header??'').trim();
 const fromMessage=String(message||'').match(/retry after\s+(\d+(?:\.\d+)?)\s*(?:s|sec|seconds)/i)?.[1];
 if(value){const seconds=Number(value);const date=Number.isFinite(seconds)?now+Math.max(0,seconds)*1000:Date.parse(value);if(Number.isFinite(date))return Math.max(now,date);}
 if(fromMessage!==undefined)return now+Number(fromMessage)*1000;
 return now+fallback;
}
export function cadConnectionProblem({now,confirmedAt,failure,criticalQueued,criticalWait,criticalRetryAt,officerError=false}){
 const stale=!confirmedAt||now-confirmedAt>30000;
 return Boolean(officerError||(stale&&(failure||criticalQueued>0&&(criticalWait>=12000||criticalRetryAt>now))));
}
