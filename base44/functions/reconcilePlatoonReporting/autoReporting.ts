// Regional platoon reporting assignments. A supervisor must be the closest
// available higher rank; peers and company command are never eligible.
const chain=['colonel','lt colonel','major','captain','lieutenant','first sergeant','sergeant','corporal','senior officer','officer','unarmed officer'];
const normalize=(value:any)=>String(value||'').trim().toLowerCase().replace(/\./g,'').replace(/\s+/g,' ');
const level=(value:any)=>{const name=normalize(value);return chain.indexOf(['lieutenant colonel','lt col'].includes(name)?'lt colonel':name);};
const number=(value:any)=>Number(value)>0&&Number.isFinite(Number(value))?Number(value):Number.MAX_SAFE_INTEGER;
const label=(person:any)=>[person.rank,person.last_name||person.first_name].filter(Boolean).join(' ')+(person.unit_number?' · Unit '+person.unit_number:'');
export function autoReportingSelection(person:any,roster:any[]){
 const region=normalize(person?.division),platoon=normalize(person?.platoon),levelOfPerson=level(person?.rank);
 if(!region||!platoon||platoon==='command'||levelOfPerson<0||levelOfPerson<=2)return {supervisor:null,next:null};
 const eligible=(roster||[]).filter(candidate=>candidate.id!==person.id&&!candidate.termination_date
   &&normalize(candidate.employment_status)!=='terminated'
   &&normalize(candidate.division)===region&&normalize(candidate.platoon)===platoon
   &&level(candidate.rank)>=3&&level(candidate.rank)<levelOfPerson);
 const choose=(target:any,pool:any[])=>{
   const nearest=pool.length?Math.max(...pool.map(item=>level(item.rank))):-1;
   if(nearest<0)return null;
   const candidates=pool.filter(item=>level(item.rank)===nearest);
   const affinity=(candidate:any)=>normalize(target.substation)&&normalize(candidate.substation)===normalize(target.substation)?0:
     normalize(target.subdivision)&&normalize(candidate.subdivision)===normalize(target.subdivision)?1:2;
   const count=(candidate:any)=>roster.filter(entry=>entry.id!==target.id&&entry.supervisor_id===candidate.id).length;
   candidates.sort((a,b)=>affinity(a)-affinity(b)||count(a)-count(b)||number(a.badge_number)-number(b.badge_number)||number(a.unit_number)-number(b.unit_number)||String(a.id).localeCompare(String(b.id)));
   return candidates[0]||null;
 };
 const supervisor=choose(person,eligible);
 const next=supervisor?choose(supervisor,eligible.filter(candidate=>level(candidate.rank)<level(supervisor.rank))):null;
 return {supervisor,next};
}
export function reportingFields(choice:{supervisor:any,next:any}){
 const supervisor=choice.supervisor,next=choice.next;
 return {
  supervisor_id:supervisor?.id||'',supervisor_email:supervisor?.email||'',supervisor_name:supervisor?label(supervisor):'',
  next_level_supervisor_id:next?.id||'',next_level_supervisor_email:next?.email||'',next_level_supervisor_name:next?label(next):'',
 };
}
