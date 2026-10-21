import { classifyCall } from '@/lib/cadCallTypes';
export function incidentPriority(call) {
 if(call.priority_override && call.priority)return call.priority;
 return classifyCall((call.incident||'')+' '+(call.description||'')).matched_type?.priority || call.priority || 'medium';
}
