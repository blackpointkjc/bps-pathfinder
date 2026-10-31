import { rankLevel } from './rankPolicy.js';
const norm=value=>String(value||'').trim().toLowerCase();
const numeric=value=>Number(value)>0&&Number.isFinite(Number(value))?Number(value):Number.MAX_SAFE_INTEGER;
// Read-only preview of updateUser/autoReporting.ts. Backend owns the saved
// assignment and independently enforces the same regional Platoon hierarchy.
export function previewAutomaticSupervisor(person, roster = []) {
  const rank=rankLevel(person?.rank),region=norm(person?.division),platoon=norm(person?.platoon);
  if(rank<3||rank>=999||!region||!platoon||platoon==='command')return null;
  const eligible=roster.filter(candidate=>candidate?.id!==person?.id&&!candidate.termination_date
    &&norm(candidate.employment_status)!=='terminated'
    &&norm(candidate.division)===region&&norm(candidate.platoon)===platoon
    &&rankLevel(candidate.rank)>=3&&rankLevel(candidate.rank)<rank);
  if(!eligible.length)return null;
  const nearest=Math.max(...eligible.map(candidate=>rankLevel(candidate.rank)));
  const affinity=candidate=>norm(person.substation)&&norm(candidate.substation)===norm(person.substation)?0:
    norm(person.subdivision)&&norm(candidate.subdivision)===norm(person.subdivision)?1:2;
  const loads=candidate=>roster.filter(entry=>entry.id!==person.id&&entry.supervisor_id===candidate.id).length;
  return eligible.filter(candidate=>rankLevel(candidate.rank)===nearest).sort((a,b)=>affinity(a)-affinity(b)
    ||loads(a)-loads(b)||numeric(a.badge_number)-numeric(b.badge_number)
    ||numeric(a.unit_number)-numeric(b.unit_number)||String(a.id).localeCompare(String(b.id)))[0]||null;
}
