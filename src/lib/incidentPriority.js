import { classifyCall } from '@/lib/cadCallTypes';
const levels={p1:'critical','1':'critical',critical:'critical',p2:'high','2':'high',high:'high',p3:'medium','3':'medium',medium:'medium',standard:'medium',normal:'medium',p4:'low','4':'low',low:'low'};
export const normalizeIncidentPriority=value=>levels[String(value??'').trim().toLowerCase()]||null;
export function incidentPriority(call={}) {
 const saved=normalizeIncidentPriority(call.priority);
 if(call.priority_override&&saved)return saved;
 return normalizeIncidentPriority(classifyCall((call.incident||'')+' '+(call.description||'')).matched_type?.priority)||saved||'medium';
}
export const priorityCode=call=>({critical:'P1',high:'P2',medium:'P3',low:'P4'}[incidentPriority(call)]);
