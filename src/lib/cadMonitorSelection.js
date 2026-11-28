import {isOpenIncident} from './cadWorkspaceModel.js';
export const monitorStorageKey=id=>'bps:cad-monitor-pins:'+encodeURIComponent(String(id||''));
export function normalizeMonitorIds(ids){return Array.isArray(ids)?[...new Set(ids.filter(id=>typeof id==='string'&&id.trim()).map(id=>id.trim()))]:[];}
export function toggleMonitorId(ids,id){const current=normalizeMonitorIds(ids);if(!id)return current;const key=String(id);return current.includes(key)?current.filter(x=>x!==key):[...current,key];}
export function monitoredIncidents(calls,ids){const byId=new Map((calls||[]).filter(c=>c?.id&&isOpenIncident(c)).map(c=>[String(c.id),c]));return normalizeMonitorIds(ids).map(id=>byId.get(id)).filter(Boolean);}
